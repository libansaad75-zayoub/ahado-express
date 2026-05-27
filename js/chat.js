// Chat guidé AHADO EXPRESS (Phase 1 — sans IA).
// Comprend les produits par mots-clés (nom OU catégorie) sur le vrai catalogue,
// remplit le panier existant, puis passe la main au checkout (lien wa.me).
import {CONFIG} from './config.js';
import {addToCart, getCart, cartTotal} from './cart.js';
import {trackEvent} from './analytics.js';
import {esc, openDialog, closeDialog} from './utils.js';

let products = [];
let opened = false;
let history = [];        // historique de conversation pour l'IA
let aiAvailable = true;  // passe à false si la fonction renvoie "mock" (pas de clé) → repli Phase 1

// Normalisation insensible aux accents/casse
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Quelques synonymes courants → catégorie du catalogue
const SYNONYMS = {
  'pate':'Spaghetti','pates':'Spaghetti','spaghetti':'Spaghetti','macaroni':'Spaghetti',
  'eau':'Boissons','soda':'Boissons','jus':'Boissons','boisson':'Boissons',
  'savon':'Hygiène','shampoing':'Hygiène','dentifrice':'Hygiène',
  'lessive':'Nettoyage','javel':'Nettoyage','nettoyant':'Nettoyage',
  'huile':'Huiles','lait':'Lait Poudre','cafe':'Petit Déj','the':'Petit Déj',
  'epice':'Épices','epices':'Épices','conserve':'Conserves','bebe':'Bébé'
};

const productId = (p, v) => `${p.name}-${v.label}`.replace(/\s+/g, '-').toLowerCase();

export function initChat(data) {
  products = data || [];
}

/* ---------- rendu des messages ---------- */
function el(id) { return document.getElementById(id); }

function pushMessage(role, innerHTML) {
  const wrap = el('chat-messages');
  if (!wrap) return;
  const msg = document.createElement('div');
  msg.className = `chat-msg chat-msg-${role}`;
  const avatar = role === 'bot' ? 'AE' : 'V';
  msg.innerHTML = `<span class="chat-avatar" aria-hidden="true">${avatar}</span>${innerHTML}`;
  wrap.appendChild(msg);
  wrap.scrollTop = wrap.scrollHeight;
}
const botSay = text => pushMessage('bot', `<div class="chat-bubble">${esc(text)}</div>`);
const botHTML = html => pushMessage('bot', html);
const userSay = text => pushMessage('user', `<div class="chat-bubble">${esc(text)}</div>`);

function showTyping() {
  const wrap = el('chat-messages'); if (!wrap) return null;
  const m = document.createElement('div');
  m.className = 'chat-msg chat-msg-bot';
  m.innerHTML = '<span class="chat-avatar" aria-hidden="true">AE</span><div class="chat-bubble chat-typing">…</div>';
  wrap.appendChild(m); wrap.scrollTop = wrap.scrollHeight;
  return m;
}
const removeTyping = m => m && m.remove();

/* ---------- matching catalogue ---------- */
function categoriesIn(text) {
  const n = norm(text);
  const cats = new Set();
  // catégories réelles : match sur la catégorie entière ou un mot ≥4 lettres
  [...new Set(products.map(p => p.cat))].forEach(c => {
    const nc = norm(c);
    if (n.includes(nc) || nc.split(/\s+/).some(w => w.length >= 4 && n.includes(w))) cats.add(c);
  });
  // synonymes
  Object.keys(SYNONYMS).forEach(k => { if (new RegExp(`\\b${k}\\b`).test(n)) cats.add(SYNONYMS[k]); });
  return [...cats];
}
function namesIn(text) {
  const n = norm(text);
  return products.filter(p => norm(p.name).length >= 3 && n.includes(norm(p.name)));
}
function parseQty(text) {
  const m = norm(text).match(/(\d{1,2})/);
  const q = m ? parseInt(m[1], 10) : 1;
  return Math.min(Math.max(q, 1), 50);
}

/* ---------- réponses ---------- */
function showCart() {
  const c = getCart();
  if (!c.length) return;
  const total = cartTotal();
  const free = total >= CONFIG.freeDeliveryThreshold;
  const lines = c.map(i => `<div class="chat-cart-line"><span>${esc(i.name)} ${esc(i.label)} × ${i.qty}</span><span>${(i.price * i.qty).toLocaleString('fr-FR')} FDJ</span></div>`).join('');
  botHTML(`<div class="chat-cart">
      <div class="chat-cart-title">🛒 Votre panier</div>
      ${lines}
      <div class="chat-cart-total"><span>Total</span><span>${total.toLocaleString('fr-FR')} FDJ</span></div>
      <div class="chat-cart-free">${free ? '✓ Livraison gratuite (seuil atteint)' : `Plus que ${(CONFIG.freeDeliveryThreshold - total).toLocaleString('fr-FR')} FDJ pour la livraison gratuite`}</div>
      <button type="button" class="chat-finalize" data-action="finalize">Finaliser ma commande</button>
    </div>`);
}

function addVariantToCart(p, v, qty) {
  for (let k = 0; k < qty; k++) addToCart({ id: productId(p, v), name: p.name, label: v.label, price: Number(v.price) });
  trackEvent('chat_add_to_cart', { product: p.name, qty });
}

function proposeProducts(list, qty) {
  // Construit des chips de choix (produit + 1re variante)
  const chips = list.slice(0, 8).map(p => {
    const v = p.variants[0];
    if (!v) return '';
    const idx = products.indexOf(p);
    return `<button type="button" class="chat-chip" data-pick="${idx}" data-qty="${qty}">${esc(p.icon || '🛒')} ${esc(p.name)} — ${Number(v.price).toLocaleString('fr-FR')} FDJ</button>`;
  }).join('');
  botHTML(`<div class="chat-bubble">Voici ce que j'ai trouvé, lequel voulez-vous ?
      <div class="chat-chips">${chips}</div></div>`);
}

// Aiguillage : tente l'IA (Netlify Function + Gemini) puis retombe sur le chat guidé.
async function handleMessage(text) {
  if (aiAvailable && await tryAI(text)) return;
  handleInput(text); // repli : compréhension par mots-clés (Phase 1)
}

async function tryAI(text) {
  const typing = showTyping();
  try {
    const res = await fetch('/.netlify/functions/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text, history, catalog: products.map(p => ({ name: p.name, cat: p.cat })) }),
    });
    removeTyping(typing);
    if (!res.ok) return false;
    const data = await res.json();
    if (data.mode === 'busy') { botSay(data.reply || 'Trop de messages, réessayez dans un instant.'); return true; }
    if (data.mode !== 'ai') { aiAvailable = false; return false; } // pas de clé/erreur → repli Phase 1
    if (data.reply) botSay(data.reply);
    history.push({ role: 'user', text }); history.push({ role: 'model', text: data.reply || '' });
    history = history.slice(-8);
    let added = 0;
    (data.items || []).forEach(it => {
      const p = products.find(x => norm(x.name) === norm(it.name));
      const v = p?.variants?.[0];
      if (p && v) { addVariantToCart(p, v, it.qty || 1); added++; }
    });
    if (added) showCart();
    if (data.action === 'checkout' && getCart().length) finalize();
    return true;
  } catch (e) {
    removeTyping(typing);
    return false;
  }
}

function handleInput(text) {
  const qty = parseQty(text);
  const names = namesIn(text);

  // 1) Match direct sur une marque/produit → ajout immédiat
  if (names.length) {
    let added = 0;
    names.forEach(p => { const v = p.variants[0]; if (v) { addVariantToCart(p, v, qty); added++; } });
    if (added === 1) botSay(`C'est noté ✅ (${qty} × ${names[0].name}).`);
    else botSay(`J'ai ajouté ${added} produits ✅. Vous ajusterez les quantités au panier si besoin.`);
    showCart();
    return;
  }

  // 2) Match par catégorie → proposer les options
  const cats = categoriesIn(text);
  if (cats.length) {
    const list = products.filter(p => cats.includes(p.cat));
    if (list.length) { proposeProducts(list, qty); return; }
  }

  // 3) Aide : intention « commander / c'est tout »
  if (/\b(commander|finaliser|c.?est tout|terminer|valider)\b/.test(norm(text))) {
    if (getCart().length) { botSay('Parfait ! Je vous emmène vers la validation.'); finalize(); }
    else botSay('Votre panier est vide pour l\'instant. Dites-moi ce que vous voulez (ex. « riz », « huile », « coca »).');
    return;
  }

  // 4) Rien trouvé
  botSay("Je n'ai pas trouvé ce produit. Essayez un nom ou une catégorie : riz, huile, lait, boissons, hygiène…");
}

function finalize() {
  const btn = el('checkout-open');
  if (!btn) return;
  toggle(false); // ferme le chat proprement (libère le focus-trap)
  btn.click(); // réutilise le checkout existant (nom/quartier/paiement → wa.me)
}

/* ---------- ouverture / fermeture ---------- */
function toggle(force) {
  const panel = el('chat-panel'); const fab = el('chat-fab');
  if (!panel) return;
  opened = force !== undefined ? force : !opened;
  panel.classList.toggle('open', opened);
  fab.setAttribute('aria-expanded', String(opened));
  if (opened) {
    if (!el('chat-messages').childElementCount) {
      botSay('Bonjour 👋 Je suis l\'assistant AHADO EXPRESS.');
      botSay('Dites-moi ce que vous voulez commander (ex. « riz », « 2 huile », « coca »), je remplis votre panier.');
    }
    openDialog(panel, () => toggle(false), el('chat-input')); // focus-trap + Échap
  } else {
    closeDialog();
  }
}

export function bindChatEvents() {
  const fab = el('chat-fab'); if (!fab) return;
  fab.addEventListener('click', () => toggle());
  el('chat-close')?.addEventListener('click', () => toggle(false));
  el('chat-send')?.addEventListener('click', send);
  el('chat-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') send(); });

  // Clics délégués dans la zone messages (chips + finaliser)
  el('chat-messages')?.addEventListener('click', e => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const p = products[Number(pick.dataset.pick)]; const v = p?.variants[0];
      if (p && v) { addVariantToCart(p, v, Number(pick.dataset.qty) || 1); userSay(p.name); botSay(`C'est noté ✅ (${pick.dataset.qty || 1} × ${p.name}).`); showCart(); }
      return;
    }
    if (e.target.closest('[data-action="finalize"]')) finalize();
  });

  function send() {
    const input = el('chat-input'); const text = input.value.trim();
    if (!text) return;
    userSay(text); input.value = '';
    handleMessage(text);
  }
}
