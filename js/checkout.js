// Modal checkout, validation et génération lien wa.me pré-rempli
import {CONFIG} from './config.js';
import {getCart,cartTotal} from './cart.js';
import {trackEvent} from './analytics.js';
import {openDialog,closeDialog} from './utils.js';
let payment=CONFIG.payments[0];
export function initCheckout(){
  const district=document.getElementById('district');
  district.innerHTML='<option value="">Choisir un quartier</option>'+CONFIG.districts.map(d=>`<option>${d}</option>`).join('');
  const payments=document.getElementById('payment-options');
  payments.innerHTML=CONFIG.payments.map((p,i)=>`<button type="button" role="radio" aria-checked="${i===0}" data-payment="${p}">${p}</button>`).join('');
}
function orderText(data){
  const lines=getCart().map(i=>`- ${i.name} (${i.label}) x${i.qty} = ${(i.price*i.qty).toLocaleString('fr-FR')} FDJ`).join('\n');
  return `Bonjour AHADO EXPRESS, je veux passer une commande.\n\n${lines}\n\nTotal: ${cartTotal().toLocaleString('fr-FR')} FDJ\nNom: ${data.name}\nTéléphone: ${data.phone}\nQuartier: ${data.district}\nAdresse: ${data.address}\nPaiement: ${data.payment}\n\nMerci.`;
}
export function bindCheckoutEvents(){
  const modal=document.getElementById('checkout-modal'),form=document.getElementById('checkout-form');
  const closeModal=()=>{modal.classList.remove('open');modal.setAttribute('aria-hidden','true');closeDialog();};
  document.getElementById('checkout-open').addEventListener('click',()=>{if(!getCart().length){alert('Votre panier est vide.');return;} modal.classList.add('open');modal.setAttribute('aria-hidden','false');openDialog(modal,closeModal,document.getElementById('customer-name'));});
  document.getElementById('checkout-close').addEventListener('click',closeModal);
  document.getElementById('payment-options').addEventListener('click',e=>{const b=e.target.closest('[data-payment]'); if(!b)return; payment=b.dataset.payment; document.querySelectorAll('[data-payment]').forEach(x=>x.setAttribute('aria-checked',String(x===b)));});
  form.addEventListener('submit',e=>{e.preventDefault(); const data={name:document.getElementById('customer-name').value.trim(),phone:document.getElementById('customer-phone').value.trim(),district:document.getElementById('district').value,address:document.getElementById('address').value.trim(),payment}; if(!data.name||!data.phone||!data.district||!data.address)return; trackEvent('checkout_submit',{total:cartTotal(),payment}); location.href=`https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(orderText(data))}`;});
}
