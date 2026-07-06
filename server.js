import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { catalog, problemOptions, problemsForModel } from './data/seedCatalog.js';
import { locations } from './data/locations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function id(prefix='id'){ return `${prefix}_${crypto.randomBytes(8).toString('hex')}`; }
function hashPassword(password, salt=crypto.randomBytes(16).toString('hex')){
  const hash = crypto.pbkdf2Sync(String(password), salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored=''){
  const [salt, hash] = String(stored).split(':'); if(!salt || !hash) return false;
  return hashPassword(password, salt) === stored;
}
function readDB(){ return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function writeDB(db){ fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
function publicUser(u){ if(!u) return null; const { passwordHash, ...safe } = u; return safe; }
function seedFoods(){
  const brands=[]; const foods=[];
  catalog.forEach(([latin, fa, country, tier, models])=>{
    const brandId = id('brand');
    brands.push({ id: brandId, latin, name: fa, country, tier, logo: '', description: `${fa} از برندهای شناخته‌شده غذای حیوانات خانگی است.`, createdAt: new Date().toISOString() });
    models.forEach(model=> foods.push({ id: id('food'), brandId, brandName: fa, title: `${fa} - ${model}`, model, petType: /dog|puppy|سگ|توله/i.test(model) ? 'سگ' : 'گربه', lifeStage: /kitten|puppy|junior|baby|بچه|توله/i.test(model) ? 'بچه/توله' : 'بالغ', problems: problemsForModel(model), price: '', buyUrl: '', image: '', feedingTable: '', analysis: '', description: 'توضیحات، ترکیبات، قیمت و لینک خرید این غذا از پنل مدیریت قابل ویرایش است.', createdAt: new Date().toISOString() }));
  });
  return { brands, foods };
}
function initDB(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if(fs.existsSync(DB_PATH)) return;
  const seeded = seedFoods();
  const db = {
    settings: { siteName: 'NinjaPet', authMode: 'email', smsEnabled: false, smsApiKey: '', smsTemplateId: '', adminPath: '/ninja-admin', contactPhone: '02191303284', contactEmail: 'Info@ninjapet.ir' },
    users: [{ id: 'admin', name: 'Admin', email: 'admin@ninjapet.local', phone: '', role: 'admin', passwordHash: hashPassword('admin'), pets: [], reminders: [], createdAt: new Date().toISOString() }],
    sessions: {}, otps: {}, brands: seeded.brands, foods: seeded.foods, centers: [], explore: []
  };
  writeDB(db);
}
initDB();

function requireAuth(req,res,next){ const token=(req.headers.authorization||'').replace('Bearer ',''); const db=readDB(); const s=db.sessions[token]; if(!s) return res.status(401).json({error:'ورود لازم است'}); const user=db.users.find(u=>u.id===s.userId); if(!user) return res.status(401).json({error:'کاربر پیدا نشد'}); req.token=token; req.user=user; req.db=db; next(); }
function requireAdmin(req,res,next){ if(req.user.role!=='admin') return res.status(403).json({error:'دسترسی مدیر لازم است'}); next(); }
function saveSession(db, userId){ const token=id('tok'); db.sessions[token] = { userId, createdAt: new Date().toISOString() }; return token; }

app.get('/api/bootstrap', (req,res)=>{ const db=readDB(); res.json({ settings: { ...db.settings, smsApiKey: undefined }, brands: db.brands, foods: db.foods, locations, problemOptions }); });
app.get('/api/foods', (req,res)=>{ const db=readDB(); const { problem, petType, brandId, q } = req.query; let items=[...db.foods]; if(problem) items=items.filter(f=>f.problems?.includes(problem)); if(petType) items=items.filter(f=>f.petType===petType); if(brandId) items=items.filter(f=>f.brandId===brandId); if(q) items=items.filter(f=>(f.title+f.brandName+f.model).toLowerCase().includes(String(q).toLowerCase())); res.json(items); });
app.get('/api/foods/:id', (req,res)=>{ const db=readDB(); const food=db.foods.find(f=>f.id===req.params.id); if(!food) return res.status(404).json({error:'غذا پیدا نشد'}); const fans=db.users.flatMap(u=>(u.pets||[]).filter(p=>p.favoriteFoodId===food.id || String(p.food||'').includes(food.brandName)).map(p=>({ userId:u.id, name:p.name, type:p.type, breed:p.breed, photo:p.photo, food:p.food }))); res.json({ ...food, fans }); });
app.get('/api/brands', (req,res)=>res.json(readDB().brands));
app.get('/api/centers', (req,res)=>{ const db=readDB(); const { province, city, type }=req.query; let items=db.centers.filter(c=>c.status==='approved'); if(province) items=items.filter(c=>c.province===province); if(city) items=items.filter(c=>c.city===city); if(type) items=items.filter(c=>c.type===type); res.json(items); });
app.get('/api/explore', (req,res)=>res.json(readDB().explore.filter(p=>p.status==='approved').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));

app.post('/api/auth/request-otp', async (req,res)=>{
  const phone=String(req.body.phone||'').trim(); if(!phone) return res.status(400).json({error:'شماره موبایل لازم است'});
  const db=readDB(); const code=String(Math.floor(100000+Math.random()*900000)); db.otps[phone]={code, expiresAt:Date.now()+5*60*1000}; writeDB(db);
  if(db.settings.smsEnabled && db.settings.smsApiKey && db.settings.smsTemplateId){
    try{
      const r = await fetch('https://api.sms.ir/v1/send/verify', { method:'POST', headers:{ 'Content-Type':'application/json','Accept':'application/json','X-API-KEY':db.settings.smsApiKey }, body: JSON.stringify({ mobile: phone, templateId: Number(db.settings.smsTemplateId), parameters: [{ name:'CODE', value: code }, { name:'code', value: code }] }) });
      if(!r.ok) return res.status(502).json({error:'ارسال پیامک ناموفق بود', detail: await r.text()});
      return res.json({ ok:true });
    }catch(e){ return res.status(502).json({error:'اتصال به SMS.ir ناموفق بود', detail:e.message}); }
  }
  res.json({ ok:true, devCode: code, note:'SMS غیرفعال است؛ کد فقط برای تست برگشت داده شد.' });
});
app.post('/api/auth/register', (req,res)=>{ const db=readDB(); const { name, email, phone, password, otp }=req.body; if(!password) return res.status(400).json({error:'رمز عبور لازم است'}); if(db.settings.authMode==='email' && !email) return res.status(400).json({error:'ایمیل لازم است'}); if(db.settings.authMode==='phone' && !phone) return res.status(400).json({error:'موبایل لازم است'}); if(db.settings.authMode==='both' && !email && !phone) return res.status(400).json({error:'ایمیل یا موبایل لازم است'}); if(phone && db.settings.authMode!=='email'){ const rec=db.otps[phone]; if(!rec || rec.code!==String(otp) || rec.expiresAt<Date.now()) return res.status(400).json({error:'کد پیامکی معتبر نیست'}); }
  if(db.users.some(u=>(email && u.email===email)||(phone && u.phone===phone))) return res.status(409).json({error:'این کاربر قبلاً ثبت شده است'});
  const user={ id:id('usr'), name:name||'کاربر نینجا پت', email:email||'', phone:phone||'', role:'user', passwordHash:hashPassword(password), pets:[], reminders:[], createdAt:new Date().toISOString() }; db.users.push(user); const token=saveSession(db,user.id); writeDB(db); res.json({ token, user: publicUser(user) }); });
app.post('/api/auth/login', (req,res)=>{ const db=readDB(); const { identifier, password, otp }=req.body; const user=db.users.find(u=>u.email===identifier || u.phone===identifier || (identifier==='admin' && u.id==='admin')); if(!user) return res.status(401).json({error:'کاربر پیدا نشد'}); if(user.phone && identifier===user.phone && otp){ const rec=db.otps[user.phone]; if(!rec || rec.code!==String(otp) || rec.expiresAt<Date.now()) return res.status(401).json({error:'کد پیامکی اشتباه است'}); } else if(!verifyPassword(password, user.passwordHash)) return res.status(401).json({error:'رمز عبور اشتباه است'}); const token=saveSession(db,user.id); writeDB(db); res.json({token,user:publicUser(user)}); });
app.post('/api/auth/logout', requireAuth, (req,res)=>{ delete req.db.sessions[req.token]; writeDB(req.db); res.json({ok:true}); });
app.get('/api/me', requireAuth, (req,res)=>res.json(publicUser(req.user)));
app.put('/api/me', requireAuth, (req,res)=>{ Object.assign(req.user, { name:req.body.name??req.user.name, email:req.body.email??req.user.email, phone:req.body.phone??req.user.phone }); writeDB(req.db); res.json(publicUser(req.user)); });
app.post('/api/me/pets', requireAuth, (req,res)=>{ const pet={ id:id('pet'), name:req.body.name, type:req.body.type, breed:req.body.breed, age:req.body.age, weight:req.body.weight, problems:req.body.problems||[], disease:req.body.disease||'', food:req.body.food||'', favoriteFoodId:req.body.favoriteFoodId||'', photo:req.body.photo||'', createdAt:new Date().toISOString() }; req.user.pets=req.user.pets||[]; req.user.pets.push(pet); writeDB(req.db); res.json(pet); });
app.put('/api/me/pets/:id', requireAuth, (req,res)=>{ const pet=(req.user.pets||[]).find(p=>p.id===req.params.id); if(!pet) return res.status(404).json({error:'پت پیدا نشد'}); Object.assign(pet, req.body); writeDB(req.db); res.json(pet); });
app.delete('/api/me/pets/:id', requireAuth, (req,res)=>{ req.user.pets=(req.user.pets||[]).filter(p=>p.id!==req.params.id); writeDB(req.db); res.json({ok:true}); });
app.post('/api/me/reminders', requireAuth, (req,res)=>{ const item={ id:id('rem'), title:req.body.title, date:req.body.date, time:req.body.time, type:req.body.type, createdAt:new Date().toISOString() }; req.user.reminders=req.user.reminders||[]; req.user.reminders.push(item); writeDB(req.db); res.json(item); });
app.delete('/api/me/reminders/:id', requireAuth, (req,res)=>{ req.user.reminders=(req.user.reminders||[]).filter(r=>r.id!==req.params.id); writeDB(req.db); res.json({ok:true}); });
app.post('/api/centers', (req,res)=>{ const db=readDB(); const center={ id:id('ctr'), status:'pending', ...req.body, createdAt:new Date().toISOString() }; db.centers.push(center); writeDB(db); res.json(center); });
app.post('/api/explore', requireAuth, (req,res)=>{ const post={ id:id('exp'), userId:req.user.id, userName:req.user.name, status:'pending', likes:0, comments:[], ...req.body, createdAt:new Date().toISOString() }; req.db.explore.push(post); writeDB(req.db); res.json(post); });
app.get('/api/me/explore', requireAuth, (req,res)=>res.json(req.db.explore.filter(p=>p.userId===req.user.id)));
app.put('/api/me/explore/:id', requireAuth, (req,res)=>{ const p=req.db.explore.find(x=>x.id===req.params.id && x.userId===req.user.id); if(!p) return res.status(404).json({error:'پست پیدا نشد'}); Object.assign(p, req.body, { status:'pending' }); writeDB(req.db); res.json(p); });
app.delete('/api/me/explore/:id', requireAuth, (req,res)=>{ req.db.explore=req.db.explore.filter(x=>!(x.id===req.params.id && x.userId===req.user.id)); writeDB(req.db); res.json({ok:true}); });

app.get('/api/admin/summary', requireAuth, requireAdmin, (req,res)=>res.json({ users:req.db.users.length, brands:req.db.brands.length, foods:req.db.foods.length, centersPending:req.db.centers.filter(c=>c.status==='pending').length, explorePending:req.db.explore.filter(p=>p.status==='pending').length }));
app.get('/api/admin/all', requireAuth, requireAdmin, (req,res)=>res.json({ users:req.db.users.map(publicUser), brands:req.db.brands, foods:req.db.foods, centers:req.db.centers, explore:req.db.explore, settings:{...req.db.settings, smsApiKey:req.db.settings.smsApiKey?'***':''} }));
app.put('/api/admin/settings', requireAuth, requireAdmin, (req,res)=>{ req.db.settings={...req.db.settings, ...req.body}; writeDB(req.db); res.json({...req.db.settings, smsApiKey:req.db.settings.smsApiKey?'***':''}); });
app.post('/api/admin/change-password', requireAuth, requireAdmin, (req,res)=>{ if(!req.body.password) return res.status(400).json({error:'رمز جدید لازم است'}); req.user.passwordHash=hashPassword(req.body.password); writeDB(req.db); res.json({ok:true}); });
function crud(collection){
  app.post(`/api/admin/${collection}`, requireAuth, requireAdmin, (req,res)=>{ const item={id:id(collection.slice(0,3)),...req.body,createdAt:new Date().toISOString()}; req.db[collection].push(item); writeDB(req.db); res.json(item); });
  app.put(`/api/admin/${collection}/:id`, requireAuth, requireAdmin, (req,res)=>{ const item=req.db[collection].find(x=>x.id===req.params.id); if(!item) return res.status(404).json({error:'پیدا نشد'}); Object.assign(item, req.body); writeDB(req.db); res.json(item); });
  app.delete(`/api/admin/${collection}/:id`, requireAuth, requireAdmin, (req,res)=>{ req.db[collection]=req.db[collection].filter(x=>x.id!==req.params.id); writeDB(req.db); res.json({ok:true}); });
}
['brands','foods','centers','explore'].forEach(crud);
app.post('/api/admin/centers/:id/approve', requireAuth, requireAdmin, (req,res)=>{ const item=req.db.centers.find(x=>x.id===req.params.id); if(!item) return res.status(404).json({error:'پیدا نشد'}); item.status='approved'; writeDB(req.db); res.json(item); });
app.post('/api/admin/explore/:id/approve', requireAuth, requireAdmin, (req,res)=>{ const item=req.db.explore.find(x=>x.id===req.params.id); if(!item) return res.status(404).json({error:'پیدا نشد'}); item.status='approved'; writeDB(req.db); res.json(item); });
app.get('/api/admin/export', requireAuth, requireAdmin, (req,res)=>{ res.setHeader('Content-Disposition','attachment; filename=ninjapet-backup.json'); res.json(req.db); });

const dist = path.join(__dirname, 'dist');
if(fs.existsSync(dist)){ app.use(express.static(dist)); app.get('*', (_,res)=>res.sendFile(path.join(dist,'index.html'))); }
app.listen(PORT, ()=>console.log(`NinjaPet independent app running on http://localhost:${PORT}`));
