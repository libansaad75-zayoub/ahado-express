// Gestion panier, localStorage, barre livraison gratuite et upsell
import {CONFIG} from './config.js';
import {trackEvent} from './analytics.js';
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
  const count=document.getElementById('cart-count'),items=document.getElementById('cart-items'),total=document.getElementById('cart-total'),progress=document.getElementById('free-progress'),pAmount=document.getElementById('progress-amount');
  if(!items)return; count.textContent=cart.reduce((s,i)=>s+i.qty,0); total.textContent=`${cartTotal().toLocaleString('fr-FR')} FDJ`; progress.value=Math.min(cartTotal(),CONFIG.freeDeliveryThreshold); pAmount.textContent=`${Math.round(Math.min(100,cartTotal()/CONFIG.freeDeliveryThreshold*100))}%`;
  items.innerHTML=cart.length?cart.map(i=>`<div class="cart-line"><div class="cart-line-row"><strong>${i.name}</strong><button class="icon-btn" aria-label="Supprimer ${i.name}" data-remove="${i.id}">×</button></div><div class="cart-line-row"><span>${i.label}</span><strong>${(i.price*i.qty).toLocaleString('fr-FR')} FDJ</strong></div><div><button data-qty="${i.id}" data-delta="-1" aria-label="Réduire quantité">−</button> <span>${i.qty}</span> <button data-qty="${i.id}" data-delta="1" aria-label="Augmenter quantité">+</button></div></div>`).join(''):'<p>Votre panier est vide.</p>';
  const upsell=document.getElementById('upsell-list');
  const suggestions=productsRef.filter(p=>p.popular && !cart.some(c=>c.name===p.name)).slice(0,3);
  upsell.innerHTML=suggestions.map(p=>`<button class="filter-btn" data-upsell="${p.name}">${p.icon} ${p.name}</button>`).join('');
}
export function bindCartEvents(){
  document.addEventListener('click',e=>{const r=e.target.closest('[data-remove]'); if(r) removeFromCart(r.dataset.remove); const q=e.target.closest('[data-qty]'); if(q) changeQty(q.dataset.qty,Number(q.dataset.delta));});
}
