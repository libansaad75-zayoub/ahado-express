// Rendu catalogue, filtres catégories et recherche — cartes emoji
import {addToCart} from './cart.js?v=photo-first-20260604';
import {translate} from './i18n.js?v=photo-first-20260604';
import {esc} from './utils.js';
let products=[]; let activeCat='Tous'; let query='';
const productId=(p,v)=>`${p.name}-${v.label}`.replace(/\s+/g,'-').toLowerCase();
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const hasPhoto=p=>p.image&&!/placeholder/i.test(p.image);

const catClass=cat=>`cat-${norm(cat).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'autres'}`;

export function initCatalog(data){products=data; renderFilters(); renderCatalog();}
function cats(){return ['Tous',...new Set(products.map(p=>p.cat))];}
function filtered(){
  const terms=norm(query).split(/\s+/).filter(Boolean);
  return products.map((p,index)=>({p,index})).filter(({p})=>{
    if(activeCat!=='Tous'&&p.cat!==activeCat) return false;
    if(!terms.length) return true;
    const hay=[p.name,p.cat,p.icon,...p.variants.map(v=>v.label)].map(norm).join(' ');
    return terms.every(t=>hay.includes(t));
  }).sort((a,b)=>Number(hasPhoto(b.p))-Number(hasPhoto(a.p))||Number(b.p.popular)-Number(a.p.popular)||a.index-b.index).map(item=>item.p);
}

function renderFilters(){
  const el=document.getElementById('category-filters');
  if(!el) return;
  el.innerHTML=cats().map(c=>{
    const n=c==='Tous'?products.length:products.filter(p=>p.cat===c).length;
    return `<button class="filter-btn ${c===activeCat?'active':''}" data-cat="${esc(c)}" aria-pressed="${c===activeCat}">${esc(c)} <span class="filter-count">${n}</span></button>`;
  }).join('');
}

export function renderCatalog(){
  const grid=document.getElementById('catalog-grid');
  const list=filtered();
  const count=document.getElementById('catalog-count');
  const photoCount=document.getElementById('catalog-photo-count');
  if(count) count.textContent=list.length;
  if(photoCount){
    const n=list.filter(hasPhoto).length;
    photoCount.textContent=translate('catalog.photoCount').replace('{count}', n);
    photoCount.hidden=!n;
  }
  grid.innerHTML=list.map(p=>{
    const photo=hasPhoto(p);
    const primaryVariant=p.variants[0];
    return `
    <article class="product-card ${photo?'product-card-photo':''}">
      <div class="product-media ${catClass(p.cat)} ${photo?'has-photo':''}" ${photo?'':`role="img" aria-label="${esc(p.name)}"`}>
        ${photo?`<img class="product-photo" src="${esc(p.image)}" alt="${esc(p.name)}" width="720" height="720" loading="lazy" decoding="async"><span class="photo-badge">${esc(translate('catalog.photoBadge'))}</span>`:`<span class="product-emoji">${esc(p.icon||'🛒')}</span>`}
        ${p.popular?'<span class="badge">⭐ Populaire</span>':''}
      </div>
      <div class="product-body">
        <p class="product-cat">${esc(p.cat)}</p>
        <h3 class="product-name">${esc(p.name)}</h3>
        <div class="variants">
          ${primaryVariant?`<div class="variant-row">
            <span class="variant-label">${esc(primaryVariant.label)}</span>
            <strong class="price">${Number(primaryVariant.price).toLocaleString('fr-FR')} FDJ</strong>
            <button class="btn btn-add" data-add='${esc(JSON.stringify({id:productId(p,primaryVariant),name:p.name,label:primaryVariant.label,price:Number(primaryVariant.price)}))}' aria-label="Ajouter ${esc(p.name)} ${esc(primaryVariant.label)} au panier">+</button>
          </div>`:''}
        </div>
      </div>
    </article>`;}).join('') || '<p class="catalog-empty">Aucun produit trouvé.</p>';
}

export function bindCatalogEvents(){
  const filters=document.getElementById('category-filters');
  if(filters) filters.addEventListener('click',e=>{const btn=e.target.closest('[data-cat]'); if(!btn)return; activeCat=btn.dataset.cat; renderFilters(); renderCatalog();});
  document.getElementById('search').addEventListener('input',e=>{query=e.target.value; renderCatalog();});
  window.addEventListener('ahado:langchange',renderCatalog);
  document.addEventListener('click',e=>{const btn=e.target.closest('[data-add]'); if(btn) addToCart(JSON.parse(btn.dataset.add));});
}
