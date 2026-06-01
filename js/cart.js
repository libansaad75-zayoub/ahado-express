// Gestion panier, localStorage, barre livraison gratuite et upsell
import {CONFIG} from './config.js';
import {trackEvent} from './analytics.js';
import {translate} from './i18n.js';
import {esc} from './utils.js';
const key='ahado_cart_v1';
let cart=JSON.parse(localStorage.getItem(key)||'[]');
let productsRef=[];
const save=()=>localStorage.setItem(key,JSON.stringify(cart));
export const getCart=()=>cart;
export const cartTotal=()=>cart.reduce((s,i)=>s+i.price*i.qty,0);
export function addToCart(item){
  const found=cart.find(i=>i.id===item.id); found?found.qty++:cart.push({...item,qty:1}); save(); renderCart(); trackEvent('add_to_cart',{product:item.name,price:item.price});
}
export function removeFromCart(id){cart=cart.filter(i=>i.id!==id);save();renderCart();}
export function changeQty(id,delta){const i=cart.find(x=>x.id===id); if(!i)return; i.qty=Math.max(1,i.qty+delta); save(); renderCart();}
export function setProductsForUpsell(products){productsRef=products;}
export function renderCart(){
  const count=document.getElementById('cart-count'),items=document.getElementById('cart-items'),total=document.getElementById('cart-total'),progress=document.getElementById('free-progress'),pAmount=document.getElementById('progress-amount'),deliveryStatus=document.getElementById('delivery-status');
  const totalAmount=cartTotal();
  if(!items)return; count.textContent=cart.reduce((s,i)=>s+i.qty,0); total.textContent=`${totalAmount.toLocaleString('fr-FR')} FDJ`; progress.value=Math.min(totalAmount,CONFIG.freeDeliveryThreshold); progress.max=CONFIG.freeDeliveryThreshold; pAmount.textContent=`${Math.round(Math.min(100,totalAmount/CONFIG.freeDeliveryThreshold*100))}%`;
  if(deliveryStatus){
    const remaining=Math.max(0,CONFIG.freeDeliveryThreshold-totalAmount).toLocaleString('fr-FR');
    deliveryStatus.textContent=totalAmount>=CONFIG.freeDeliveryThreshold?translate('delivery.statusFree'):translate('delivery.statusRemaining').replace('{amount}', remaining);
  }
  items.innerHTML=cart.length?cart.map(i=>{
    const removeLabel=translate('cart.removeItemLabel').replace('{name}', i.name);
    return `<div class="cart-line"><div class="cart-line-row"><strong>${esc(i.name)}</strong><button class="icon-btn" aria-label="${esc(removeLabel)}" data-remove="${esc(i.id)}">×</button></div><div class="cart-line-row"><span>${esc(i.label)}</span><strong>${(i.price*i.qty).toLocaleString('fr-FR')} FDJ</strong></div><div><button data-qty="${esc(i.id)}" data-delta="-1" aria-label="${esc(translate('cart.decreaseQty'))}">−</button> <span>${i.qty}</span> <button data-qty="${esc(i.id)}" data-delta="1" aria-label="${esc(translate('cart.increaseQty'))}">+</button></div></div>`;
  }).join(''):`<p>${esc(translate('cart.empty'))}</p>`;
  const upsell=document.getElementById('upsell-list');
  const suggestions=productsRef.filter(p=>p.popular && !cart.some(c=>c.name===p.name)).slice(0,3);
  upsell.innerHTML=suggestions.map(p=>`<button class="filter-btn" data-upsell="${esc(p.name)}">${esc(p.icon)} ${esc(p.name)}</button>`).join('');
}
export function bindCartEvents(){
  document.addEventListener('click',e=>{const r=e.target.closest('[data-remove]'); if(r) removeFromCart(r.dataset.remove); const q=e.target.closest('[data-qty]'); if(q) changeQty(q.dataset.qty,Number(q.dataset.delta));});
  window.addEventListener('ahado:langchange',renderCart);
}
