// Chargement Google Sheets gviz avec cache et fallback JSON
import {CONFIG} from './config.js?v=sheet-expire-20260605';
const timeout = ms => new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms));
const normStatus=value=>String(value??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
function isExpired(row){
  const raw=row.statut??row.status??row.expiration??row.expirer??row.expire??row['expir\u00e9']??'';
  const status=normStatus(raw).replace(/[\s_-]+/g,' ');
  if(!status||status.includes('non expire')) return false;
  return status==='expire'||status==='expirer'||status==='expired';
}
function normalizeRow(row){
  const expired=isExpired(row);
  return {cat:String(row.cat||'Autres').trim()||'Autres',name:String(row.name||'').trim(),popular:String(row.popular).toLowerCase()==='true'||row.popular==='\u2b50',icon:row.icon||'\ud83d\uded2',image:row.image||'images/placeholder.jpg',expired,variants:[['label1','price1'],['label2','price2'],['label3','price3']].map(([l,p])=>({label:row[l],price:Number(row[p])})).filter(v=>v.label&&v.price)};
}
function parseGviz(text){
  const json=JSON.parse(text.substring(text.indexOf('{'),text.lastIndexOf('}')+1));
  const headers=json.table.cols.map(c=>c.label||c.id);
  return json.table.rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r.c[i]?.v ?? '']))).map(normalizeRow).filter(p=>p.name&&!p.expired);
}
async function fetchSheet(){
  if(CONFIG.sheetId.includes('REMPLACER')) throw new Error('sheet id absent');
  const url=`https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(CONFIG.sheetName)}`;
  const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error('sheet indisponible');
  return parseGviz(await res.text());
}
async function fetchFallback(){
  const res=await fetch('data/fallback.json');
  const data=await res.json();
  return data.products.map(normalizeRow).filter(p=>p.name&&!p.expired);
}
// Unifie les variantes de catégorie ("Epices"/"épices" → "Épices") : on regroupe par
// clé sans accents/casse et chaque groupe prend la graphie majoritaire.
function unifyCats(products){
  const key=c=>c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const counts={};
  for(const p of products){ const k=key(p.cat); (counts[k]??={})[p.cat]=(counts[k][p.cat]||0)+1; }
  const best={};
  for(const k in counts) best[k]=Object.entries(counts[k]).sort((a,b)=>b[1]-a[1])[0][0];
  for(const p of products) p.cat=best[key(p.cat)];
  return products;
}
// Les photos sont gérées dans le dépôt (fallback.json), pas dans la feuille :
// quand la feuille ne renseigne pas d'image, on reprend celle du fallback (par nom).
async function imageMap(){
  try{
    const res=await fetch('data/fallback.json');
    const data=await res.json();
    return Object.fromEntries(data.products.filter(p=>p.image).map(p=>[p.name,p.image]));
  }catch{ return {}; }
}
function readCache(){
  try{
    const cached=JSON.parse(localStorage.getItem(CONFIG.cacheKey)||'null');
    return cached && Array.isArray(cached.products) && cached.products.length && Number(cached.time) ? cached : null;
  }catch{
    localStorage.removeItem(CONFIG.cacheKey);
    return null;
  }
}
export async function loadCatalog(){
  const cached=readCache();
  // n'utiliser le cache que s'il contient réellement des produits (évite le "0 produits" collant)
  if(cached && Date.now()-cached.time<CONFIG.cacheTTL) return cached.products;
  // ne mettre en cache QUE si la liste est non vide
  const cache=products=>{ if(Array.isArray(products)&&products.length){ try{ localStorage.setItem(CONFIG.cacheKey,JSON.stringify({time:Date.now(),products})); }catch{} } return products; };
  try{
    const products=await Promise.race([fetchSheet(),timeout(4000)]);
    if(products.length){
      unifyCats(products);
      const map=await imageMap();
      for(const p of products){ if(!p.image||/placeholder/i.test(p.image)) p.image=map[p.name]||p.image; }
      return cache(products);
    }
    throw new Error('sheet vide');
  }catch(err){
    return cache(await fetchFallback());
  }
}
