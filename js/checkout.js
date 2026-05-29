// Modal checkout, validation et génération lien wa.me pré-rempli
import {CONFIG} from './config.js';
import {getCart,cartTotal} from './cart.js';
import {trackEvent} from './analytics.js';
import {esc,openDialog,closeDialog} from './utils.js';
let payment=CONFIG.payments[0];
export function initCheckout(){
  const district=document.getElementById('district');
  district.innerHTML='<option value="">Choisir un quartier</option>'+CONFIG.districts.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');
  const payments=document.getElementById('payment-options');
  payments.innerHTML=CONFIG.payments.map((p,i)=>`<button type="button" role="radio" aria-checked="${i===0}" data-payment="${esc(p)}">${esc(p)}</button>`).join('');
}
function normalizeDjiboutiPhone(raw){
  const digits=String(raw||'').replace(/\D/g,'');
  if(digits.length===8) return `+253${digits}`;
  if(digits.length===11&&digits.startsWith('253')) return `+${digits}`;
  return '';
}
function orderText(data){
  const lines=getCart().map(i=>`- ${i.name} (${i.label}) x${i.qty} = ${(i.price*i.qty).toLocaleString('fr-FR')} FDJ`).join('\n');
  return `Bonjour AHADO EXPRESS, je veux passer une commande.\n\n${lines}\n\nTotal: ${cartTotal().toLocaleString('fr-FR')} FDJ\nNom: ${data.name}\nTéléphone: ${data.phone}\nQuartier: ${data.district}\nAdresse: ${data.address}\nPaiement: ${data.payment}\n\nMerci.`;
}
export function bindCheckoutEvents(){
  const modal=document.getElementById('checkout-modal'),form=document.getElementById('checkout-form');
  const phoneEl=document.getElementById('customer-phone');
  const closeModal=()=>{modal.classList.remove('open');modal.setAttribute('aria-hidden','true');closeDialog();};
  document.getElementById('checkout-open').addEventListener('click',()=>{if(!getCart().length){alert('Votre panier est vide.');return;} modal.classList.add('open');modal.setAttribute('aria-hidden','false');openDialog(modal,closeModal,document.getElementById('customer-name'));});
  document.getElementById('checkout-close').addEventListener('click',closeModal);
  document.getElementById('payment-options').addEventListener('click',e=>{const b=e.target.closest('[data-payment]'); if(!b)return; payment=b.dataset.payment; document.querySelectorAll('[data-payment]').forEach(x=>x.setAttribute('aria-checked',String(x===b)));});
  phoneEl.addEventListener('input',()=>phoneEl.setCustomValidity(''));
  form.addEventListener('submit',e=>{e.preventDefault(); const normalizedPhone=normalizeDjiboutiPhone(phoneEl.value); if(!normalizedPhone){phoneEl.setCustomValidity('Entrez un numéro djiboutien valide : 8 chiffres, ex. 77 78 83 02.'); phoneEl.reportValidity(); return;} const data={name:document.getElementById('customer-name').value.trim(),phone:normalizedPhone,district:document.getElementById('district').value,address:document.getElementById('address').value.trim(),payment}; if(!data.name||!data.district||!data.address){form.reportValidity();return;} trackEvent('checkout_submit',{total:cartTotal(),payment}); location.href=`https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(orderText(data))}`;});
}
