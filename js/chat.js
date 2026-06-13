// Chat guidé AHADO EXPRESS (Phase 1 — sans IA).
// Comprend les produits par mots-clés (nom OU catégorie) sur le vrai catalogue,
// remplit le panier existant, puis passe la main au checkout (lien wa.me).
import {CONFIG} from './config.js?v=price-sync-20260604';
import {addToCart, getCart, cartTotal} from './cart.js?v=price-sync-20260604';
import {trackEvent} from './analytics.js';
import {openDialog, closeDialog} from './utils.js';
import {translate} from './i18n.js?v=menu-mobile-20260613';

// Traduit une clé i18n dans la langue courante, avec interpolation {var}.
const t = (k, vars) => { let s = translate(k); if (vars) for (const [a, b] of Object.entries(vars)) s = s.replaceAll('{' + a + '}', String(b)); return s; };

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

// Tout le rendu du chat est construit en DOM (createElement/textContent) :
// AUCUN innerHTML avec données dynamiques → pas de surface XSS, même si une
// donnée future (catalogue, réponse IA) arrivait non échappée.
function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pushMessage(role, ...nodes) {
  const wrap = el('chat-messages');
  if (!wrap) return null;
  const msg = make('div', `chat-msg chat-msg-${role}`);
  const avatar = make('span', 'chat-avatar', role === 'bot' ? 'AE' : 'V');
  avatar.setAttribute('aria-hidden', 'true');
  msg.append(avatar, ...nodes);
  wrap.appendChild(msg);
  wrap.scrollTop = wrap.scrollHeight;
  return msg;
}
const botSay = text => pushMessage('bot', make('div', 'chat-bubble', text));
const userSay = text => pushMessage('user', make('div', 'chat-bubble', text));

function showTyping() {
  return pushMessage('bot', make('div', 'chat-bubble chat-typing', '…'));
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
  const cart = make('div', 'chat-cart');
  cart.appendChild(make('div', 'chat-cart-title', t('chat.cartTitle')));
  c.forEach(i => {
    const line = make('div', 'chat-cart-line');
    line.appendChild(make('span', '', `${i.name} ${i.label} × ${i.qty}`));
    line.appendChild(make('span', '', `${(i.price * i.qty).toLocaleString('fr-FR')} FDJ`));
    cart.appendChild(line);
  });
  const totalRow = make('div', 'chat-cart-total');
  totalRow.appendChild(make('span', '', t('chat.total')));
  totalRow.appendChild(make('span', '', `${total.toLocaleString('fr-FR')} FDJ`));
  cart.appendChild(totalRow);
  cart.appendChild(make('div', 'chat-cart-free', free
    ? t('chat.freeReached')
    : t('chat.freeRemaining', { x: (CONFIG.freeDeliveryThreshold - total).toLocaleString('fr-FR') })));
  const btn = make('button', 'chat-finalize', t('chat.finalize'));
  btn.type = 'button';
  btn.dataset.action = 'finalize';
  cart.appendChild(btn);
  pushMessage('bot', cart);
}

function addVariantToCart(p, v, qty) {
  for (let k = 0; k < qty; k++) addToCart({ id: productId(p, v), name: p.name, label: v.label, price: Number(v.price) });
  trackEvent('chat_add_to_cart', { product: p.name, qty });
}

function proposeProducts(list, qty) {
  // Construit des chips de choix (produit + 1re variante)
  const bubble = make('div', 'chat-bubble', t('chat.found'));
  const chips = make('div', 'chat-chips');
  list.slice(0, 8).forEach(p => {
    const v = p.variants[0];
    if (!v) return;
    const chip = make('button', 'chat-chip',
      `${p.icon || '🛒'} ${p.name} — ${Number(v.price).toLocaleString('fr-FR')} FDJ`);
    chip.type = 'button';
    chip.dataset.pick = String(products.indexOf(p));
    chip.dataset.qty = String(qty);
    chips.appendChild(chip);
  });
  bubble.appendChild(chips);
  pushMessage('bot', bubble);
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
      // Le serveur charge son propre catalogue (embarqué dans la fonction) :
      // ne pas l'envoyer ici — poids mort sur connexion lente.
      body: JSON.stringify({ message: text, history }),
    });
    removeTyping(typing);
    if (!res.ok) return false;
    const data = await res.json();
    if (data.mode === 'busy') { botSay(data.reply || t('chat.busy')); return true; }
    if (data.mode !== 'ai') { aiAvailable = false; return false; } // pas de clé/erreur → repli Phase 1
    if (data.reply) botSay(data.reply);
    history.push({ role: 'user', text }); history.push({ role: 'model', text: data.reply || '' });
    history = history.slice(-8);
    let added = 0;
    (data.items || []).forEach(it => {
      const clean = String(it.name || '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
      const p = products.find(x => norm(x.name) === norm(clean));
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
    if (added === 1) botSay(t('chat.addedOne', { qty, name: names[0].name }));
    else botSay(t('chat.addedMany', { n: added }));
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
    if (getCart().length) { botSay(t('chat.toCheckout')); finalize(); }
    else botSay(t('chat.emptyCart'));
    return;
  }

  // 4) Rien trouvé
  botSay(t('chat.notFound'));
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
  panel.inert = !opened;
  fab.setAttribute('aria-expanded', String(opened));
  if (opened) {
    if (!el('chat-messages').childElementCount) {
      botSay(t('chat.welcome1'));
      botSay(t('chat.welcome2'));
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
      if (p && v) { addVariantToCart(p, v, Number(pick.dataset.qty) || 1); userSay(p.name); botSay(t('chat.addedOne', { qty: pick.dataset.qty || 1, name: p.name })); showCart(); }
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
