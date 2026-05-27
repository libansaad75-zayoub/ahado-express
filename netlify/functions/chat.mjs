// Netlify Function — assistant IA AHADO EXPRESS (Gemini) avec repli mock + anti-abus.
// Sécurité : la clé reste côté serveur (process.env.GEMINI_API_KEY). Si absente → mode "mock"
// et le front bascule sur le chat guidé Phase 1. Le modèle ne fixe jamais de prix : le front
// mappe les noms renvoyés sur le vrai catalogue pour les prix réels.

const MODEL = 'gemini-2.5-flash';
const WINDOW_MS = 60_000;
const MAX_REQ = 12;            // messages / minute / IP (best-effort, mémoire de l'instance)
const MAX_MSG = 500;           // longueur max d'un message client

const _hits = new Map();       // ip -> [timestamps]
function rateLimited(ip) {
  const now = Date.now();
  const arr = (_hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  _hits.set(ip, arr);
  return arr.length > MAX_REQ;
}

const json = (status, obj) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(obj),
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad json' }); }

  const message = String(body.message || '').slice(0, MAX_MSG).trim();
  if (!message) return json(400, { error: 'empty' });
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const catalog = Array.isArray(body.catalog) ? body.catalog.slice(0, 300) : [];

  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'anon';
  if (rateLimited(ip)) return json(429, { mode: 'busy', reply: "Un instant — trop de messages d'un coup. Réessayez dans une minute 🙏" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(200, { mode: 'mock' }); // pas de clé → repli côté front (chat guidé)

  const list = catalog.map(p => `- ${p.name} [${p.cat}]`).join('\n');
  const sys = `Tu es l'assistant de commande d'AHADO EXPRESS, une épicerie qui livre à Djibouti-Ville.
Réponds TOUJOURS dans la langue du client (français, arabe, somali ou anglais), de façon chaleureuse et brève (1-2 phrases).
Tu aides UNIQUEMENT à composer une commande d'épicerie chez AHADO. Refuse poliment tout autre sujet (politique, code, etc.).
Tu ne peux proposer QUE des produits de la liste ci-dessous, avec leur nom EXACT. N'invente JAMAIS un produit ni un prix.
Si un produit demandé n'est pas dans la liste, dis-le et propose une alternative de la liste.
Liste des produits disponibles :
${list}

Réponds STRICTEMENT en JSON valide, sans texte autour :
{"reply": "<ta réponse au client>", "items": [{"name":"<nom EXACT de la liste>","qty":<entier>}], "action": "add" | "checkout" | "none"}
- "items" = produits à ajouter au panier (tableau vide si aucun).
- "action" = "checkout" si le client veut finaliser/payer/commander ; "add" si tu ajoutes des produits ; sinon "none".`;

  const contents = [
    ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: String(h.text || '').slice(0, MAX_MSG) }] })),
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
        ? parsed.items.slice(0, 20).map(i => ({ name: String(i.name || ''), qty: Math.max(1, Math.min(50, parseInt(i.qty, 10) || 1)) }))
        : [],
      action: ['add', 'checkout', 'none'].includes(parsed.action) ? parsed.action : 'none',
    });
  } catch (e) {
    return json(200, { mode: 'mock' });
  }
};
