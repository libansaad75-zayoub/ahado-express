// Netlify Function: assistant IA AHADO EXPRESS (Gemini) avec repli mock + anti-abus.
// La cle Gemini reste cote serveur. Le catalogue est EMBARQUE dans le bundle au deploy
// (import JSON statique). Ne pas revenir a une lecture fs + import.meta.url : le bundler
// Netlify (esbuild) convertit ce fichier en CommonJS ou import.meta.url est undefined,
// ce qui plantait le module au chargement -> 502 sur tous les appels (panne du 2026-06-11).
import catalogData from '../../data/fallback.json';
import { getStore, connectLambda } from '@netlify/blobs';

const MODEL = 'gemini-2.5-flash';
const WINDOW_MS = 60_000;
const MAX_REQ = 12;
const MAX_BODY = 50_000;
const MAX_MSG = 500;
const MAX_HISTORY = 8;
const MAX_CATALOG_TEXT = 80;

// Rate-limit DURABLE via Netlify Blobs (survit aux cold-starts). La Map memoire ne
// sert plus que de REPLI si Blobs est indisponible ; derniere barriere = quotas du
// palier gratuit Google AI Studio.
const _hits = new Map();
let _catalog = null;

const clean = (value, max = MAX_MSG) => String(value || '').replace(/\s+/g, ' ').slice(0, max).trim();
const lowerHeaders = headers => Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]));
const clientIp = headers => {
  const h = lowerHeaders(headers);
  return clean(h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || 'anon', 120).split(',')[0].trim() || 'anon';
};

function loadCatalog() {
  if (_catalog) return _catalog;
  _catalog = Array.isArray(catalogData?.products)
    ? catalogData.products.slice(0, 220).map(p => ({
      name: clean(p?.name, MAX_CATALOG_TEXT),
      cat: clean(p?.cat, MAX_CATALOG_TEXT)
    })).filter(p => p.name)
    : [];
  return _catalog;
}

function rateLimitedMemory(ip) {
  const now = Date.now();
  const arr = (_hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  _hits.set(ip, arr);
  if (_hits.size > 1000) {
    for (const [key, hits] of _hits) {
      if (!hits.some(t => now - t < WINDOW_MS)) _hits.delete(key);
    }
  }
  return arr.length > MAX_REQ;
}

async function rateLimited(ip) {
  try {
    // consistency 'strong' obligatoire : en 'eventual' (defaut), chaque lecture revient
    // vide juste apres l'ecriture -> le compteur ne s'accumule jamais (verifie en prod).
    const store = getStore({ name: 'rate-limit', consistency: 'strong' });
    const key = ip.replace(/[^a-zA-Z0-9._:-]/g, '_') || 'anon';
    const now = Date.now();
    const prev = await store.get(key, { type: 'json' });
    const arr = (Array.isArray(prev) ? prev : []).filter(t => now - t < WINDOW_MS);
    arr.push(now);
    await store.setJSON(key, arr);
    return arr.length > MAX_REQ;
  } catch {
    // Blobs indisponible (local, ou non active) -> repli memoire d'instance
    return rateLimitedMemory(ip);
  }
}

const json = (status, obj, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(obj),
});

export const handler = async (event) => {
  // Donne le contexte Blobs aux fonctions "legacy" (signature event/handler) ;
  // sans effet si le runtime l'injecte deja, repli memoire si ca echoue.
  try { connectLambda(event); } catch { /* Blobs restera en repli memoire */ }
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });
  if (String(event.body || '').length > MAX_BODY) return json(413, { error: 'body too large' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad json' }); }

  const message = clean(body.message, MAX_MSG);
  if (!message) return json(400, { error: 'empty' });
  const history = Array.isArray(body.history)
    ? body.history.slice(-MAX_HISTORY).map(h => ({ role: h?.role === 'user' ? 'user' : 'model', text: clean(h?.text, MAX_MSG) })).filter(h => h.text)
    : [];

  const ip = clientIp(event.headers || {});
  if (await rateLimited(ip)) {
    return json(429, { mode: 'busy', reply: "Un instant, trop de messages d'un coup. Reessayez dans une minute." }, { 'retry-after': '60' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn('[chat] GEMINI_API_KEY absente — mode mock actif (verifier les Environment variables Netlify)');
    return json(200, { mode: 'mock' });
  }

  const catalog = loadCatalog();
  if (!catalog.length) return json(200, { mode: 'mock' });

  const list = catalog.map(p => JSON.stringify(p)).join('\n');
  const sys = `Tu es l'assistant de commande d'AHADO EXPRESS, une epicerie qui livre a Djibouti-Ville.
Reponds TOUJOURS dans la langue du client (francais, arabe, somali ou anglais), de facon chaleureuse et breve (1-2 phrases).
Tu aides UNIQUEMENT a composer une commande d'epicerie chez AHADO. Refuse poliment tout autre sujet.
Tu ne peux proposer QUE des produits de la liste ci-dessous, avec leur nom EXACT. N'invente JAMAIS un produit ni un prix.
Si un produit demande n'est pas dans la liste, dis-le et propose une alternative de la liste.
Liste des produits disponibles, un JSON par ligne :
${list}

Reponds STRICTEMENT en JSON valide, sans texte autour :
{"reply": "<ta reponse au client>", "items": [{"name":"<nom EXACT du produit>","qty":<entier>}], "action": "add" | "checkout" | "none"}
- "items" = produits a ajouter au panier (tableau vide si aucun).
- "action" = "checkout" si le client veut finaliser/payer/commander ; "add" si tu ajoutes des produits ; sinon "none".`;

  const contents = [
    ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 512, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!r.ok) return json(200, { mode: 'mock' });
    const data = await r.json();
    const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(txt); } catch { return json(200, { mode: 'mock' }); }
    return json(200, {
      mode: 'ai',
      reply: String(parsed.reply || ''),
      items: Array.isArray(parsed.items)
        ? parsed.items.slice(0, 20).map(i => ({ name: String(i.name || '').replace(/\s*\[[^\]]*\]\s*$/, '').trim(), qty: Math.max(1, Math.min(50, parseInt(i.qty, 10) || 1)) }))
        : [],
      action: ['add', 'checkout', 'none'].includes(parsed.action) ? parsed.action : 'none',
    });
  } catch {
    return json(200, { mode: 'mock' });
  }
};
