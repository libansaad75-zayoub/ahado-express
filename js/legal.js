// Pages légales : si la langue mémorisée du site est l'arabe, affiche une note
// (en arabe, RTL) expliquant que ces pages existent en français uniquement et
// que la version française fait foi. Fichier externe = compatible CSP stricte.
(() => {
  let lang = 'fr';
  try {
    lang = new URLSearchParams(location.search).get('lang') || localStorage.getItem('ahado_lang') || 'fr';
  } catch { /* localStorage indisponible → fr */ }
  if (lang !== 'ar') return;
  const main = document.querySelector('main.legal');
  if (!main) return;
  const note = document.createElement('p');
  note.className = 'legal-lang-note';
  note.dir = 'rtl';
  note.lang = 'ar';
  note.textContent = 'هذه الصفحة القانونية متوفرة باللغة الفرنسية فقط، والنسخة الفرنسية هي المرجع. لأي سؤال تواصلوا معنا عبر واتساب: ‎+253 77 78 83 02';
  main.insertBefore(note, main.firstChild);
})();
