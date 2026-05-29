// Initialisation globale du site
import {loadCatalog} from './data-loader.js';
import {initCatalog,bindCatalogEvents} from './catalog.js';
import {bindCartEvents,renderCart,setProductsForUpsell,addToCart} from './cart.js';
import {initCheckout,bindCheckoutEvents} from './checkout.js';
import {applyI18n,getLang} from './i18n.js';
import {bindTrackedLinks} from './analytics.js';
import {initChat,bindChatEvents} from './chat.js';
import {openDialog,closeDialog} from './utils.js';
function bindUI(products){
  const drawer=document.getElementById('cart-drawer');
  const closeCart=()=>{drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true');drawer.inert=true;closeDialog();};
  document.getElementById('cart-open').addEventListener('click',()=>{drawer.inert=false;drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');openDialog(drawer,closeCart);});
  document.getElementById('cart-close').addEventListener('click',closeCart);
  document.getElementById('lang-select').addEventListener('change',e=>applyI18n(e.target.value));
  document.addEventListener('click',e=>{const b=e.target.closest('[data-upsell]'); if(!b)return; const p=products.find(x=>x.name===b.dataset.upsell); if(p&&p.variants[0]) addToCart({id:`${p.name}-${p.variants[0].label}`.replace(/\s+/g,'-').toLowerCase(),name:p.name,label:p.variants[0].label,price:p.variants[0].price});});
}
function injectSchema(products){
  const script=document.createElement('script'); script.type='application/ld+json';
  script.textContent=JSON.stringify({'@context':'https://schema.org','@type':'LocalBusiness',name:'AHADO EXPRESS',url:'https://ahadoexpress.net',telephone:'+253 77 78 83 02',areaServed:'Djibouti-Ville',founder:{'@type':'Person',name:'Liban Ali'},makesOffer:products.slice(0,50).map((p,i)=>({'@type':'Offer',position:i+1,itemOffered:{'@type':'Product',name:p.name,category:p.cat}}))});
  document.head.appendChild(script);
}
document.addEventListener('DOMContentLoaded',async()=>{
  const lang=getLang(); document.getElementById('lang-select').value=lang; applyI18n(lang); document.getElementById('current-year').textContent=new Date().getFullYear();
  let products=[];
  try{ products=await loadCatalog(); }catch(e){ products=[]; }
  if(!products.length){
    const grid=document.getElementById('catalog-grid');
    if(grid) grid.innerHTML='<p class="catalog-empty">Catalogue momentanément indisponible. Commandez directement sur <a href="https://wa.me/25377788302">WhatsApp</a>.</p>';
  } else {
    setProductsForUpsell(products); initCatalog(products);
  }
  initCheckout(); renderCart(); injectSchema(products); initChat(products);
  const hc=document.getElementById('hero-product-count'); if(hc && products.length) hc.textContent=products.length;
  bindCatalogEvents(); bindCartEvents(); bindCheckoutEvents(); bindTrackedLinks(); bindUI(products); bindChatEvents();
});
