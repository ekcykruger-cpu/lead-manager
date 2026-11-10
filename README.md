<<<<<<< HEAD
# Lead Desk

Lead qualification for Maruti Suzuki enquiries. A zero-dependency Node.js server (Node 18+) serves the desktop app and a mobile page, calls the CXone start-script API, and keeps all data in one JSON file.

## Flow

1. **Admin** pastes the CXone token, defines sales employees (name and E.164 mobile) and can reset all leads. Both scripts are configured on the **Integration** page.
2. On **Leads**, a manager taps **Assign** or **Reassign** on a lead and picks an employee.
3. The server creates a random GUID for the lead and starts the **SMS script** with two parameters: the employee's mobile and the GUID. The script sends the SMS with a link to `https://<your-app>/l/<GUID>`.
4. The lead's **Owner** is set to the employee. Any earlier link for that lead is revoked.
5. The employee opens the link on their phone and sees the lead (name, car, city, preferences, trade-in). Opening the link does not use it, so SMS link previews are harmless.
6. They tap **Call customer**. This is the moment the link becomes used. The server starts the **call script** with p1 the employee's mobile, p2 customer name, p3 brand, p4 customer number (or the Call Override), p5 Dealer ANI. The returned contactID goes into the lead's next free slot (max 3 per lead).
7. The **Call outcome** dialog opens as a bottom sheet. Outcomes are the same as on the desktop: open outcomes, a callback with date and time (added to the automated dialler queue), or finalise outcomes (the lead locks and no more calls are allowed).
8. Opening the same link again shows "This link has expired. Contact your administrator." The one exception is the same phone tab that made the call: a refresh before the outcome is saved resumes the outcome dialog, using a key kept in that tab's session storage. After the outcome is saved the link is dead for everyone.
9. If the call fails (and simulation is off) the link is not used, so the employee can retry.

Link states: `issued` (sent, not used) then `used` (call started) then `completed` (outcome saved). `revoked` means a newer link replaced it.

## Run locally

    APP_PASSWORD=choose-one node server.js

Open http://localhost:3000. Without CXone credentials, calls and SMS are simulated and tagged.

## Deploy on Railway

1. Push this folder to a GitHub repo and create a Railway project from it. Railway detects Node and runs `npm start`.
2. **Add a Volume** to the service, mounted at `/data`. Without it the data file is lost on each deploy.
3. Set variables:

| Variable | Purpose |
| --- | --- |
| `APP_PASSWORD` | Shared password for the desktop app. Set it before going live. |
| `DATA_DIR` | `/data` (the volume mount path) |
| `PUBLIC_BASE_URL` | Optional. Your public URL, used for the link shown in the lead panel. |
| `CXONE_ACCESS_KEY_ID`, `CXONE_ACCESS_KEY_SECRET` | Optional. Only needed if you don't want to paste a token. The server then fetches and refreshes tokens itself. |
| `CXONE_CLIENT_ID`, `CXONE_CLIENT_SECRET` | Optional with the access key, or alone for client credentials. |
| `CXONE_TOKEN_URL` | Optional. Defaults to `https://cxone.niceincontact.com/auth/token`. |
| `CXONE_BEARER_TOKEN` | Alternative: a fixed token. |

4. Generate a public domain for the service and sign in.
5. On the **Admin** page, paste the CXone bearer token under CXone connection, add the sales employees. Then fill in the script path and skill ID on the **Integration** page.

## CXone token handling

The primary way to supply the token is to paste it on the Admin page during setup.

- It is held in the server's memory only. It is never written to `data.json`, never logged and never sent back to the browser. The page only shows when it was set and when it expires (read from the token if it is a JWT).
- The mobile links need it after you close the admin page, so it stays in server memory until you clear it or the server restarts or redeploys. After a restart, paste it again.
- Use **Clear token** to remove it. An expired or rejected token is reported clearly, and calls are simulated if simulation is on.
- A pasted token takes priority over the environment variables. The access key variables are an optional fallback for automatic refresh, and the token request shape for them is my best reading of the CXone docs, so confirm it against your tenant.

## Files

- `server.js`: HTTP server, API, CXone calls, JSON storage
- `seed.js`: the 50 default leads (used on first run and by Reset)
- `public/index.html`: desktop app (Leads, Admin, Integration)
- `public/mobile.html`: the one-time link page
- `public/outcomes.js`: outcome list shared by server and both pages

## Notes

- Reset restores the 50 default leads and clears owners, calls, outcomes and links. Employees and settings are kept.
- The bearer token never reaches the browser or the data file. All other settings are saved in `data.json`.
- Login checks `APP_PASSWORD` on the server and sets an HttpOnly session cookie (12 hours).
- Failed logins are limited to 10 per 10 minutes per IP.

## CXone start-script requests

Both scripts are started with the Admin API, `POST /scripts/start`. The server builds each request from three required settings per script, with no template to get wrong:

    {
      "skillId": 20967527,          integer
      "scriptId": 12345678,
      "scriptPath": "Folder\\Script",
      "parameters": "p1|p2|p3"      pipe-delimited, up to 20
    }

| | Script 1: call customer | Script 2: SMS to sales employee |
| --- | --- | --- |
| When | A customer number is tapped, or Call customer on the mobile link | A lead is assigned |
| Settings (Integration page) | script path, script ID, skill ID | script path, script ID, skill ID |
| Parameters | p1 number to ring (login phone, or the employee's mobile on the mobile link), p2 customer name, p3 brand, p4 customer number or call override, p5 Dealer ANI | p1 employee mobile, p2 lead GUID |

The script ID changes every time a script is saved in Studio, so update it after each save. If any of the three settings is missing, the call is not sent. With simulation on it is simulated and the reason is shown, and with simulation off you get an error naming the missing field.

The Integration page shows the exact request each script will send, and a Recent API calls list with the request and CXone's response for the last 20 calls (the token is never shown). If CXone rejects a call, its error text is shown in the message.

The default endpoint path is `/incontactapi/services/v33.0/scripts/start`. I could not read the Developer Portal spec, so confirm the base URL and path there and edit them on the Integration page if they differ.
=======
# lead-desk
>>>>>>> 89de09e7ae2987f684d0fdb80353b9a68e5e5df6
