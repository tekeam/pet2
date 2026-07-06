import React, { useEffect, useMemo, useState } from 'react';
import logo from './assets/ninjapet-logo.svg';

const API = '/api';
const getToken = () => localStorage.getItem('np_token') || '';
const slugify = (s = '') => String(s).toLowerCase().replace(/[’']/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
const brandSlug = (b) => b.slug || slugify(b.latin || b.name);
const foodSlug = (f) => f.slug || slugify(`${f.brandName || ''}-${f.model || f.title || ''}`);
const go = (path) => { window.location.hash = path; setTimeout(() => window.scrollTo(0, 0), 0); };

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطا در ارتباط با سرور');
  return data;
}
function useRoute() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/');
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  const [boot, setBoot] = useState(null);
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');
  const reload = () => {
    api('/bootstrap').then(setBoot).catch((e) => setErr(e.message));
    getToken() ? api('/me').then(setMe).catch(() => setMe(null)) : setMe(null);
  };
  useEffect(reload, []);
  if (!boot) return <div className="np-load"><img src={logo} alt="NinjaPet" /><b>در حال بارگذاری...</b></div>;
  const ctx = { boot, me, setMe, setErr, reload };
  let page = <Home {...ctx} />;
  if (route.startsWith('/login')) page = <Auth {...ctx} />;
  else if (route.startsWith('/profile')) page = <Profile {...ctx} />;
  else if (route.startsWith('/brands/')) page = <BrandDetail slug={route.split('/')[2]} {...ctx} />;
  else if (route.startsWith('/brands')) page = <Brands {...ctx} />;
  else if (route.startsWith('/food/')) page = <FoodDetail slug={route.split('/')[2]} {...ctx} />;
  else if (route.startsWith('/foods')) page = <FoodFinder {...ctx} />;
  else if (route.startsWith('/centers/new')) page = <BusinessForm {...ctx} />;
  else if (route.startsWith('/centers')) page = <Centers {...ctx} />;
  else if (route.startsWith('/more')) page = <More {...ctx} />;
  else if (route.startsWith('/settings')) page = <Settings {...ctx} />;
  else if (route.startsWith('/explore')) page = <Explore />;
  else if (route.startsWith('/admin')) page = <Admin />;
  return <><AppFrame route={route} me={me}>{page}</AppFrame>{err && <div className="np-toast" onClick={() => setErr('')}>{err}</div>}</>;
}

function AppFrame({ children, route, me }) {
  return <div className="np-shell"><div className="np-phone"><div className="np-status"><span>9:41</span><span>⌁  ◔  ▰</span></div>{children}<BottomNav route={route} me={me} /></div></div>;
}
function TopBar({ title, back = true, right, centerLogo = false }) {
  return <header className="np-top"><button className="np-back" onClick={() => back ? history.back() : go('/')}>{back ? '‹' : ''}</button>{centerLogo ? <button className="np-wordmark" onClick={() => go('/')}>Ninja<span>Pet</span></button> : <b>{title}</b>}<button className="np-top-action">{right || ''}</button></header>;
}
function BottomNav({ route, me }) {
  const item = (path, icon, label, active) => <a className={active ? 'active' : ''} onClick={() => go(path)}><i>{icon}</i><span>{label}</span></a>;
  return <nav className="np-bottom">
    {item('/', '⌂', 'خانه', route === '/')}
    {item('/brands', '⚚', 'غذاها', route.startsWith('/brands') || route.startsWith('/food') || route.startsWith('/foods'))}
    {item('/centers', '♜', 'مراکز', route.startsWith('/centers'))}
    {item('/explore', '◉', 'اکسپلور', route.startsWith('/explore'))}
    {item(me ? '/profile' : '/login', '◔', 'خانواده', route.startsWith('/profile') || route.startsWith('/login') || route.startsWith('/more') || route.startsWith('/settings'))}
  </nav>;
}
function Section({ title, children, action }) { return <section className="np-section"><div className="np-section-head"><h2>{title}</h2>{action}</div>{children}</section>; }
function PageTitle({ title, text, right }) { return <><TopBar title={title} right={right} /><section className="np-page-title">{text && <p>{text}</p>}</section></>; }
function brandLogoText(b) { return (b.latin || b.name || '').replace('Purina Pro Plan','PRO PLAN').replace('Royal Canin','ROYAL CANIN').replace('Happy Cat','HAPPY CAT').replace('Happy Dog','HAPPY DOG').replace('Taste of the Wild','Taste of the Wild').slice(0, 18); }
function ProductThumb({ food }) { return <div className="np-product-thumb"><span>{/dog|سگ|puppy/i.test(food.model || food.title) ? '🐶' : '🐱'}</span><small>{food.brandName}</small></div>; }
function ProductListItem({ food }) { return <article className="np-product-item" onClick={() => go('/food/' + foodSlug(food))}><ProductThumb food={food} /><div><b>{food.model || food.title}</b><span>{food.brandName}</span><small>{(food.problems || []).slice(0, 2).join('، ')}</small></div><em>›</em></article>; }

function Home({ boot }) {
  const categories = [{ label: 'سگ', icon: '🐶' }, { label: 'گربه', icon: '🐱' }, { label: 'توله سگ', icon: '🐕' }, { label: 'گربه بالغ', icon: '🦁' }];
  return <main className="np-screen"><TopBar centerLogo back={false} right="🔔" /><section className="np-home-hero"><div><h1>به نینجا پت خوش اومدی!</h1><p>غذای هوشمند، مراکز معتبر و راهنمای کامل برای حیوان خانگی شما</p></div><div className="np-hero-pets"><span>🐶</span><span>🐱</span></div></section><button className="np-action-card purple" onClick={() => go('/foods')}><div><b>پیدا کردن غذای مناسب</b><small>بر اساس نیاز و مشکل پت شما</small></div><i>🥣</i></button><button className="np-action-card light" onClick={() => go('/centers')}><div><b>مشاهده مراکز پت</b><small>نزدیک‌ترین دامپزشک، پت‌شاپ و پانسیون</small></div><i>📍</i></button><Section title="دسته‌بندی غذاها" action={<a onClick={() => go('/brands')}>مشاهده همه</a>}><div className="np-category-row">{categories.map((c) => <button key={c.label}><span>{c.icon}</span><small>{c.label}</small></button>)}</div></Section></main>;
}

function Brands({ boot }) {
  const [q, setQ] = useState('');
  const brands = boot.brands.filter((b) => (b.name + b.latin).toLowerCase().includes(q.toLowerCase()));
  return <main className="np-screen"><PageTitle title="برندهای غذایی" /><div className="np-search"><input placeholder="جستجوی برند..." onChange={(e) => setQ(e.target.value)} /><span>⌕</span></div><div className="np-brand-grid">{brands.map((b) => <article key={b.id} onClick={() => go('/brands/' + brandSlug(b))}><div className="np-logo-tile"><b>{brandLogoText(b)}</b></div><h3>{b.latin || b.name}</h3><p>{b.name}</p></article>)}</div></main>;
}
function BrandDetail({ slug, boot }) {
  const brand = boot.brands.find((b) => brandSlug(b) === slug || b.id === slug);
  if (!brand) return <main className="np-screen"><PageTitle title="برند پیدا نشد" /></main>;
  const foods = boot.foods.filter((f) => f.brandId === brand.id || f.brandName === brand.name).slice(0, 9);
  return <main className="np-screen"><TopBar title={brand.latin || brand.name} right="♥" /><section className="np-brand-detail"><div className="np-brand-big-logo"><b>{brandLogoText(brand)}</b></div><h1>{brand.name}</h1><span>{brand.tier}</span><small>کشور سازنده: {brand.country}</small><p>{brand.description || `${brand.name} یکی از برندهای شناخته‌شده غذای خشک برای سگ و گربه است و مدل‌های متنوعی برای سن، وزن و نیازهای مختلف پت ارائه می‌کند.`}</p><a>بیشتر بخوانید⌄</a></section><Section title="محصولات این برند"><div className="np-small-products">{foods.map((f) => <article key={f.id} onClick={() => go('/food/' + foodSlug(f))}><ProductThumb food={f} /><span>{f.model || 'غذای خشک'}</span></article>)}</div><button className="np-full-cta" onClick={() => go('/foods')}>مشاهده همه محصولات</button></Section></main>;
}

function FoodDetail({ slug, boot }) {
  const food = boot.foods.find((f) => foodSlug(f) === slug || f.id === slug);
  if (!food) return <main className="np-screen"><PageTitle title="غذا پیدا نشد" /></main>;
  return <main className="np-screen"><TopBar title="" right="♡" /><section className="np-food-detail"><ProductThumb food={food} /><h1>{food.model || food.title}</h1><span>{food.brandName}</span><div className="np-food-meta"><div><small>وزن مناسب</small><b>{food.petType === 'سگ' ? '۲۶ تا ۴۴ کیلو' : 'گربه بالغ'}</b></div><div><small>سن</small><b>{food.lifeStage}</b></div><div><small>برند</small><b>{food.brandName}</b></div></div><h3>ویژگی‌ها</h3><ul><li>تقویت سلامت مفاصل و استخوان‌ها</li><li>حفظ سلامت گوارش و دفع بهینه</li><li>حفظ وزن ایده‌آل و تناسب اندام</li></ul>{food.buyUrl ? <a className="np-buy-btn" href={food.buyUrl} target="_blank">لینک خرید محصول 🛒</a> : <button className="np-buy-btn">لینک خرید محصول 🛒</button>}</section></main>;
}

function FoodFinder({ boot }) {
  const [problem, setProblem] = useState('');
  const options = Object.keys(boot.problemOptions);
  return <main className="np-screen"><TopBar title="" /><section className="np-finder-head"><h1>پیدا کردن غذای مناسب</h1><p>برای سلامتی بهتر پت شما</p><div className="np-steps"><span>۳<br/>نتیجه</span><i></i><span>۲<br/>مشخصات</span><i></i><span>۱<br/>مشکل</span></div></section><section className="np-problem-list"><h2>مشکل یا نیاز اصلی پت را انتخاب کنید</h2>{options.map((o, i) => <button key={o} className={problem === o ? 'active' : ''} onClick={() => setProblem(o)}><span>{String(i + 1).padStart(2, '0')}</span><b>{o}</b><em>{['♨','✚','⚠','▣','✕','✂','♡','♙','◎'][i % 9]}</em></button>)}</section>{problem && <Section title="غذاهای پیشنهادی"><div className="np-product-list">{boot.foods.filter((f) => f.problems?.includes(problem)).slice(0, 8).map((f) => <ProductListItem key={f.id} food={f} />)}</div></Section>}</main>;
}

function Centers({ boot }) {
  const [filters, setFilters] = useState({ province: '', city: '', type: '' });
  const [items, setItems] = useState([]);
  const cities = boot.locations[filters.province] || [];
  useEffect(() => { api('/centers?' + new URLSearchParams(filters)).then(setItems).catch(() => setItems([])); }, [filters.province, filters.city, filters.type]);
  const demo = items.length ? items : [{ id:'d1', name:'پت شاپ پت لند', type:'پت‌شاپ', city:'تهران', address:'نزدیک شما', phone:'02191303284' }, { id:'d2', name:'کلینیک دامپزشکی دکتر احمدی', type:'دامپزشکی', city:'تهران', address:'۴.۹ کیلومتر', phone:'02191303284' }, { id:'d3', name:'آرایشگاه حیوانات پت استایل', type:'آرایشگر حیوانات', city:'تهران', address:'۲ کیلومتر', phone:'02191303284' }];
  return <main className="np-screen"><PageTitle title="مراکز پت" right="☰" /><div className="np-search"><input placeholder="جستجوی نام، شهر یا نوع مرکز..." /><span>⌕</span></div><div className="np-filter-pills"><button className="active">همه</button><button>پت‌شاپ</button><button>دامپزشکی</button><button>آرایشگاه</button><button>پانسیون</button></div><div className="np-map"><span>📍</span><span>📍</span><span>📍</span><span>📍</span></div><div className="np-center-cards">{demo.map((c) => <article key={c.id}><div className="np-center-img">🐶</div><div><h3>{c.name}</h3><p>{c.type}</p><small>{c.address}</small></div><b>★</b></article>)}</div><button className="np-full-cta" onClick={() => go('/centers/new')}>＋ اضافه کردن کسب و کار شما</button></main>;
}

const days = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
function BusinessForm({ boot, setErr }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ type:'پت‌شاپ', province:'', city:'', name:'', manager:'', phone:'', address:'', instagram:'', whatsapp:'', mapEmbed:'', description:'', hours:{} });
  const cities = boot.locations[form.province] || [];
  const setHour = (d,k,v) => setForm({ ...form, hours:{ ...form.hours, [d]:{ ...(form.hours[d] || {}), [k]:v } } });
  async function submit(e) { e.preventDefault(); try { await api('/centers', { method:'POST', body:JSON.stringify(form) }); alert('کسب‌وکار شما ثبت شد و بعد از تایید نمایش داده می‌شود.'); go('/centers'); } catch(e) { setErr(e.message); } }
  if (!step) return <main className="np-screen"><TopBar title="" /><section className="np-business-intro"><div>🏪</div><h1>اضافه کردن کسب و کار شما</h1><p>کسب و کار خود را در نینجا پت ثبت کنید و به هزاران دوستدار حیوانات معرفی شوید.</p><ul><li>افزایش دیده شدن کسب و کار</li><li>دسترسی به مشتریان هدفمند</li><li>مدیریت آسان اطلاعات</li></ul><button onClick={() => setStep(1)}>ادامه ثبت اطلاعات ←</button></section></main>;
  return <main className="np-screen"><PageTitle title="ثبت اطلاعات کسب‌وکار" text="فیلدهای ستاره‌دار اجباری هستند." /><form className="np-form" onSubmit={submit}><label>نام کسب‌وکار *<input required onChange={(e) => setForm({ ...form, name:e.target.value })} /></label><label>نوع مرکز *<select required onChange={(e) => setForm({ ...form, type:e.target.value })}><option>پت‌شاپ</option><option>دامپزشکی</option><option>آرایشگر حیوانات</option><option>پانسیون</option></select></label><label>نام مسئول *<input required onChange={(e) => setForm({ ...form, manager:e.target.value })} /></label><label>شماره تماس *<input required onChange={(e) => setForm({ ...form, phone:e.target.value })} /></label><label>استان *<select required onChange={(e) => setForm({ ...form, province:e.target.value, city:'' })}><option value="">انتخاب استان</option>{Object.keys(boot.locations).map((p) => <option key={p}>{p}</option>)}</select></label><label>شهر *<select required onChange={(e) => setForm({ ...form, city:e.target.value })}><option value="">انتخاب شهر</option>{cities.map((c) => <option key={c}>{c}</option>)}</select></label><label className="full">آدرس کامل *<input required onChange={(e) => setForm({ ...form, address:e.target.value })} /></label><label>واتساپ<input placeholder="اختیاری" onChange={(e) => setForm({ ...form, whatsapp:e.target.value })} /></label><label>اینستاگرام<input placeholder="@ninjapet" onChange={(e) => setForm({ ...form, instagram:e.target.value })} /></label><label className="full">توضیحات کوتاه *<textarea required onChange={(e) => setForm({ ...form, description:e.target.value })} /></label><div className="np-hours full"><h3>ساعت کاری</h3>{days.map((d) => <div className="np-hour" key={d}><b>{d}</b><input type="time" onChange={(e) => setHour(d,'amStart',e.target.value)} /><input type="time" onChange={(e) => setHour(d,'amEnd',e.target.value)} /><input type="time" onChange={(e) => setHour(d,'pmStart',e.target.value)} /><input type="time" onChange={(e) => setHour(d,'pmEnd',e.target.value)} /></div>)}</div><label className="full">کد Google Map<textarea placeholder="اختیاری" onChange={(e) => setForm({ ...form, mapEmbed:e.target.value })} /></label><button className="full">ارسال برای بررسی</button></form></main>;
}

function More({ me }) {
  const rows = [['پروفایل من','◔','/profile'], ['حیوانات من','♡','/profile'], ['سفارش‌های من','▣','/foods'], ['علاقه‌مندی‌ها','☆','/brands'], ['اعلان‌ها','🔔','/more'], ['پشتیبانی و سوالات متداول','؟','/more'], ['درباره نینجا پت','ⓘ','/more'], ['تنظیمات','⚙','/settings']];
  return <main className="np-screen"><TopBar title="بیشتر" right="⚙" /><div className="np-more-list">{rows.map((r, i) => <button key={i} onClick={() => go(r[2])}><span>{r[1]}</span><b>{r[0]}</b><em>›</em></button>)}</div></main>;
}
function Settings() {
  return <main className="np-screen"><PageTitle title="تنظیمات" /><div className="np-settings"><h3>حساب کاربری</h3><button><span>ویرایش اطلاعات</span><em>›</em></button><button><span>تغییر رمز عبور</span><em>›</em></button><h3>تنظیمات ثبت نام</h3><button><span>روش ثبت نام</span><small>ایمیل و شماره موبایل</small></button><h3>عمومی</h3><button><span>زبان برنامه</span><small>فارسی</small></button><button><span>حالت نمایش</span><small>روشن</small></button><button><span>اعلان‌ها</span><label><input type="checkbox" defaultChecked /></label></button><button><span>عکاسیابی</span><label><input type="checkbox" defaultChecked /></label></button><button><span>درباره برنامه</span><small>نسخه 1.0.0</small></button></div></main>;
}

function Auth({ setMe, setErr }) {
  const [reg, setReg] = useState(false);
  const [form, setForm] = useState({ identifier:'', email:'', phone:'', password:'', name:'' });
  async function submit(e) { e.preventDefault(); try { const data = reg ? await api('/auth/register', { method:'POST', body:JSON.stringify(form) }) : await api('/auth/login', { method:'POST', body:JSON.stringify({ identifier:form.identifier, password:form.password }) }); localStorage.setItem('np_token', data.token); setMe(data.user); go('/profile'); } catch(e) { setErr(e.message); } }
  return <main className="np-screen"><TopBar title="" /><form className="np-auth" onSubmit={submit}><img src={logo} alt="NinjaPet" /><h1>{reg ? 'ثبت‌نام در خانواده نینجا پت' : 'ورود به نینجا پت'}</h1><div className="np-tabs"><button type="button" className={!reg ? 'active' : ''} onClick={() => setReg(false)}>ورود</button><button type="button" className={reg ? 'active' : ''} onClick={() => setReg(true)}>ثبت‌نام</button></div>{reg && <label>نام شما<input required onChange={(e) => setForm({ ...form, name:e.target.value })} /></label>}{reg ? <><label>ایمیل<input required type="email" onChange={(e) => setForm({ ...form, email:e.target.value })} /></label><label>شماره موبایل<input onChange={(e) => setForm({ ...form, phone:e.target.value })} /></label></> : <label>ایمیل، موبایل یا admin<input required onChange={(e) => setForm({ ...form, identifier:e.target.value })} /></label>}<label>رمز عبور<input required type="password" onChange={(e) => setForm({ ...form, password:e.target.value })} /></label><button>ادامه</button><small>ورود مدیر: admin / admin</small></form></main>;
}
function Profile({ me }) {
  useEffect(() => { if (!me) go('/login'); }, [me]);
  if (!me) return null;
  return <main className="np-profile"><TopBar title="پروفایل من" right="🔔" /><section className="np-phone-card np-pet-summary"><div className="np-pet-avatar">🐶</div><div><h2>بیلی <span>♂</span></h2><p>گلدن رتریور</p><div className="np-mini-tags"><span>1401/05/10</span><span>25 کیلوگرم</span><span>نر</span></div></div></section><section className="np-phone-card"><h3>بیماری خاص</h3><div className="np-chips"><span>مشکل گوارشی</span><span>حساسیت غذایی</span></div></section><section className="np-phone-card np-fav-food"><div><h3>غذای محبوب</h3><p>Royal Canin Gastrointestinal</p></div><div>🥣</div></section><button className="np-full-cta" onClick={() => go('/explore')}>＋ پست جدید ＋</button></main>;
}
function Explore() { return <main className="np-screen"><PageTitle title="اکسپلور" text="پست‌های خانواده نینجا پت" /></main>; }
function Admin() { return <main className="np-screen"><PageTitle title="پنل مدیریت" text="مدیریت سایت" /></main>; }