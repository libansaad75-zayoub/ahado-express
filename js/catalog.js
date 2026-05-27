// Rendu catalogue, filtres catégories et recherche — cartes emoji
import {addToCart} from './cart.js';
import {esc} from './utils.js';
let products=[]; let activeCat='Tous'; let query='';
const productId=(p,v)=>`${p.name}-${v.label}`.replace(/\s+/g,'-').toLowerCase();

// Teinte stable par catégorie (HSL pastel) pour organiser visuellement le catalogue dense
function catHue(cat){let h=0;for(let i=0;i<cat.length;i++)h=(h*31+cat.charCodeAt(i))%360;return h;}
function tileStyle(cat){const h=catHue(cat);return `--tile-bg:hsl(${h} 78% 92%);--tile-ring:hsl(${h} 68% 74%)`;}

export function initCatalog(data){products=data; renderFilters(); renderCatalog();}
function cats(){return ['Tous',...new Set(products.map(p=>p.cat))];}
function filtered(){return products.filter(p=>(activeCat==='Tous'||p.cat===activeCat)&&p.name.toLowerCase().includes(query.toLowerCase()));}

function renderFilters(){
  const el=document.getElementById('category-filters');
  el.innerHTML=cats().map(c=>{
    const n=c==='Tous'?products.length:products.filter(p=>p.cat===c).length;
    return `<button class="filter-btn ${c===activeCat?'active':''}" data-cat="${c}" aria-pressed="${c===activeCat}">${c} <span class="filter-count">${n}</span></button>`;
  }).join('');
}

export function renderCatalog(){
  const grid=document.getElementById('catalog-grid');
  const list=filtered();
  const count=document.getElementById('catalog-count');
  if(count) count.textContent=list.length;
  grid.innerHTML=list.map(p=>{
    const hasPhoto=p.image&&!/placeholder/.test(p.image);
    return `
    <article class="product-card">
      <div class="product-media ${hasPhoto?'has-photo':''}" style="${tileStyle(p.cat)}" ${hasPhoto?'':`role="img" aria-label="${esc(p.name)}"`}>
        ${hasPhoto?`<img class="product-photo" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async">`:`<span class="product-emoji">${esc(p.icon||'🛒')}</span>`}
        ${p.popular?'<span class="badge">⭐ Populaire</span>':''}
      </div>
      <div class="product-body">
        <p class="product-cat">${esc(p.cat)}</p>
        <h3 class="product-name">${esc(p.name)}</h3>
        <div class="variants">
          ${p.variants.slice(0,1).map(v=>`<div class="variant-row">
            <span class="variant-label">${esc(v.label)}</span>
            <strong class="price">${Number(v.price).toLocaleString('fr-FR')} FDJ</strong>
            <button class="btn btn-add" data-add='${esc(JSON.stringify({id:productId(p,v),name:p.name,label:v.label,price:Number(v.price)}))}' aria-label="Ajouter ${esc(p.name)} ${esc(v.label)} au panier">+</button>
          </div>`).join('')}
        </div>
      </div>
    </article>`;}).join('') || '<p class="catalog-empty">Aucun produit trouvé.</p>';
}

export function bindCatalogEvents(){
  document.getElementById('category-filters').addEventListener('click',e=>{const btn=e.target.closest('[data-cat]'); if(!btn)return; activeCat=btn.dataset.cat; renderFilters(); renderCatalog();});
  document.getElementById('search').addEventListener('input',e=>{query=e.target.value; renderCatalog();});
  document.addEventListener('click',e=>{const btn=e.target.closest('[data-add]'); if(btn) addToCart(JSON.parse(btn.dataset.add));});
}
