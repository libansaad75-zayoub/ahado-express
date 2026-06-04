// Chargement Google Sheets gviz avec cache et fallback JSON
import {CONFIG} from './config.js?v=price-sync-20260604';
const timeout = ms => new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms));
function normalizeRow(row){
  return {cat:row.cat||'Autres',name:row.name||'',popular:String(row.popular).toLowerCase()==='true'||row.popular==='⭐',icon:row.icon||'🛒',image:row.image||'images/placeholder.jpg',variants:[['label1','price1'],['label2','price2'],['label3','price3']].map(([l,p])=>({label:row[l],price:Number(row[p])})).filter(v=>v.label&&v.price)};
}
function parseGviz(text){
  const json=JSON.parse(text.substring(text.indexOf('{'),text.lastIndexOf('}')+1));
  const headers=json.table.cols.map(c=>c.label||c.id);
  return json.table.rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r.c[i]?.v ?? '']))).map(normalizeRow).filter(p=>p.name);
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
  return data.products.map(normalizeRow);
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
    if(products.length) return cache(products);
    throw new Error('sheet vide');
  }catch(err){
    return cache(await fetchFallback());
  }
}
