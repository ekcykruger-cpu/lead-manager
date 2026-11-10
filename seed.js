'use strict';
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const MODELS = {
  Arena:['Alto K10','S-Presso','Wagon R','Swift','Dzire','Celerio','Brezza','Ertiga','Eeco'],
  Nexa:['Baleno','Fronx','Ignis','Ciaz','XL6','Grand Vitara','Jimny','Invicto','e Vitara']
};
const brandOf = m => MODELS.Nexa.includes(m) ? 'Maruti Suzuki Nexa' : 'Maruti Suzuki Arena';
const RAW = [
 ['Aarav','Sharma','Delhi','Brezza'],['Priya','Nair','Kochi','Grand Vitara'],['Rohan','Mehta','Mumbai','Fronx'],['Ananya','Iyer','Chennai','Baleno'],
 ['Vikram','Singh','Jaipur','Dzire'],['Sneha','Kulkarni','Pune','Swift'],['Amit','Verma','Lucknow','Ertiga'],['Neha','Gupta','Gurugram','Grand Vitara'],
 ['Rahul','Yadav','Patna','Wagon R'],['Pooja','Patel','Ahmedabad','Fronx'],['Suresh','Reddy','Hyderabad','Ertiga'],['Lakshmi','Pillai','Thiruvananthapuram','Celerio'],
 ['Karthik','Subramanian','Coimbatore','Baleno'],['Divya','Menon','Bengaluru','XL6'],['Arjun','Malhotra','Chandigarh','Jimny'],['Meera','Joshi','Indore','S-Presso'],
 ['Imran','Khan','Bhopal','Dzire'],['Fatima','Ansari','Hyderabad','Ignis'],['Gurpreet','Kaur','Ludhiana','Brezza'],['Harpreet','Sandhu','Amritsar','Ciaz'],
 ['Rajesh','Agarwal','Kanpur','Eeco'],['Sunita','Rao','Mangaluru','Baleno'],['Manoj','Tiwari','Varanasi','Alto K10'],['Deepa','Shetty','Udupi','Swift'],
 ['Sanjay','Deshmukh','Nagpur','Ertiga'],['Kavita','Bhatt','Vadodara','Fronx'],['Nitin','Chauhan','Dehradun','Brezza'],['Anjali','Mishra','Ranchi','Wagon R'],
 ['Faisal','Siddiqui','Kolkata','Grand Vitara'],['Zoya','Sheikh','Mumbai','e Vitara'],['Abhishek','Das','Bhubaneswar','Dzire'],['Shruti','Banerjee','Kolkata','Baleno'],
 ['Venkat','Naidu','Visakhapatnam','Invicto'],['Revathi','Gowda','Mysuru','Celerio'],['Sourav','Chatterjee','Howrah','Swift'],['Moumita','Ghosh','Siliguri','Alto K10'],
 ['Tushar','Pawar','Nashik','Brezza'],['Ishita','Kapoor','Delhi','Fronx'],['Yash','Thakur','Shimla','Jimny'],['Nikita','Saxena','Noida','Grand Vitara'],
 ['Dinesh','Chaudhary','Meerut','Eeco'],['Geeta','Rawat','Haridwar','S-Presso'],['Balaji','Krishnan','Madurai','Ertiga'],['Swathi','Hegde','Hubballi','Ignis'],
 ['Pranav','Kulshreshtha','Agra','XL6'],['Aditi','Joshi','Pune','Baleno'],['Mohan','Lal','Jodhpur','Dzire'],['Rekha','Solanki','Surat','Wagon R'],
 ['Prakash','Jadhav','Kolhapur','Swift'],['Jyoti','Bajaj','Nagpur','Fronx']
];
const CARS = ['2016 Maruti Alto 800','2018 Hyundai i20','2014 Honda City','2019 Tata Tiago','2012 Maruti Swift VDi','2017 Renault Kwid','2015 Maruti Wagon R','2020 Hyundai Creta','2013 Toyota Etios','2018 Maruti Baleno','2011 Maruti Zen Estilo','2016 Ford EcoSport'];
const SOCIETIES = ['Shanti Nagar','Green Park Residency','Lotus Heights','Sai Krupa Apartments','Gandhi Road','Model Town','Sunrise Enclave','Vasant Vihar','MG Road','Rajiv Nagar'];
const PREFS = ['Morning (9am to 12pm)','Afternoon (12pm to 4pm)','Evening (4pm to 8pm)','Weekends only','Any time',''];
const SOURCES = ['Website enquiry','Test drive request','Showroom walk-in','Facebook campaign','Referral','Auto Expo form'];
const FUELS = ['Petrol','CNG','Strong hybrid','Petrol'];
const BUDGETS = ['Rs 4 to 6 lakh','Rs 6 to 8 lakh','Rs 8 to 11 lakh','Rs 11 to 15 lakh','Rs 18 to 25 lakh'];
const OC = require('./public/outcomes.js').OC;

function buildLeads(){
  const r = rng(20261106), now = Date.now(), H = 3600e3, D = 24*H;
  const digits = n => { let s=''; for(let i=0;i<n;i++) s += Math.floor(r()*10); return s; };
  const mob = () => '+91' + [9,8,7,6][Math.floor(r()*4)] + digits(9);
  const leads = RAW.map((row, i) => {
    const [first,last,city,model] = row;
    const hasCar = i % 3 !== 2;
    const L = {
      id: i+1, first, last, city, model, brand: brandOf(model),
      phone: mob(),
      altPhone: i % 3 === 0 ? mob() : '',
      email: i % 5 !== 2 ? `${first}.${last}`.toLowerCase() + '@' + ['gmail.com','yahoo.in','outlook.com','rediffmail.com'][i%4] : '',
      address: i % 2 === 0 ? `Flat ${10+Math.floor(r()*80)}, ${SOCIETIES[i%SOCIETIES.length]}, ${city} ${100000+Math.floor(r()*799999)}` : '',
      callPref: PREFS[i % 6],
      currentCar: hasCar ? CARS[i % CARS.length] : '',
      tradeIn: hasCar ? ['Yes','No','Maybe'][i % 3] : (i % 4 === 0 ? 'Not sure' : ''),
      budget: i % 4 !== 3 ? BUDGETS[i % BUDGETS.length] : '',
      fuel: i % 3 !== 1 ? FUELS[i % FUELS.length] : '',
      source: SOURCES[i % SOURCES.length],
      enquired: now - (2 + Math.floor(r()*40)) * D,
      contacts: [], final: null, callback: null, notes: '', owner: null, guid: null
    };
    if (model === 'e Vitara') L.fuel = 'Electric';
    return L;
  });
  const call = (idx, outcome, daysAgo, note) => {
    const l = leads[idx], o = OC[outcome];
    const at = now - daysAgo * D - Math.floor(r()*5)*H;
    l.contacts.push({id: '1' + digits(11), number: l.phone, recNum: l.phone, override:false, at, outcome, note: note||'', simulated:false, by:'seed'});
    if (o.cat === 'final') l.final = {key: outcome, label: o.l, at};
  };
  call(3,'bought',3,'Bought a Hyundai Venue last week.');
  call(11,'cant_talk',5); call(11,'dnc',2,'Asked us to stop calling.');
  call(21,'not_interested',4);
  call(26,'remove',6,'Wants number removed from all lists.');
  call(36,'wrong',1,'Number belongs to someone else.');
  call(44,'no_answer',6); call(44,'not_interested',3);
  call(1,'interested',2,'Wants a quote on the Alpha variant.');
  call(8,'cant_talk',4); call(8,'thinking',1,'Comparing with Creta.');
  call(13,'cant_talk',1);
  call(19,'no_answer',6); call(19,'no_answer',4); call(19,'cant_talk',1);
  call(24,'info',3); call(24,'thinking',1);
  call(33,'test_drive',2,'Saturday at the Visakhapatnam showroom.');
  call(40,'no_answer',5); call(40,'cant_talk',3); call(40,'thinking',1,'Waiting on loan approval.');
  call(48,'no_answer',1);
  [[6,2],[17,5],[30,1]].forEach(([idx, days]) => {
    call(idx,'callback',1,'Asked for a call back.');
    leads[idx].callback = now + days*D + 4*H;
  });
  if (leads[19].contacts.length) leads[19].altPhone = leads[19].altPhone || mob();
  return leads;
}
module.exports = { buildLeads };
