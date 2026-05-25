# AHADO EXPRESS — Site multi-fichiers

Site vitrine + catalogue + panier WhatsApp pour AHADO EXPRESS, service de livraison de courses à Djibouti-Ville.

## Arborescence

```txt
/
├── index.html
├── css/
│   ├── reset.css
│   ├── variables.css
│   ├── layout.css
│   ├── components.css
│   └── responsive.css
├── js/
│   ├── config.js
│   ├── i18n.js
│   ├── data-loader.js
│   ├── catalog.js
│   ├── cart.js
│   ├── checkout.js
│   ├── analytics.js
│   └── main.js
├── images/
├── data/fallback.json
├── sitemap.xml
├── robots.txt
├── netlify.toml
└── _redirects
```

## Déploiement Netlify + GitHub

1. Crée un dépôt GitHub `ahado-express`.
2. Envoie tous les fichiers du dossier à la racine du dépôt.
3. Dans Netlify : **Add new site → Import from GitHub**.
4. Build command : vide.
5. Publish directory : `.`
6. Ajoute le domaine `ahadoexpress.net` dans Netlify.
7. Configure les DNS selon les instructions Netlify.

## Google Sheets

Structure obligatoire des colonnes :

```txt
cat | name | popular | icon | label1 | price1 | label2 | price2 | label3 | price3 | image
```

Dans `js/config.js`, remplace :

```js
sheetId: 'REMPLACER_PAR_GOOGLE_SHEET_ID'
```

par l’ID réel de ton Google Sheet publié en lecture publique.

## Images

Place les images locales dans `/images/` au format JPEG 600px, qualité 70%, idéalement autour de 20 KB.
Les noms utilisés dans `fallback.json` doivent correspondre aux fichiers réels.

## Analytics Plausible

Événements prévus :

- `add_to_cart`
- `checkout_submit`
- `WhatsApp_FAB_Click`

Pour activer Plausible, ajoute le script officiel Plausible dans `index.html` et ajuste la CSP dans `netlify.toml` si nécessaire.

## Paiements inclus

Cash, Waafi, CAC Pay, D-Money, Saba Pay.

## Mentions légales

Propriétaire : Liban Ali.
