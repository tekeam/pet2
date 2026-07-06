export function registerExtra(app, tools){
  const { readDB, writeDB, requireAuth, requireAdmin } = tools;
  const slugify = (s='') => String(s).toLowerCase().replace(/[’']/g,'').replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'item';
  const uid = (p='id') => `${p}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;

  app.get('/api/brand-page/:slug', (req,res)=>{
    const db = readDB();
    const brand = db.brands.find(b => b.slug===req.params.slug || b.id===req.params.slug || slugify(b.latin||b.name)===req.params.slug);
    if(!brand) return res.status(404).json({error:'برند پیدا نشد'});
    const foods = db.foods.filter(f => f.brandId===brand.id || f.brandName===brand.name);
    res.json({ ...brand, foods, seoText: brand.seoText || `معرفی برند ${brand.name}، مدل‌های غذای خشک و انتخاب بهترین غذا برای سگ و گربه در نینجا پت.` });
  });

  app.get('/api/food-page/:slug', (req,res)=>{
    const db = readDB();
    const food = db.foods.find(f => f.slug===req.params.slug || f.id===req.params.slug || slugify(f.title)===req.params.slug);
    if(!food) return res.status(404).json({error:'غذا پیدا نشد'});
    const fans = db.users.flatMap(u => (u.pets||[]).filter(p => p.favoriteFoodId===food.id || String(p.food||'').includes(food.brandName)).map(p => ({ userId:u.id, name:p.name, type:p.type, breed:p.breed, photo:p.photo, food:p.food })));
    res.json({ ...food, fans, usageText: food.usageText || `${food.title} برای ${food.petType || 'پت'} در مرحله ${food.lifeStage || 'بالغ'} ثبت شده و می‌تواند بر اساس نیازهایی مثل ${(food.problems||[]).join('، ')} بررسی شود.` });
  });

  app.post('/api/explore/:id/like', requireAuth, (req,res)=>{
    const p = req.db.explore.find(x => x.id===req.params.id);
    if(!p) return res.status(404).json({error:'پست پیدا نشد'});
    p.likedBy = p.likedBy || [];
    const i = p.likedBy.indexOf(req.user.id);
    if(i >= 0) p.likedBy.splice(i,1); else p.likedBy.push(req.user.id);
    p.likes = p.likedBy.length;
    writeDB(req.db);
    res.json({ likes:p.likes, liked:p.likedBy.includes(req.user.id) });
  });

  app.post('/api/explore/:id/comments', requireAuth, (req,res)=>{
    const p = req.db.explore.find(x => x.id===req.params.id);
    if(!p) return res.status(404).json({error:'پست پیدا نشد'});
    const c = { id:uid('cmt'), userId:req.user.id, userName:req.user.name, text:req.body.text || '', createdAt:new Date().toISOString() };
    p.comments = p.comments || [];
    p.comments.push(c);
    writeDB(req.db);
    res.json(c);
  });

  app.post('/api/admin/normalize-slugs', requireAuth, requireAdmin, (req,res)=>{
    req.db.brands.forEach(b => { if(!b.slug) b.slug = slugify(b.latin || b.name); });
    req.db.foods.forEach(f => { if(!f.slug) f.slug = slugify(`${f.brandName || ''}-${f.model || f.title || ''}`); });
    writeDB(req.db);
    res.json({ ok:true });
  });
}
