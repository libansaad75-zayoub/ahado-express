// Utilitaires partagés AHADO EXPRESS

// Échappement HTML pour toute donnée injectée via innerHTML (anti-XSS).
export const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

// Gestion d'un seul "dialog" ouvert à la fois (panier, checkout, chat) :
// piège le focus (Tab/Shift+Tab), ferme sur Échap, et rend le focus à l'élément d'origine.
let _trap = null;

const focusablesIn = container => [...container.querySelectorAll(
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
)].filter(el => el.offsetParent !== null);

export function openDialog(container, closeFn, focusEl) {
  if (_trap) {
    const active = _trap;
    document.removeEventListener('keydown', active.onKey);
    _trap = null;
    active.closeFn?.();
  }
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); closeFn(); return; }
    if (e.key !== 'Tab') return;
    const f = focusablesIn(container);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);
  _trap = { onKey, closeFn, prev: document.activeElement instanceof HTMLElement ? document.activeElement : null };
  setTimeout(() => { (focusEl || focusablesIn(container)[0])?.focus(); }, 30);
}

export function closeDialog() {
  if (!_trap) return;
  document.removeEventListener('keydown', _trap.onKey);
  const prev = _trap.prev;
  _trap = null;
  prev?.focus?.();
}
