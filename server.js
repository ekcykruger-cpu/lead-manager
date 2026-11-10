'use strict';
/* Lead Desk server. Zero dependencies, Node 18+.
   Stores everything in one JSON file (DATA_DIR/data.json). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { OC } = require('./public/outcomes.js');
const { buildLeads } = require('./seed.js');

const PORT = +process.env.PORT || 3000;
let DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
let DATA_FILE = path.join(DATA_DIR, 'data.json');
let STORAGE = { dir: DATA_DIR, persistent: true, error: '' };
function ensureStorage() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
  } catch (e) {
    const alt = path.join(os.tmpdir(), 'lead-desk-data');
    const why = `cannot write to ${DATA_DIR} (${e.code || e.message})`;
    console.error(`WARNING: ${why}. Falling back to ${alt}. Data will be lost on restart. Check that the Railway Volume is mounted at ${DATA_DIR}.`);
    DATA_DIR = alt; DATA_FILE = path.join(alt, 'data.json');
    fs.mkdirSync(alt, { recursive: true });
    STORAGE = { dir: alt, persistent: false, error: why };
  }
}
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const norm = v => String(v || '').replace(/[\s-]/g, '');

class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const bad = (m) => new HttpError(400, m);

/* ---------- data file ---------- */
function defaultSettings() {
  return {
    base: '', path: '/incontactapi/services/v33.0/scripts/start', delim: '|', incl: true, sim: true, override: '', dealerANI: '',
    prefix: 'https://na1.nice-incontact.com/player/#/cxone-player/acd-contacts/',
    call: { scriptPath: '', scriptId: '', skillId: '' },
    sms: { scriptPath: '', scriptId: '', skillId: '', linkBase: '' }
  };
}
let DB;
function saveDB() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(DB, null, 1));
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    console.error('Could not save data file:', e.message);
    STORAGE.persistent = false; STORAGE.error = 'Could not save: ' + e.message;
  }
}
function loadDB() {
  try { DB = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { DB = { leads: buildLeads(), employees: [], links: {} }; }
  const d = defaultSettings(), s = DB.settings || {};
  const call = Object.assign(d.call, s.call || {});
  ['scriptPath', 'scriptId', 'skillId'].forEach(k => { if (s[k] && !call[k]) call[k] = s[k]; });   // migrate older flat settings
  DB.settings = Object.assign(d, s, { call, sms: Object.assign(d.sms, s.sms || {}) });
  ['scriptPath', 'scriptId', 'skillId', 'body'].forEach(k => delete DB.settings[k]);
  delete DB.settings.sms.body;
  DB.employees = DB.employees || [];
  DB.links = DB.links || {};
  saveDB();
}

/* ---------- CXone token + start-script ---------- */
let memToken = '', memSetAt = 0, tokCache = null;
function jwtExp(t) {
  try { const p = JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString('utf8')); return p.exp ? p.exp * 1000 : 0; }
  catch (e) { return 0; }
}
function tokenInfo() { return { source: tokenSource(), setAt: memToken ? memSetAt : 0, exp: memToken ? jwtExp(memToken) : 0 }; }
function tokenSource() {
  if (memToken) return 'session';
  if (process.env.CXONE_BEARER_TOKEN) return 'env-token';
  if (process.env.CXONE_ACCESS_KEY_ID && process.env.CXONE_ACCESS_KEY_SECRET) return 'access-key';
  if (process.env.CXONE_CLIENT_ID && process.env.CXONE_CLIENT_SECRET) return 'client-credentials';
  return 'none';
}
async function getToken() {
  const src = tokenSource();
  if (src === 'none') return null;
  if (src === 'session') {
    const exp = jwtExp(memToken);
    if (exp && exp < Date.now()) throw new Error('The pasted token has expired. Paste a new one on the Admin page');
    return { token: memToken, base: '' };
  }
  if (src === 'env-token') return { token: process.env.CXONE_BEARER_TOKEN, base: '' };
  if (tokCache && tokCache.exp > Date.now() + 60000) return tokCache;
  const e = process.env;
  const url = e.CXONE_TOKEN_URL || 'https://cxone.niceincontact.com/auth/token';
  const form = new URLSearchParams();
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (src === 'access-key') {
    form.set('grant_type', 'password');
    form.set('username', e.CXONE_ACCESS_KEY_ID);
    form.set('password', e.CXONE_ACCESS_KEY_SECRET);
    if (e.CXONE_CLIENT_ID && e.CXONE_CLIENT_SECRET) headers.Authorization = 'Basic ' + Buffer.from(e.CXONE_CLIENT_ID + ':' + e.CXONE_CLIENT_SECRET).toString('base64');
  } else {
    form.set('grant_type', 'client_credentials');
    form.set('client_id', e.CXONE_CLIENT_ID);
    form.set('client_secret', e.CXONE_CLIENT_SECRET);
  }
  const r = await fetch(url, { method: 'POST', headers, body: form });
  if (!r.ok) throw new Error('Token request returned ' + r.status);
  const j = await r.json();
  if (!j.access_token) throw new Error('Token response had no access_token');
  tokCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 300) * 1000, base: String(j.resource_server_base_uri || '').replace(/\/+$/, '') };
  return tokCache;
}
function findContactId(o) {
  if (o == null || typeof o !== 'object') return null;
  for (const k of Object.keys(o)) if (/contact.?id/i.test(k) && (typeof o[k] === 'string' || typeof o[k] === 'number') && o[k] !== '') return String(o[k]);
  for (const k of Object.keys(o)) { const v = findContactId(o[k]); if (v) return v; }
  return null;
}
const simId = () => '1' + String(Math.floor(Math.random() * 1e11)).padStart(11, '0');

const SCRIPT_LABEL = { call: 'Script 1 (call customer)', sms: 'Script 2 (SMS to sales employee)' };
const recent = [];   // last API calls, in memory only, no token
function logCall(e) { recent.unshift(Object.assign({ at: Date.now() }, e)); if (recent.length > 20) recent.length = 20; }

/* Admin API: POST /scripts/start. Required: skillId (integer), scriptId, scriptPath. parameters is a pipe-delimited string. */
async function startScript(kind, { params, needId }) {
  const s = DB.settings, cfg = kind === 'sms' ? s.sms : s.call, script = SCRIPT_LABEL[kind];
  let url = '', body = null, status = 0, text = '';
  const fallback = why => {
    logCall({ script, url, request: body, status, response: text.slice(0, 500), error: why, simulated: !!s.sim });
    if (s.sim) return { id: needId ? simId() : null, simulated: true, why };
    throw new HttpError(502, `${why.startsWith(script) ? why : script + ': ' + why}. Check the Integration page.`);
  };
  const missing = [];
  if (!String(cfg.scriptPath || '').trim()) missing.push('script path');
  if (!/^\d+$/.test(String(cfg.scriptId || ''))) missing.push('script ID');
  if (!/^\d+$/.test(String(cfg.skillId || ''))) missing.push('skill ID');
  if (missing.length) return fallback(`${script} is missing its ${missing.join(', ')}`);
  let tok;
  try { tok = await getToken(); } catch (e) { return fallback(e.message); }
  if (!tok) return fallback('No CXone token is set');
  try {
    const d = s.delim || '|';
    const clean = params.map(v => String(v == null ? '' : v).split(d).join(' '));
    if (clean.length > 20) throw new Error('CXone allows at most 20 parameters');
    body = { skillId: parseInt(cfg.skillId, 10), scriptId: parseInt(cfg.scriptId, 10), scriptPath: cfg.scriptPath.trim(), parameters: clean.join(d) };
    const base = (s.base || tok.base || 'https://api-na1.niceincontact.com').replace(/\/+$/, '');
    url = base + '/' + s.path.replace(/^\/+/, '');
    const res = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + tok.token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
    status = res.status; text = await res.text().catch(() => '');
    if (status === 401 || status === 403) {
      tokCache = null;
      throw new Error(`CXone rejected the token (${status}). ` + (tokenSource() === 'session' ? 'Paste a fresh token on the Admin page' : 'Check the server credentials'));
    }
    if (!res.ok) throw new Error(`API returned ${status}` + (text ? ': ' + text.slice(0, 300) : ''));
    let data = {}; try { data = JSON.parse(text); } catch (e) {}
    const id = needId ? findContactId(data) : null;
    if (needId && !id) throw new Error('The response had no contact ID: ' + text.slice(0, 200));
    logCall({ script, url, request: body, status, response: text.slice(0, 500), contactId: id });
    return { id, simulated: false };
  } catch (e) { return fallback(e.message); }
}

/* Script 1: ring `ringPhone`, then connect to the customer. */
async function placeCall(lead, ringPhone, key) {
  const s = DB.settings;
  const recNum = key === 'a' ? lead.altPhone : lead.phone;
  if (!recNum) throw bad('There is no number on file for that option.');
  if (s.override && !E164.test(norm(s.override))) throw bad('The call override number is not valid E.164. Fix it on the Integration page.');
  if (s.dealerANI && !E164.test(norm(s.dealerANI))) throw bad('The Dealer ANI is not valid E.164. Fix it on the Integration page.');
  const target = norm(s.override) || recNum;
  const p = [ringPhone, lead.first + ' ' + lead.last, lead.brand, s.incl ? target : '', norm(s.dealerANI)];
  while (p.length && !p[p.length - 1]) p.pop();
  const r = await startScript('call', { params: p, needId: true });
  return { r, number: target, recNum };
}

/* ---------- lead rules ---------- */
const pendingIdx = l => l.contacts.findIndex(c => !c.outcome);
function applyOutcome(lead, idx, key, note, cbMs) {
  const o = OC[key];
  if (!o) throw bad('Unknown outcome.');
  const c = lead.contacts[idx];
  if (!c) throw bad('That call attempt does not exist.');
  if (c.outcome) throw new HttpError(409, 'That call already has an outcome.');
  if (o.schedule && !(Number.isFinite(cbMs) && cbMs > Date.now())) throw bad('Choose a date and time in the future.');
  c.outcome = key;
  c.note = String(note || '').slice(0, 200);
  lead.callback = o.schedule ? cbMs : null;
  if (o.cat === 'final') { lead.final = { key, label: o.l, at: Date.now() }; lead.callback = null; }
  return o;
}
function linkUrl(req, guid) {
  const base = process.env.PUBLIC_BASE_URL || DB.settings.sms.linkBase || req.base;
  return base.replace(/\/+$/, '') + '/l/' + guid;
}
function leadView(l, req) {
  const L = l.guid && DB.links[l.guid];
  return Object.assign({}, l, {
    guid: undefined,
    link: L ? { state: L.state, issuedAt: L.issuedAt, usedAt: L.usedAt, employeeName: L.employeeName, url: L.state === 'issued' ? linkUrl(req, l.guid) : null } : null
  });
}
const findLead = id => { const l = DB.leads.find(x => x.id === +id); if (!l) throw new HttpError(404, 'Lead not found.'); return l; };

/* ---------- sessions ---------- */
const sessions = new Map();
const fails = new Map();
function cookies(req) {
  const o = {};
  String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return o;
}
function getSession(req) {
  const sid = cookies(req).sid, s = sid && sessions.get(sid);
  if (s && s.exp > Date.now()) return s;
  if (s) sessions.delete(sid);
  return null;
}
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/* ---------- http helpers ---------- */
function send(res, code, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extraHeaders || {}));
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > 1e6) { reject(new HttpError(413, 'Request too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(bad('Invalid JSON.')); } });
    req.on('error', reject);
  });
}
const FILES = { '/': ['index.html', 'text/html; charset=utf-8'], '/outcomes.js': ['outcomes.js', 'application/javascript; charset=utf-8'] };
function sendFile(res, name, type) {
  fs.readFile(path.join(__dirname, 'public', name), (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' });
    res.end(buf);
  });
}

/* ---------- mobile (one-time link) API ---------- */
const mobileLead = l => ({ first: l.first, last: l.last, model: l.model, brand: l.brand, city: l.city, callPref: l.callPref, currentCar: l.currentCar, tradeIn: l.tradeIn, budget: l.budget, fuel: l.fuel, hasAlt: !!l.altPhone, callsLeft: 3 - l.contacts.length });
const EXPIRED = { status: 'expired', message: 'This link has expired. The lead has already been opened. Contact your administrator for a new link.' };

function linkContext(guid) {
  const L = DB.links[guid];
  if (!L) return { bad: { status: 'invalid', message: "This link isn't valid. Contact your administrator." } };
  const lead = DB.leads.find(x => x.id === L.leadId);
  if (!lead) return { bad: { status: 'invalid', message: "This link isn't valid. Contact your administrator." } };
  return { L, lead };
}
async function mobileRoute(req, res, p, u) {
  const m = p.match(/^\/api\/m\/([0-9a-f-]{36})(\/call|\/outcome)?$/);
  if (!m) throw new HttpError(404, 'Not found.');
  const guid = m[1], sub = m[2] || '';
  const ctx = linkContext(guid);
  if (req.method === 'GET' && !sub) {
    if (ctx.bad) return send(res, 200, ctx.bad);
    const { L, lead } = ctx;
    if (L.state === 'revoked' || L.state === 'completed') return send(res, 200, EXPIRED);
    if (L.state === 'used') {
      const rk = u.searchParams.get('rk') || '';
      const pi = pendingIdx(lead);
      if (rk && L.rk && safeEq(rk, L.rk) && pi >= 0) return send(res, 200, { status: 'resume', employee: L.employeeName, lead: mobileLead(lead), idx: pi });
      return send(res, 200, EXPIRED);
    }
    if (lead.final) return send(res, 200, { status: 'closed', message: 'This lead has been closed. No further calls can be made.' });
    if (lead.contacts.length >= 3) return send(res, 200, { status: 'closed', message: 'All 3 call attempts have been used for this lead.' });
    return send(res, 200, { status: 'ok', employee: L.employeeName, lead: mobileLead(lead) });
  }
  if (ctx.bad) throw new HttpError(404, ctx.bad.message);
  const { L, lead } = ctx;
  const body = await readBody(req);

  if (req.method === 'POST' && sub === '/call') {
    if (L.state !== 'issued') throw new HttpError(409, EXPIRED.message);
    if (lead.final) throw new HttpError(409, 'This lead has been closed.');
    if (lead.contacts.length >= 3) throw new HttpError(409, 'All 3 call attempts have been used.');
    if (pendingIdx(lead) >= 0) throw new HttpError(409, 'Record the outcome of the last call first.');
    const key = body.key === 'a' && lead.altPhone ? 'a' : 'p';
    L.state = 'used'; L.usedAt = Date.now(); L.rk = crypto.randomBytes(16).toString('hex');
    let out;
    try { out = await placeCall(lead, L.mobile, key); }
    catch (e) { L.state = 'issued'; L.usedAt = null; delete L.rk; saveDB(); throw e; }
    lead.contacts.push({ id: out.r.id, number: out.number, recNum: out.recNum, override: out.number !== out.recNum, at: Date.now(), outcome: null, note: '', simulated: out.r.simulated, by: 'mobile', employee: L.employeeName });
    saveDB();
    return send(res, 200, { rk: L.rk, idx: lead.contacts.length - 1, simulated: out.r.simulated, why: out.r.why || '', lead: mobileLead(lead) });
  }
  if (req.method === 'POST' && sub === '/outcome') {
    if (L.state !== 'used' || !L.rk || !safeEq(String(body.rk || ''), L.rk)) throw new HttpError(409, EXPIRED.message);
    const idx = pendingIdx(lead);
    if (idx < 0) throw new HttpError(409, 'There is no call waiting for an outcome.');
    const o = applyOutcome(lead, idx, body.outcome, body.note, body.callback);
    L.state = 'completed'; L.completedAt = Date.now();
    saveDB();
    return send(res, 200, { ok: true, cat: o.cat, label: o.l, callback: lead.callback, final: !!lead.final });
  }
  throw new HttpError(404, 'Not found.');
}

/* ---------- desktop API ---------- */
async function apiRoute(req, res, p, u) {
  const m = req.method;
  if (p === '/api/login' && m === 'POST') {
    const ip = clientIp(req), f = fails.get(ip);
    if (f && f.n >= 10 && Date.now() - f.t < 600000) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    const b = await readBody(req);
    const email = String(b.email || '').trim(), phone = norm(b.phone), pass = String(b.password || '');
    if (!EMAIL.test(email)) throw bad('Enter a valid email address.');
    if (!E164.test(phone)) throw bad('Enter your number in international format, like +61404294260.');
    if (!pass) throw bad('Enter your password.');
    if (APP_PASSWORD && !safeEq(pass, APP_PASSWORD)) {
      fails.set(ip, { n: ((f && Date.now() - f.t < 600000) ? f.n : 0) + 1, t: Date.now() });
      throw new HttpError(401, "That password isn't right.");
    }
    fails.delete(ip);
    const sid = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, { email, phone, exp: Date.now() + 12 * 3600e3 });
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    return send(res, 200, { user: { email, phone } }, { 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}` });
  }
  if (p === '/api/me' && m === 'GET') { const s = getSession(req); return send(res, 200, { user: s ? { email: s.email, phone: s.phone } : null }); }
  if (p === '/api/logout' && m === 'POST') {
    const sid = cookies(req).sid; if (sid) sessions.delete(sid);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }
  const sess = getSession(req);
  if (!sess) throw new HttpError(401, 'Please sign in.');

  if (p === '/api/state' && m === 'GET') {
    return send(res, 200, { user: { email: sess.email, phone: sess.phone }, devMode: !APP_PASSWORD, tokenInfo: tokenInfo(), storage: STORAGE, leads: DB.leads.map(l => leadView(l, req)), employees: DB.employees, settings: DB.settings });
  }
  if (p === '/api/settings' && m === 'PUT') {
    const b = await readBody(req), s = DB.settings, sm = b.sms || {};
    for (const k of ['override', 'dealerANI']) if (b[k] != null && norm(b[k]) && !E164.test(norm(b[k]))) throw bad(`${k === 'override' ? 'Call override' : 'Dealer ANI'} must be E.164, like +61404294260.`);
    const str = (v, d) => (v == null ? d : String(v));
    const c = b.call || {};
    s.base = str(b.base, s.base).trim(); s.path = str(b.path, s.path).trim() || defaultSettings().path;
    s.delim = str(b.delim, s.delim) || '|'; s.prefix = str(b.prefix, s.prefix).trim();
    s.override = norm(str(b.override, s.override)); s.dealerANI = norm(str(b.dealerANI, s.dealerANI));
    if (b.incl != null) s.incl = !!b.incl; if (b.sim != null) s.sim = !!b.sim;
    for (const k of ['scriptPath', 'scriptId', 'skillId']) { s.call[k] = str(c[k], s.call[k]).trim(); s.sms[k] = str(sm[k], s.sms[k]).trim(); }
    s.sms.linkBase = str(sm.linkBase, s.sms.linkBase).trim();
    saveDB();
    return send(res, 200, { settings: s });
  }
  if (p === '/api/diagnostics' && m === 'GET') return send(res, 200, { calls: recent });
  if (p === '/api/token' && m === 'POST') { const b = await readBody(req); memToken = String(b.token || '').trim().replace(/^Bearer\s+/i, ''); memSetAt = memToken ? Date.now() : 0; return send(res, 200, { tokenInfo: tokenInfo() }); }

  if (p === '/api/employees' && m === 'POST') {
    const b = await readBody(req), name = String(b.name || '').trim().slice(0, 60), mobile = norm(b.mobile);
    if (!name) throw bad('Enter a name.');
    if (!E164.test(mobile)) throw bad('Enter the mobile in E.164 format, like +919876543210.');
    DB.employees.push({ id: crypto.randomUUID().slice(0, 8), name, mobile }); saveDB();
    return send(res, 200, { employees: DB.employees });
  }
  let mm = p.match(/^\/api\/employees\/([\w-]+)$/);
  if (mm) {
    const e = DB.employees.find(x => x.id === mm[1]);
    if (!e) throw new HttpError(404, 'Employee not found.');
    if (m === 'PUT') {
      const b = await readBody(req), name = String(b.name || '').trim().slice(0, 60), mobile = norm(b.mobile);
      if (!name) throw bad('Enter a name.');
      if (!E164.test(mobile)) throw bad('Enter the mobile in E.164 format, like +919876543210.');
      e.name = name; e.mobile = mobile; saveDB();
      return send(res, 200, { employees: DB.employees });
    }
    if (m === 'DELETE') { DB.employees = DB.employees.filter(x => x !== e); saveDB(); return send(res, 200, { employees: DB.employees }); }
  }

  mm = p.match(/^\/api\/leads\/(\d+)\/(dial|outcome|assign)$/);
  if (mm && m === 'POST') {
    const lead = findLead(mm[1]), b = await readBody(req);
    if (mm[2] === 'dial') {
      if (lead.final) throw new HttpError(409, 'This lead is finalised. Calls are disabled.', { lead: leadView(lead, req) });
      if (lead.contacts.length >= 3) throw new HttpError(409, 'All 3 call attempts have been used for this lead.', { lead: leadView(lead, req) });
      if (pendingIdx(lead) >= 0) throw new HttpError(409, 'Record the outcome of the last call first.', { lead: leadView(lead, req) });
      const out = await placeCall(lead, sess.phone, b.key === 'a' ? 'a' : 'p');
      lead.contacts.push({ id: out.r.id, number: out.number, recNum: out.recNum, override: out.number !== out.recNum, at: Date.now(), outcome: null, note: '', simulated: out.r.simulated, by: 'desktop' });
      saveDB();
      return send(res, 200, { lead: leadView(lead, req), idx: lead.contacts.length - 1, contactId: out.r.id, simulated: out.r.simulated, why: out.r.why || '' });
    }
    if (mm[2] === 'outcome') {
      const o = applyOutcome(lead, +b.idx, b.outcome, b.note, b.callback == null ? null : +b.callback);
      saveDB();
      return send(res, 200, { lead: leadView(lead, req), cat: o.cat });
    }
    if (mm[2] === 'assign') {
      if (lead.final) throw new HttpError(409, 'This lead is finalised and cannot be assigned.');
      const emp = DB.employees.find(x => x.id === b.employeeId);
      if (!emp) throw bad('Pick a sales employee.');
      const guid = crypto.randomUUID();
      const r = await startScript('sms', { params: [emp.mobile, guid], needId: false });
      const old = lead.guid && DB.links[lead.guid];
      if (old && (old.state === 'issued' || old.state === 'used')) old.state = 'revoked';
      DB.links[guid] = { leadId: lead.id, employeeId: emp.id, employeeName: emp.name, mobile: emp.mobile, state: 'issued', issuedAt: Date.now(), usedAt: null };
      lead.guid = guid; lead.owner = { id: emp.id, name: emp.name };
      saveDB();
      return send(res, 200, { lead: leadView(lead, req), sms: { simulated: r.simulated, why: r.why || '' } });
    }
  }
  if (p === '/api/admin/reset' && m === 'POST') {
    DB.leads = buildLeads(); DB.links = {}; saveDB();
    return send(res, 200, { leads: DB.leads.map(l => leadView(l, req)) });
  }
  throw new HttpError(404, 'Not found.');
}

/* ---------- server ---------- */
async function route(req, res) {
  const u = new URL(req.url, 'http://localhost'), p = u.pathname;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  req.base = `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (req.method === 'GET' && FILES[p]) return sendFile(res, FILES[p][0], FILES[p][1]);
  if (req.method === 'GET' && /^\/l\/[0-9a-f-]{36}$/.test(p)) return sendFile(res, 'mobile.html', 'text/html; charset=utf-8');
  if (p.startsWith('/api/m/')) return mobileRoute(req, res, p, u);
  if (p.startsWith('/api/')) return apiRoute(req, res, p, u);
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
}
process.on('uncaughtException', e => console.error('Uncaught exception:', e));
process.on('unhandledRejection', e => console.error('Unhandled rejection:', e));
ensureStorage();
loadDB();
const server = http.createServer(async (req, res) => {
  try { await route(req, res); }
  catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, Object.assign({ error: e.status ? e.message : 'Something went wrong on the server.' }, e.extra || {}));
  }
});
server.listen(PORT, () => {
  console.log(`Lead Desk listening on :${PORT} (Node ${process.version}), data in ${DATA_FILE}, token source: ${tokenSource()}`);
  if (!APP_PASSWORD) console.warn('WARNING: APP_PASSWORD is not set. Any password is accepted. Set it before going live.');
});

process.on('SIGTERM', () => { console.log('SIGTERM received, shutting down'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
