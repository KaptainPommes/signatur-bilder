/* ==========================================================================
   ui.js – gemeinsame Bausteine fuer die App und das Druckblatt
   ========================================================================== */

const UI = (() => {

  /**
   * Minimaler DOM-Aufbau. Texte laufen ausschliesslich ueber textContent –
   * damit kann kein eingegebener Name Markup einschleusen.
   *
   * Uebersprungen werden null, undefined, false und der leere Text. Die Zahl 0
   * wird dagegen ausgegeben. Bedingte Kinder deshalb immer boolesch schreiben
   * (`liste.length > 0 && …`), sonst erscheint bei einer leeren Liste eine
   * blanke "0" auf der Seite.
   */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : value);
      }
    }
    for (const child of [].concat(children || [])) {
      if (child == null || child === false || child === '') continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  /* --- Formatierung ------------------------------------------------------- */

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /** Alter in vollen Jahren, aus dem Geburtsdatum berechnet. */
  function age(iso) {
    if (!iso) return null;
    const birth = new Date(iso + 'T00:00:00');
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    const months = now.getMonth() - birth.getMonth();
    if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) years--;
    return years >= 0 && years < 130 ? years : null;
  }

  function birthLine(iso) {
    if (!iso) return '';
    const years = age(iso);
    return formatDate(iso) + (years != null ? ` · ${years} Jahre` : '');
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  const today = () => new Date().toLocaleDateString('de-DE',
    { day: '2-digit', month: '2-digit', year: 'numeric' });

  /** Telefonnummer als waehlbarer Link. */
  const telHref = phone => 'tel:' + String(phone).replace(/[^\d+]/g, '');

  const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /** Kartenlink zur Praxis – auf iOS Apple Karten, sonst Google Maps. */
  function mapHref(doctor) {
    const query = [doctor.street, [doctor.zip, doctor.city].filter(Boolean).join(' ')]
      .filter(Boolean).join(', ');
    if (!query) return null;
    return isIOS()
      ? 'https://maps.apple.com/?q=' + encodeURIComponent(query)
      : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
  }

  const addressLines = d => [d.street, [d.zip, d.city].filter(Boolean).join(' ')].filter(Boolean);

  /** "Hausarzt · Dr. Meier" – die Art zuerst, danach wird auch sortiert gesucht. */
  const doctorTitle = d => [d.kind, d.name].filter(Boolean).join(' · ');

  /* --- Farbschema ---------------------------------------------------------- */

  const THEME_KEY = 'familienbuch.theme';

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* Privatmodus */ }
  }

  function storedTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch { return 'auto'; }
  }

  /** Reihenfolge beim Antippen: automatisch -> hell -> dunkel -> automatisch. */
  function cycleTheme() {
    const next = { auto: 'light', light: 'dark', dark: 'auto' }[storedTheme()] || 'light';
    applyTheme(next);
    return next;
  }

  const themeLabel = theme =>
    ({ auto: 'Farbschema: automatisch', light: 'Farbschema: hell', dark: 'Farbschema: dunkel' })[theme];

  /* --- Kurzmeldung --------------------------------------------------------- */

  let toastTimer;
  function toast(message) {
    let node = document.getElementById('toast');
    if (!node) {
      node = el('div', { class: 'toast', id: 'toast', role: 'status', 'aria-live': 'polite' });
      document.body.append(node);
    }
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 3600);
  }

  return {
    el, formatDate, age, birthLine, initials, today,
    telHref, mapHref, addressLines, doctorTitle, isIOS,
    applyTheme, storedTheme, cycleTheme, themeLabel, toast,
  };
})();

// Farbschema noch vor dem ersten Zeichnen setzen, damit es nicht aufblitzt.
UI.applyTheme(UI.storedTheme());
