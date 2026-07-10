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
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '10mb' }));

const uid = (prefix = 'id') => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const now = () => new Date().toISOString();
const clean = (value, max = 5000) => String(value ?? '').trim().slice(0, max);
const validPhone = (value) => /^09\d{9}$|^\+?98\d{10}$/.test(clean(value).replace(/[\s-]/g, ''));
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
const slugify = (value = '') => clean(value).toLowerCase().replace(/[’']/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid('item');
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored = '') {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  return crypto.timingSafeEqual(Buffer.from(hashPassword(password, salt)), Buffer.from(stored));
}
function readDB() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function writeDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}
function seedFoods() {
  const brands = [];
  const foods = [];
  catalog.forEach(([latin, fa, country, tier, models]) => {
    const brandId = uid('brand');
    brands.push({ id: brandId, slug: slugify(latin), latin, name: fa, country, tier, logo: '', description: `${fa} از برندهای شناخته‌شده غذای حیوانات خانگی است.`, seoText: `معرفی برند ${fa} و مدل‌های غذای خشک سگ و گربه در نینجا پت.`, createdAt: now() });
    models.forEach((model) => foods.push({ id: uid('food'), slug: slugify(`${latin}-${model}`), brandId, brandName: fa, title: `${fa} - ${model}`, model, petType: /dog|puppy|سگ|توله/i.test(model) ? 'سگ' : 'گربه', lifeStage: /kitten|puppy|junior|baby|بچه|توله/i.test(model) ? 'بچه/توله' : 'بالغ', problems: problemsForModel(model), price: '', buyUrl: '', image: '', feedingTable: '', analysis: '', description: 'توضیحات، ترکیبات، قیمت و لینک خرید این غذا از پنل مدیریت قابل ویرایش است.', createdAt: now() }));
  });
  return { brands, foods };
}
function migrateDB(db) {
  db.settings = { siteName: 'NinjaPet', authMode: 'email', smsEnabled: false, smsApiKey: '', smsTemplateId: '', adminPath: '/ninja-admin', contactPhone: '02191303284', contactEmail: 'Info@ninjapet.ir', announcement: { enabled: false, text: '', image: '', background: '#6d45f5', color: '#ffffff', fontSize: 14, icon: 'paw' }, ...(db.settings || {}) };
  db.users = (db.users || []).map((u) => ({ pets: [], reminders: [], favoriteFoods: [], favoriteBrands: [], savedPosts: [], notifications: [], preferences: { language: 'fa', darkMode: false, notifications: true }, ...u }));
  db.sessions ||= {};
  db.otps ||= {};
  db.brands ||= [];
  db.foods ||= [];
  db.centers ||= [];
  db.explore ||= [];
  db.audit ||= [];
  return db;
}
function initDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const seeded = seedFoods();
    writeDB(migrateDB({ settings: {}, users: [{ id: 'admin', name: 'Admin', email: 'admin@ninjapet.local', phone: '', role: 'admin', passwordHash: hashPassword('admin'), createdAt: now() }], brands: seeded.brands, foods: seeded.foods, centers: [], explore: [] }));
  } else {
    writeDB(migrateDB(readDB()));
  }
}
initDB();

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const db = migrateDB(readDB());
  const session = db.sessions[token];
  if (!session) return res.status(401).json({ error: 'ورود لازم است' });
  const user = db.users.find((u) => u.id === session.userId);
  if (!user) return res.status(401).json({ error: 'کاربر پیدا نشد' });
  req.token = token;
  req.user = user;
  req.db = db;
  next();
}
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'دسترسی مدیر لازم است' });
  next();
}
function saveSession(db, userId) {
  const token = uid('tok');
  db.sessions[token] = { userId, createdAt: now(), expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  return token;
}
function addNotification(user, title, body, type = 'info') {
  user.notifications ||= [];
  user.notifications.unshift({ id: uid('not'), title, body, type, read: false, createdAt: now() });
  user.notifications = user.notifications.slice(0, 100);
}
function audit(db, action, actorId, data = {}) {
  db.audit ||= [];
  db.audit.unshift({ id: uid('aud'), action, actorId, data, createdAt: now() });
  db.audit = db.audit.slice(0, 500);
}

app.get('/api/bootstrap', (req, res) => {
  const db = migrateDB(readDB());
  res.json({ settings: { ...db.settings, smsApiKey: undefined }, brands: db.brands, foods: db.foods, locations, problemOptions });
});
app.get('/api/brands', (req, res) => res.json(migrateDB(readDB()).brands));
app.get('/api/brands/:slug', (req, res) => {
  const db = migrateDB(readDB());
  const brand = db.brands.find((b) => b.id === req.params.slug || b.slug === req.params.slug || slugify(b.latin || b.name) === req.params.slug);
  if (!brand) return res.status(404).json({ error: 'برند پیدا نشد' });
  res.json({ ...brand, foods: db.foods.filter((f) => f.brandId === brand.id || f.brandName === brand.name) });
});
app.get('/api/foods', (req, res) => {
  const db = migrateDB(readDB());
  const { problem, petType, brandId, q } = req.query;
  let items = [...db.foods];
  if (problem) items = items.filter((f) => f.problems?.includes(problem));
  if (petType) items = items.filter((f) => f.petType === petType);
  if (brandId) items = items.filter((f) => f.brandId === brandId);
  if (q) items = items.filter((f) => `${f.title} ${f.brandName} ${f.model}`.toLowerCase().includes(String(q).toLowerCase()));
  res.json(items);
});
app.get('/api/foods/:id', (req, res) => {
  const db = migrateDB(readDB());
  const food = db.foods.find((f) => f.id === req.params.id || f.slug === req.params.id);
  if (!food) return res.status(404).json({ error: 'غذا پیدا نشد' });
  const fans = db.users.flatMap((u) => (u.pets || []).filter((p) => p.favoriteFoodId === food.id || String(p.food || '').includes(food.brandName)).map((p) => ({ userId: u.id, name: p.name, type: p.type, breed: p.breed, photo: p.photo, food: p.food })));
  res.json({ ...food, fans });
});
app.get('/api/centers', (req, res) => {
  const db = migrateDB(readDB());
  const { province, city, type, q } = req.query;
  let items = db.centers.filter((c) => c.status === 'approved');
  if (province) items = items.filter((c) => c.province === province);
  if (city) items = items.filter((c) => c.city === city);
  if (type) items = items.filter((c) => c.type === type);
  if (q) items = items.filter((c) => `${c.name} ${c.city} ${c.address} ${c.type}`.includes(q));
  res.json(items);
});
app.get('/api/centers/:id', (req, res) => {
  const center = migrateDB(readDB()).centers.find((c) => c.id === req.params.id && c.status === 'approved');
  if (!center) return res.status(404).json({ error: 'مرکز پیدا نشد' });
  res.json(center);
});
app.post('/api/centers', (req, res) => {
  const db = migrateDB(readDB());
  const body = req.body || {};
  const required = ['name', 'manager', 'phone', 'province', 'city', 'address', 'description', 'type'];
  const missing = required.filter((k) => !clean(body[k]));
  if (missing.length) return res.status(400).json({ error: `فیلدهای اجباری ناقص هستند: ${missing.join('، ')}` });
  if (!validPhone(body.phone)) return res.status(400).json({ error: 'شماره تماس معتبر نیست' });
  if (!locations[body.province]?.includes(body.city)) return res.status(400).json({ error: 'استان یا شهر معتبر نیست' });
  if (!['پت‌شاپ', 'دامپزشکی', 'آرایشگر حیوانات', 'پانسیون'].includes(body.type)) return res.status(400).json({ error: 'نوع مرکز معتبر نیست' });
  const duplicate = db.centers.some((c) => c.phone === clean(body.phone) && c.name === clean(body.name));
  if (duplicate) return res.status(409).json({ error: 'این کسب‌وکار قبلاً ثبت شده است' });
  const center = { id: uid('ctr'), status: 'pending', name: clean(body.name, 150), manager: clean(body.manager, 100), phone: clean(body.phone, 30), province: clean(body.province, 50), city: clean(body.city, 50), address: clean(body.address, 500), description: clean(body.description, 2000), type: clean(body.type, 50), instagram: clean(body.instagram, 200), whatsapp: clean(body.whatsapp, 30), mapEmbed: clean(body.mapEmbed, 3000), latitude: Number(body.latitude) || null, longitude: Number(body.longitude) || null, hours: body.hours || {}, acceptedPets: Array.isArray(body.acceptedPets) ? body.acceptedPets : [], createdAt: now() };
  db.centers.push(center);
  audit(db, 'center.submitted', 'guest', { centerId: center.id });
  writeDB(db);
  res.status(201).json(center);
});

app.get('/api/explore', (req, res) => {
  const db = migrateDB(readDB());
  res.json(db.explore.filter((p) => p.status === 'approved').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});
app.post('/api/explore', requireAuth, (req, res) => {
  const post = { id: uid('exp'), userId: req.user.id, userName: req.user.name, status: 'pending', title: clean(req.body.title, 150), petName: clean(req.body.petName, 100), caption: clean(req.body.caption, 3000), image: clean(req.body.image, 8000000), favoriteFoodId: clean(req.body.favoriteFoodId, 100), likes: 0, likedBy: [], savedBy: [], comments: [], createdAt: now(), updatedAt: now() };
  if (!post.caption && !post.image) return res.status(400).json({ error: 'متن یا تصویر پست لازم است' });
  req.db.explore.push(post);
  addNotification(req.user, 'پست ثبت شد', 'پست شما در انتظار تأیید مدیر است.', 'pending');
  writeDB(req.db);
  res.status(201).json(post);
});
app.post('/api/explore/:id/like', requireAuth, (req, res) => {
  const post = req.db.explore.find((p) => p.id === req.params.id && p.status === 'approved');
  if (!post) return res.status(404).json({ error: 'پست پیدا نشد' });
  post.likedBy ||= [];
  const i = post.likedBy.indexOf(req.user.id);
  if (i >= 0) post.likedBy.splice(i, 1); else post.likedBy.push(req.user.id);
  post.likes = post.likedBy.length;
  writeDB(req.db);
  res.json({ liked: post.likedBy.includes(req.user.id), likes: post.likes });
});
app.post('/api/explore/:id/save', requireAuth, (req, res) => {
  const post = req.db.explore.find((p) => p.id === req.params.id && p.status === 'approved');
  if (!post) return res.status(404).json({ error: 'پست پیدا نشد' });
  req.user.savedPosts ||= [];
  const i = req.user.savedPosts.indexOf(post.id);
  if (i >= 0) req.user.savedPosts.splice(i, 1); else req.user.savedPosts.push(post.id);
  writeDB(req.db);
  res.json({ saved: req.user.savedPosts.includes(post.id) });
});
app.post('/api/explore/:id/comments', requireAuth, (req, res) => {
  const post = req.db.explore.find((p) => p.id === req.params.id && p.status === 'approved');
  if (!post) return res.status(404).json({ error: 'پست پیدا نشد' });
  const text = clean(req.body.text, 1000);
  if (!text) return res.status(400).json({ error: 'متن کامنت لازم است' });
  const comment = { id: uid('cmt'), userId: req.user.id, userName: req.user.name, text, createdAt: now() };
  post.comments ||= [];
  post.comments.push(comment);
  const owner = req.db.users.find((u) => u.id === post.userId);
  if (owner && owner.id !== req.user.id) addNotification(owner, 'کامنت جدید', `${req.user.name} برای پست شما کامنت گذاشت.`, 'comment');
  writeDB(req.db);
  res.status(201).json(comment);
});
app.get('/api/me/explore', requireAuth, (req, res) => res.json(req.db.explore.filter((p) => p.userId === req.user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))));
app.put('/api/me/explore/:id', requireAuth, (req, res) => {
  const post = req.db.explore.find((p) => p.id === req.params.id && p.userId === req.user.id);
  if (!post) return res.status(404).json({ error: 'پست پیدا نشد' });
  Object.assign(post, { title: clean(req.body.title ?? post.title, 150), petName: clean(req.body.petName ?? post.petName, 100), caption: clean(req.body.caption ?? post.caption, 3000), image: clean(req.body.image ?? post.image, 8000000), status: 'pending', updatedAt: now() });
  writeDB(req.db);
  res.json(post);
});
app.delete('/api/me/explore/:id', requireAuth, (req, res) => {
  req.db.explore = req.db.explore.filter((p) => !(p.id === req.params.id && p.userId === req.user.id));
  writeDB(req.db);
  res.json({ ok: true });
});

app.post('/api/auth/request-otp', async (req, res) => {
  const phone = clean(req.body.phone, 30).replace(/[\s-]/g, '');
  if (!validPhone(phone)) return res.status(400).json({ error: 'شماره موبایل معتبر لازم است' });
  const db = migrateDB(readDB());
  const previous = db.otps[phone];
  if (previous?.sentAt && Date.now() - previous.sentAt < 60000) return res.status(429).json({ error: 'برای ارسال مجدد ۶۰ ثانیه صبر کنید' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.otps[phone] = { code, sentAt: Date.now(), expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 };
  writeDB(db);
  if (db.settings.smsEnabled && db.settings.smsApiKey && db.settings.smsTemplateId) {
    try {
      const r = await fetch('https://api.sms.ir/v1/send/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-KEY': db.settings.smsApiKey }, body: JSON.stringify({ mobile: phone, templateId: Number(db.settings.smsTemplateId), parameters: [{ name: 'CODE', value: code }, { name: 'code', value: code }] }) });
      if (!r.ok) return res.status(502).json({ error: 'ارسال پیامک ناموفق بود', detail: await r.text() });
      return res.json({ ok: true, retryAfter: 60 });
    } catch (e) { return res.status(502).json({ error: 'اتصال به SMS.ir ناموفق بود', detail: e.message }); }
  }
  res.json({ ok: true, devCode: code, retryAfter: 60, note: 'SMS غیرفعال است؛ کد فقط برای تست برگشت داده شد.' });
});
app.post('/api/auth/register', (req, res) => {
  const db = migrateDB(readDB());
  const name = clean(req.body.name, 100), email = clean(req.body.email, 200).toLowerCase(), phone = clean(req.body.phone, 30), password = String(req.body.password || ''), otp = clean(req.body.otp, 10);
  if (password.length < 6) return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });
  if (email && !validEmail(email)) return res.status(400).json({ error: 'ایمیل معتبر نیست' });
  if (phone && !validPhone(phone)) return res.status(400).json({ error: 'شماره موبایل معتبر نیست' });
  if (db.settings.authMode === 'email' && !email) return res.status(400).json({ error: 'ایمیل لازم است' });
  if (db.settings.authMode === 'phone' && !phone) return res.status(400).json({ error: 'موبایل لازم است' });
  if (db.settings.authMode === 'both' && !email && !phone) return res.status(400).json({ error: 'ایمیل یا موبایل لازم است' });
  if (phone && db.settings.authMode !== 'email') {
    const rec = db.otps[phone];
    if (!rec || rec.code !== otp || rec.expiresAt < Date.now()) return res.status(400).json({ error: 'کد پیامکی معتبر نیست' });
  }
  if (db.users.some((u) => (email && u.email === email) || (phone && u.phone === phone))) return res.status(409).json({ error: 'این کاربر قبلاً ثبت شده است' });
  const user = { id: uid('usr'), name: name || 'کاربر نینجا پت', email, phone, role: 'user', passwordHash: hashPassword(password), pets: [], reminders: [], favoriteFoods: [], favoriteBrands: [], savedPosts: [], notifications: [], preferences: { language: 'fa', darkMode: false, notifications: true }, createdAt: now() };
  db.users.push(user);
  const token = saveSession(db, user.id);
  writeDB(db);
  res.status(201).json({ token, user: publicUser(user) });
});
app.post('/api/auth/login', (req, res) => {
  const db = migrateDB(readDB());
  const identifier = clean(req.body.identifier, 200), password = String(req.body.password || ''), otp = clean(req.body.otp, 10);
  const user = db.users.find((u) => u.email === identifier.toLowerCase() || u.phone === identifier || (identifier === 'admin' && u.id === 'admin'));
  if (!user) return res.status(401).json({ error: 'کاربر پیدا نشد' });
  if (user.phone && identifier === user.phone && otp) {
    const rec = db.otps[user.phone];
    if (!rec || rec.code !== otp || rec.expiresAt < Date.now()) return res.status(401).json({ error: 'کد پیامکی اشتباه است' });
  } else if (!verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: 'رمز عبور اشتباه است' });
  const token = saveSession(db, user.id);
  writeDB(db);
  res.json({ token, user: publicUser(user) });
});
app.post('/api/auth/logout', requireAuth, (req, res) => { delete req.db.sessions[req.token]; writeDB(req.db); res.json({ ok: true }); });

app.get('/api/me', requireAuth, (req, res) => res.json(publicUser(req.user)));
app.put('/api/me', requireAuth, (req, res) => {
  const email = clean(req.body.email ?? req.user.email, 200).toLowerCase();
  const phone = clean(req.body.phone ?? req.user.phone, 30);
  if (email && !validEmail(email)) return res.status(400).json({ error: 'ایمیل معتبر نیست' });
  if (phone && !validPhone(phone)) return res.status(400).json({ error: 'شماره موبایل معتبر نیست' });
  Object.assign(req.user, { name: clean(req.body.name ?? req.user.name, 100), email, phone, preferences: { ...(req.user.preferences || {}), ...(req.body.preferences || {}) } });
  writeDB(req.db);
  res.json(publicUser(req.user));
});
app.post('/api/me/pets', requireAuth, (req, res) => {
  const name = clean(req.body.name, 100);
  if (!name) return res.status(400).json({ error: 'نام پت لازم است' });
  const pet = { id: uid('pet'), name, type: clean(req.body.type, 30), breed: clean(req.body.breed, 100), gender: clean(req.body.gender, 20), birth: clean(req.body.birth, 20), age: clean(req.body.age, 30), weight: clean(req.body.weight, 30), problems: Array.isArray(req.body.problems) ? req.body.problems : [], disease: clean(req.body.disease, 500), food: clean(req.body.food, 200), favoriteFoodId: clean(req.body.favoriteFoodId, 100), photo: clean(req.body.photo, 8000000), createdAt: now(), updatedAt: now() };
  req.user.pets.push(pet);
  writeDB(req.db);
  res.status(201).json(pet);
});
app.put('/api/me/pets/:id', requireAuth, (req, res) => {
  const pet = req.user.pets.find((p) => p.id === req.params.id);
  if (!pet) return res.status(404).json({ error: 'پت پیدا نشد' });
  Object.assign(pet, req.body, { updatedAt: now() });
  writeDB(req.db);
  res.json(pet);
});
app.delete('/api/me/pets/:id', requireAuth, (req, res) => { req.user.pets = req.user.pets.filter((p) => p.id !== req.params.id); writeDB(req.db); res.json({ ok: true }); });
app.post('/api/me/reminders', requireAuth, (req, res) => {
  const title = clean(req.body.title, 150), date = clean(req.body.date, 30);
  if (!title || !date) return res.status(400).json({ error: 'عنوان و تاریخ یادآور لازم است' });
  const item = { id: uid('rem'), title, date, time: clean(req.body.time, 20), type: clean(req.body.type, 50), createdAt: now() };
  req.user.reminders.push(item);
  writeDB(req.db);
  res.status(201).json(item);
});
app.delete('/api/me/reminders/:id', requireAuth, (req, res) => { req.user.reminders = req.user.reminders.filter((r) => r.id !== req.params.id); writeDB(req.db); res.json({ ok: true }); });
app.post('/api/me/favorites/:kind/:id', requireAuth, (req, res) => {
  const key = req.params.kind === 'brands' ? 'favoriteBrands' : 'favoriteFoods';
  req.user[key] ||= [];
  const i = req.user[key].indexOf(req.params.id);
  if (i >= 0) req.user[key].splice(i, 1); else req.user[key].push(req.params.id);
  writeDB(req.db);
  res.json({ active: req.user[key].includes(req.params.id), ids: req.user[key] });
});
app.get('/api/me/notifications', requireAuth, (req, res) => res.json(req.user.notifications || []));
app.post('/api/me/notifications/read', requireAuth, (req, res) => { (req.user.notifications || []).forEach((n) => { n.read = true; }); writeDB(req.db); res.json({ ok: true }); });

app.get('/api/admin/summary', requireAuth, requireAdmin, (req, res) => res.json({ users: req.db.users.length, brands: req.db.brands.length, foods: req.db.foods.length, centers: req.db.centers.length, centersPending: req.db.centers.filter((c) => c.status === 'pending').length, explore: req.db.explore.length, explorePending: req.db.explore.filter((p) => p.status === 'pending').length }));
app.get('/api/admin/all', requireAuth, requireAdmin, (req, res) => res.json({ users: req.db.users.map(publicUser), brands: req.db.brands, foods: req.db.foods, centers: req.db.centers, explore: req.db.explore, audit: req.db.audit, settings: { ...req.db.settings, smsApiKey: req.db.settings.smsApiKey ? '***' : '' } }));
app.put('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const incoming = { ...req.body };
  if (incoming.smsApiKey === '***') delete incoming.smsApiKey;
  req.db.settings = { ...req.db.settings, ...incoming };
  audit(req.db, 'settings.updated', req.user.id);
  writeDB(req.db);
  res.json({ ...req.db.settings, smsApiKey: req.db.settings.smsApiKey ? '***' : '' });
});
app.post('/api/admin/test-sms', requireAuth, requireAdmin, async (req, res) => {
  const phone = clean(req.body.phone, 30);
  if (!validPhone(phone)) return res.status(400).json({ error: 'شماره تست معتبر نیست' });
  if (!req.db.settings.smsEnabled || !req.db.settings.smsApiKey || !req.db.settings.smsTemplateId) return res.status(400).json({ error: 'تنظیمات SMS.ir کامل یا فعال نیست' });
  try {
    const r = await fetch('https://api.sms.ir/v1/send/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-KEY': req.db.settings.smsApiKey }, body: JSON.stringify({ mobile: phone, templateId: Number(req.db.settings.smsTemplateId), parameters: [{ name: 'CODE', value: '123456' }, { name: 'code', value: '123456' }] }) });
    if (!r.ok) return res.status(502).json({ error: 'تست ناموفق بود', detail: await r.text() });
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: 'اتصال ناموفق بود', detail: e.message }); }
});
app.post('/api/admin/change-password', requireAuth, requireAdmin, (req, res) => { if (String(req.body.password || '').length < 6) return res.status(400).json({ error: 'رمز جدید حداقل ۶ کاراکتر باشد' }); req.user.passwordHash = hashPassword(req.body.password); writeDB(req.db); res.json({ ok: true }); });
function crud(collection) {
  app.post(`/api/admin/${collection}`, requireAuth, requireAdmin, (req, res) => {
    const item = { id: uid(collection.slice(0, 3)), ...req.body, createdAt: now(), updatedAt: now() };
    if (collection === 'brands') item.slug ||= slugify(item.latin || item.name);
    if (collection === 'foods') item.slug ||= slugify(`${item.brandName || ''}-${item.model || item.title || ''}`);
    req.db[collection].push(item);
    audit(req.db, `${collection}.created`, req.user.id, { id: item.id });
    writeDB(req.db);
    res.status(201).json(item);
  });
  app.put(`/api/admin/${collection}/:id`, requireAuth, requireAdmin, (req, res) => {
    const item = req.db[collection].find((x) => x.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'پیدا نشد' });
    Object.assign(item, req.body, { updatedAt: now() });
    audit(req.db, `${collection}.updated`, req.user.id, { id: item.id });
    writeDB(req.db);
    res.json(item);
  });
  app.delete(`/api/admin/${collection}/:id`, requireAuth, requireAdmin, (req, res) => {
    req.db[collection] = req.db[collection].filter((x) => x.id !== req.params.id);
    audit(req.db, `${collection}.deleted`, req.user.id, { id: req.params.id });
    writeDB(req.db);
    res.json({ ok: true });
  });
}
['brands', 'foods', 'centers', 'explore'].forEach(crud);
app.post('/api/admin/centers/:id/status', requireAuth, requireAdmin, (req, res) => {
  const item = req.db.centers.find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'پیدا نشد' });
  item.status = ['approved', 'rejected', 'pending'].includes(req.body.status) ? req.body.status : 'pending';
  item.adminNote = clean(req.body.note, 500);
  writeDB(req.db);
  res.json(item);
});
app.post('/api/admin/explore/:id/status', requireAuth, requireAdmin, (req, res) => {
  const item = req.db.explore.find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'پیدا نشد' });
  item.status = ['approved', 'rejected', 'pending'].includes(req.body.status) ? req.body.status : 'pending';
  item.adminNote = clean(req.body.note, 500);
  const owner = req.db.users.find((u) => u.id === item.userId);
  if (owner) addNotification(owner, item.status === 'approved' ? 'پست تأیید شد' : 'وضعیت پست تغییر کرد', item.status === 'approved' ? 'پست شما در اکسپلور منتشر شد.' : `وضعیت پست: ${item.status}`, item.status);
  writeDB(req.db);
  res.json(item);
});
app.get('/api/admin/export', requireAuth, requireAdmin, (req, res) => { res.setHeader('Content-Disposition', 'attachment; filename=ninjapet-backup.json'); res.json(req.db); });
app.post('/api/admin/import', requireAuth, requireAdmin, (req, res) => {
  if (!req.body || typeof req.body !== 'object' || !Array.isArray(req.body.users)) return res.status(400).json({ error: 'فایل بکاپ معتبر نیست' });
  const backup = migrateDB(req.body);
  backup.users = backup.users.map((u) => u.id === 'admin' ? { ...u, passwordHash: req.user.passwordHash } : u);
  writeDB(backup);
  res.json({ ok: true });
});
app.get('/api/admin/centers/export.csv', requireAuth, requireAdmin, (req, res) => {
  const headers = ['id','status','name','type','manager','phone','province','city','address','instagram','whatsapp','latitude','longitude'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '\uFEFF' + [headers.join(','), ...req.db.centers.map((c) => headers.map((h) => esc(c[h])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=ninjapet-centers.csv');
  res.send(csv);
});
app.post('/api/admin/centers/import', requireAuth, requireAdmin, (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'ورودی باید آرایه‌ای از مراکز باشد' });
  const added = [];
  req.body.forEach((raw) => {
    if (!raw.name || !raw.phone) return;
    const center = { id: raw.id || uid('ctr'), status: raw.status || 'pending', ...raw, createdAt: raw.createdAt || now() };
    const existing = req.db.centers.findIndex((c) => c.id === center.id || (c.phone === center.phone && c.name === center.name));
    if (existing >= 0) req.db.centers[existing] = { ...req.db.centers[existing], ...center }; else req.db.centers.push(center);
    added.push(center.id);
  });
  writeDB(req.db);
  res.json({ ok: true, count: added.length });
});

const dist = path.join(__dirname, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.listen(PORT, () => console.log(`NinjaPet independent app running on http://localhost:${PORT}`));