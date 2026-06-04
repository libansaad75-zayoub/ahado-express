// Modal checkout, validation et generation lien wa.me pre-rempli
import {CONFIG} from './config.js?v=price-sync-20260604';
import {getCart} from './cart.js?v=price-sync-20260604';
import {trackEvent} from './analytics.js';
import {esc, openDialog, closeDialog} from './utils.js';

let payment = CONFIG.payments[0];
let productsRef = [];
const productId = (p, v) => `${p.name}-${v.label}`.replace(/\s+/g, '-').toLowerCase();

export function initCheckout(products = []) {
  productsRef = products;
  const district = document.getElementById('district');
  district.innerHTML = '<option value="">Choisir un quartier</option>' + CONFIG.districts.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
  const payments = document.getElementById('payment-options');
  payments.innerHTML = CONFIG.payments.map((p, i) => `<button type="button" role="radio" aria-checked="${i === 0}" tabindex="${i === 0 ? '0' : '-1'}" data-payment="${esc(p)}">${esc(p)}</button>`).join('');
}

function normalizeDjiboutiPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 8) return `+253${digits}`;
  if (digits.length === 11 && digits.startsWith('253')) return `+${digits}`;
  return '';
}

function verifiedCart() {
  const variants = new Map();
  productsRef.forEach(p => (p.variants || []).forEach(v => variants.set(productId(p, v), {
    id: productId(p, v),
    name: p.name,
    label: v.label,
    price: Number(v.price)
  })));
  return getCart().map(item => {
    const ref = variants.get(item.id);
    return ref ? {...ref, qty: item.qty} : null;
  }).filter(Boolean);
}

function orderText(data) {
  const lines = data.items.map(i => `- ${i.name} (${i.label}) x${i.qty} = ${(i.price * i.qty).toLocaleString('fr-FR')} FDJ`).join('\n');
  return `Bonjour AHADO EXPRESS, je veux passer une commande.\n\n${lines}\n\nTotal: ${data.total.toLocaleString('fr-FR')} FDJ\nNom: ${data.name}\nTelephone: ${data.phone}\nQuartier: ${data.district}\nAdresse: ${data.address}\nPaiement: ${data.payment}\n\nPrix a confirmer par AHADO selon le catalogue du jour.\nMerci.`;
}

function selectPayment(button) {
  if (!button) return;
  payment = button.dataset.payment;
  document.querySelectorAll('[data-payment]').forEach(x => {
    const active = x === button;
    x.setAttribute('aria-checked', String(active));
    x.tabIndex = active ? 0 : -1;
  });
  button.focus();
}

export function bindCheckoutEvents() {
  const modal = document.getElementById('checkout-modal');
  const form = document.getElementById('checkout-form');
  const phoneEl = document.getElementById('customer-phone');
  const closeModal = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modal.inert = true;
    closeDialog();
  };

  document.getElementById('checkout-open').addEventListener('click', () => {
    if (!getCart().length) {
      alert('Votre panier est vide.');
      return;
    }
    modal.inert = false;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    openDialog(modal, closeModal, document.getElementById('customer-name'));
  });
  document.getElementById('checkout-close').addEventListener('click', closeModal);

  const paymentOptions = document.getElementById('payment-options');
  paymentOptions.addEventListener('click', e => selectPayment(e.target.closest('[data-payment]')));
  paymentOptions.addEventListener('keydown', e => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', ' ', 'Enter'];
    if (!keys.includes(e.key)) return;
    const buttons = [...document.querySelectorAll('[data-payment]')];
    const current = document.activeElement.closest?.('[data-payment]') || buttons.find(b => b.getAttribute('aria-checked') === 'true');
    let index = Math.max(0, buttons.indexOf(current));
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') index = (index + 1) % buttons.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') index = (index - 1 + buttons.length) % buttons.length;
    e.preventDefault();
    selectPayment(buttons[index]);
  });

  phoneEl.addEventListener('input', () => phoneEl.setCustomValidity(''));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const normalizedPhone = normalizeDjiboutiPhone(phoneEl.value);
    if (!normalizedPhone) {
      phoneEl.setCustomValidity('Entrez un numero djiboutien valide : 8 chiffres, ex. 77 78 83 02.');
      phoneEl.reportValidity();
      return;
    }
    const items = verifiedCart();
    if (!items.length) {
      alert('Votre panier doit etre actualise. Rechargez la page puis ajoutez vos produits.');
      return;
    }
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const data = {
      name: document.getElementById('customer-name').value.trim(),
      phone: normalizedPhone,
      district: document.getElementById('district').value,
      address: document.getElementById('address').value.trim(),
      payment,
      items,
      total
    };
    if (!data.name || !data.district || !data.address) {
      form.reportValidity();
      return;
    }
    trackEvent('checkout_submit', {total, payment});
    location.href = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(orderText(data))}`;
  });
}
