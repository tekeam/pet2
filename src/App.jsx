import React,{useEffect,useState}from'react';
const API='/api';
const token=()=>localStorage.getItem('np_token')||'';
async function api(p,o={}){const r=await fetch(API+p,{...o,headers:{'Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}:{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'خطا');return d}
function go(p){location.hash=p}
export default function App(){const[boot,setBoot]=useState(null);useEffect(()=>{api('/bootstrap').then(setBoot)},[]);if(!boot)return <div className="loading">NinjaPet</div>;return <main className="appScreen"><section className="mobileHero"><h1>نینجا پت</h1><p>رابط کاربری موبایل در حال آماده‌سازی است.</p><button onClick={()=>go('/#/foods')}>پیدا کردن غذای مناسب</button></section></main>}
