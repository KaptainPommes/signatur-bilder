/* ==========================================================================
   app.js – Oberflaeche, Routing, PWA-Einbindung
   ========================================================================== */

(() => {
  'use strict';

  /* --- Kleine Helfer ---------------------------------------------------- */

  const $ = sel => document.querySelector(sel);

  /**
   * Minimaler DOM-Builder. Textinhalte laufen ausschliesslich ueber
   * textContent – dadurch kann kein eingegebener Name Markup einschleusen.
   */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;              // nur fuer statische Icons
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else node.setAttribute(key, value === true ? '' : value);
      }
    }
    for (const child of [].concat(children || [])) {
      if (child == null || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function age(iso) {
    if (!iso) return null;
    const b = new Date(iso + 'T00:00:00');
    if (Number.isNaN(b.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
    return a >= 0 && a < 130 ? a : null;
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  const telHref = phone => 'tel:' + String(phone).replace(/[^\d+]/g, '');

  function mapHref(doc) {
    const q = [doc.street, [doc.zip, doc.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if (!q) return null;
    return isIOS
      ? 'https://maps.apple.com/?q=' + encodeURIComponent(q)
      : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  /**
   * Banner ein-/ausblenden und dabei den Platz am Seitenende mitfuehren,
   * damit die fixierten Banner keine Schaltflaechen verdecken.
   */
  function showBanner(node, visible) {
    node.hidden = !visible;
    const anyVisible = Array.from(document.querySelectorAll('.banner')).some(b => !b.hidden);
    document.body.classList.toggle('has-banner', anyVisible);
  }

  let toastTimer;
  function toast(message) {
    const t = $('#toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  /* --- Ansichten -------------------------------------------------------- */

  const view = $('#view');
  const title = $('#appbar-title');
  const backBtn = $('#btn-back');

  function render(nodes, { heading = 'Familienakte', back = null } = {}) {
    title.textContent = heading;
    backBtn.hidden = !back;
    backBtn.onclick = back ? () => { location.hash = back; } : null;
    view.replaceChildren(...[].concat(nodes));
    view.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function card(headingText, body) {
    return el('section', { class: 'card' }, [
      headingText && el('h2', { class: 'card__head', text: headingText }),
      el('div', { class: 'card__body' }, body)
    ]);
  }

  /** Definitionsliste aus [Bezeichnung, Wert]-Paaren. */
  function rows(pairs) {
    return el('dl', { class: 'rows' }, pairs.map(([key, value]) =>
      el('div', null, [el('dt', { text: key }), el('dd', { text: value })])));
  }

  /* Uebersicht ------------------------------------------------------------ */

  function viewList() {
    const people = Store.people();

    if (!people.length) {
      render(card(null, [
        el('div', { class: 'empty' }, [
          el('strong', { text: 'Noch keine Person angelegt' }),
          el('p', { text: 'Lege für jedes Familienmitglied einen Eintrag an – oder sieh dir zuerst ein Beispiel an.' })
        ]),
        el('div', { class: 'actions' }, [
          el('a', { class: 'btn btn--block', href: '#/new', text: 'Erste Person anlegen' }),
          el('button', {
            class: 'btn btn--ghost btn--block', type: 'button', text: 'Beispiel laden',
            onclick: async () => { const p = await Store.seedDemo(); location.hash = '#/p/' + p.id; }
          })
        ])
      ]), { heading: 'Familienakte' });
      return;
    }

    const items = people.map(p => {
      const meta = [];
      if (p.birthdate) {
        const a = age(p.birthdate);
        meta.push(formatDate(p.birthdate) + (a != null ? ` · ${a} Jahre` : ''));
      }
      if (p.medications.length) meta.push(`${p.medications.length} Medikament${p.medications.length === 1 ? '' : 'e'}`);

      return el('li', { class: 'person-list__item' }, [
        el('button', {
          class: 'person-link', type: 'button',
          onclick: () => { location.hash = '#/p/' + p.id; }
        }, [
          el('span', { class: 'avatar', 'aria-hidden': 'true', text: initials(p.name) }),
          el('span', { class: 'person-link__text' }, [
            el('span', { class: 'person-link__name', text: p.name || 'Ohne Namen' }),
            meta.length ? el('span', { class: 'person-link__meta', text: meta.join(' · ') }) : null
          ]),
          el('span', { class: 'person-link__chevron', 'aria-hidden': 'true', text: '›' })
        ])
      ]);
    });

    render([
      el('section', { class: 'card' }, el('ul', { class: 'person-list' }, items)),
      el('div', { class: 'actions' }, el('a', { class: 'btn btn--ghost btn--block', href: '#/new', text: '＋ Person hinzufügen' }))
    ], { heading: 'Familienakte' });
  }

  /* Detailansicht --------------------------------------------------------- */

  function viewPerson(id) {
    const p = Store.person(id);
    if (!p) { location.hash = '#/'; return; }

    const cards = [];

    /* Stammdaten */
    const facts = [];
    if (p.birthdate) {
      const a = age(p.birthdate);
      facts.push(['Geburtsdatum', formatDate(p.birthdate) + (a != null ? ` (${a} Jahre)` : '')]);
    }
    if (p.sizes.shoe) facts.push(['Schuhgröße', p.sizes.shoe]);
    if (p.sizes.clothing) facts.push(['Kleidergröße', p.sizes.clothing]);
    if (p.sizes.trousers) facts.push(['Hosengröße', p.sizes.trousers]);
    if (facts.length) {
      cards.push(card('Stammdaten', rows(facts)));
    }

    /* Allergien – bewusst ganz oben und rot, das ist die Notfall-Information */
    if (p.allergies.length) {
      cards.unshift(card('Allergien', el('ul', { class: 'chips' },
        p.allergies.map(a => el('li', { class: 'chip chip--danger', text: a })))));
    }

    if (p.conditions.length) {
      cards.push(card('Krankheiten', el('ul', { class: 'chips' },
        p.conditions.map(c => el('li', { class: 'chip', text: c })))));
    }

    /* Medikation */
    if (p.medications.length) {
      cards.push(card('Medikation', p.medications.map(m => el('div', { class: 'med' }, [
        el('div', { class: 'med__name', text: m.name }),
        m.note ? el('div', { class: 'med__note', text: m.note }) : null,
        el('div', { class: 'med__times' }, [
          ['Morgens', m.morning], ['Mittags', m.noon], ['Abends', m.evening]
        ].map(([label, dose]) => el('div', { class: 'med__slot' + (dose ? '' : ' med__slot--off') }, [
          el('span', { class: 'med__slot-label', text: label }),
          el('span', { class: 'med__slot-dose', text: dose || '–' })
        ])))
      ]))));
    }

    /* Ärzte */
    if (p.doctors.length) {
      cards.push(card('Ärzte', p.doctors.map(d => {
        const addr = [d.street, [d.zip, d.city].filter(Boolean).join(' ')].filter(Boolean);
        const map = mapHref(d);
        return el('div', { class: 'doc' }, [
          el('div', { class: 'doc__name', text: d.name }),
          d.field ? el('div', { class: 'doc__field', text: d.field }) : null,
          addr.length ? el('address', { class: 'doc__addr' }, addr.map(line => el('div', { text: line }))) : null,
          (d.phone || map) ? el('div', { class: 'doc__actions' }, [
            d.phone ? el('a', { class: 'btn btn--call', href: telHref(d.phone), text: '📞 ' + d.phone }) : null,
            map ? el('a', { class: 'btn btn--ghost', href: map, target: '_blank', rel: 'noopener', text: 'Route' }) : null
          ]) : null
        ]);
      })));
    }

    if (p.notes) cards.push(card('Notizen', el('p', { text: p.notes })));

    if (!cards.length) {
      cards.push(card(null, el('div', { class: 'empty' }, [
        el('strong', { text: 'Noch keine Daten' }),
        el('p', { text: 'Tippe auf „Bearbeiten“, um Angaben zu ergänzen.' })
      ])));
    }

    cards.push(el('div', { class: 'actions' }, [
      el('a', { class: 'btn btn--block', href: `#/p/${p.id}/edit`, text: 'Bearbeiten' })
    ]));

    render(cards, { heading: p.name || 'Ohne Namen', back: '#/' });
  }

  /* Formular -------------------------------------------------------------- */

  function field(label, control, hint) {
    return el('div', { class: 'field' }, [
      el('label', { for: control.id, text: label }),
      control,
      hint ? el('p', { class: 'field__hint', text: hint }) : null
    ]);
  }

  function input(id, value, attrs) {
    return el('input', Object.assign({ id, name: id, type: 'text', value: value || '' }, attrs || {}));
  }

  function viewEdit(id, isNew) {
    const person = isNew ? Store.emptyPerson() : Store.person(id);
    if (!person) { location.hash = '#/'; return; }

    const draft = JSON.parse(JSON.stringify(person));
    const form = el('form', { id: 'person-form', autocomplete: 'off' });

    /* Stammdaten + Größen */
    const nameInput = input('f-name', draft.name, { required: true, autocomplete: 'name' });
    const birthInput = input('f-birth', draft.birthdate, { type: 'date' });
    const shoeInput = input('f-shoe', draft.sizes.shoe, { inputmode: 'numeric' });
    const clothInput = input('f-cloth', draft.sizes.clothing);
    const trouserInput = input('f-trouser', draft.sizes.trousers);

    form.append(card('Stammdaten', [
      field('Name', nameInput),
      field('Geburtsdatum', birthInput),
      el('div', { class: 'grid-3' }, [
        field('Schuhgröße', shoeInput),
        field('Kleidergröße', clothInput),
        field('Hosengröße', trouserInput)
      ])
    ]));

    /* Listenfelder: eine Angabe pro Zeile – fuer Nicht-Techniker am klarsten */
    const allergyInput = el('textarea', { id: 'f-allergies', rows: '3' }, draft.allergies.join('\n'));
    const conditionInput = el('textarea', { id: 'f-conditions', rows: '3' }, draft.conditions.join('\n'));

    form.append(card('Allergien & Krankheiten', [
      field('Allergien', allergyInput, 'Eine Allergie pro Zeile.'),
      field('Krankheiten', conditionInput, 'Eine Krankheit pro Zeile.')
    ]));

    /* Medikation – dynamische Liste */
    const medList = el('div');
    function medRow(med, index) {
      const row = el('div', { class: 'subform' });
      const name = input(`med-name-${index}`, med.name);
      const morning = input(`med-m-${index}`, med.morning);
      const noon = input(`med-n-${index}`, med.noon);
      const evening = input(`med-e-${index}`, med.evening);
      const note = input(`med-note-${index}`, med.note);
      [name, morning, noon, evening, note].forEach(i => i.addEventListener('input', () => {
        med.name = name.value; med.morning = morning.value;
        med.noon = noon.value; med.evening = evening.value; med.note = note.value;
      }));
      row.append(
        el('div', { class: 'subform__head' }, [
          el('h4', { text: 'Medikament' }),
          el('button', {
            class: 'subform__remove', type: 'button', text: 'Entfernen',
            onclick: () => { draft.medications.splice(draft.medications.indexOf(med), 1); redrawMeds(); }
          })
        ]),
        field('Bezeichnung', name),
        el('div', { class: 'grid-3' }, [
          field('Morgens', morning), field('Mittags', noon), field('Abends', evening)
        ]),
        field('Hinweis', note, 'z. B. „nüchtern“ oder „zum Essen“.')
      );
      return row;
    }
    function redrawMeds() {
      medList.replaceChildren(...draft.medications.map(medRow));
    }
    redrawMeds();

    form.append(card('Medikation', [
      medList,
      el('button', {
        class: 'btn btn--ghost btn--block', type: 'button', text: '＋ Medikament hinzufügen',
        onclick: () => { draft.medications.push({ name: '', morning: '', noon: '', evening: '', note: '' }); redrawMeds(); }
      })
    ]));

    /* Ärzte – dynamische Liste */
    const docList = el('div');
    function docRow(doc, index) {
      const row = el('div', { class: 'subform' });
      const name = input(`doc-name-${index}`, doc.name);
      const fieldName = input(`doc-field-${index}`, doc.field);
      const street = input(`doc-street-${index}`, doc.street, { autocomplete: 'off' });
      const zip = input(`doc-zip-${index}`, doc.zip, { inputmode: 'numeric' });
      const city = input(`doc-city-${index}`, doc.city);
      const phone = input(`doc-phone-${index}`, doc.phone, { type: 'tel', inputmode: 'tel' });
      [name, fieldName, street, zip, city, phone].forEach(i => i.addEventListener('input', () => {
        doc.name = name.value; doc.field = fieldName.value; doc.street = street.value;
        doc.zip = zip.value; doc.city = city.value; doc.phone = phone.value;
      }));
      row.append(
        el('div', { class: 'subform__head' }, [
          el('h4', { text: 'Arzt / Praxis' }),
          el('button', {
            class: 'subform__remove', type: 'button', text: 'Entfernen',
            onclick: () => { draft.doctors.splice(draft.doctors.indexOf(doc), 1); redrawDocs(); }
          })
        ]),
        field('Name', name),
        field('Fachrichtung', fieldName),
        field('Straße und Hausnummer', street),
        el('div', { class: 'grid-3' }, [field('PLZ', zip), field('Ort', city)]),
        field('Telefon', phone)
      );
      return row;
    }
    function redrawDocs() {
      docList.replaceChildren(...draft.doctors.map(docRow));
    }
    redrawDocs();

    form.append(card('Ärzte', [
      docList,
      el('button', {
        class: 'btn btn--ghost btn--block', type: 'button', text: '＋ Arzt hinzufügen',
        onclick: () => { draft.doctors.push({ name: '', field: '', street: '', zip: '', city: '', phone: '' }); redrawDocs(); }
      })
    ]));

    const notesInput = el('textarea', { id: 'f-notes', rows: '3' }, draft.notes);
    form.append(card('Notizen', field('Freitext', notesInput)));

    /* Speichern / Abbrechen / Löschen */
    const actions = el('div', { class: 'actions' }, [
      el('button', { class: 'btn btn--block', type: 'submit', text: 'Speichern' }),
      el('a', { class: 'btn btn--ghost btn--block', href: isNew ? '#/' : '#/p/' + person.id, text: 'Abbrechen' }),
      !isNew && el('button', {
        class: 'btn btn--danger btn--block', type: 'button', text: 'Person löschen',
        onclick: async () => {
          if (!confirm(`„${person.name || 'Diese Person'}“ wirklich löschen?`)) return;
          await Store.remove(person.id);
          location.hash = '#/';
          toast('Eintrag gelöscht');
        }
      })
    ]);
    form.append(actions);

    const splitLines = textarea => textarea.value.split('\n').map(s => s.trim()).filter(Boolean);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!nameInput.value.trim()) { nameInput.focus(); toast('Bitte einen Namen eintragen.'); return; }

      draft.name = nameInput.value;
      draft.birthdate = birthInput.value;
      draft.sizes = { shoe: shoeInput.value, clothing: clothInput.value, trousers: trouserInput.value };
      draft.allergies = splitLines(allergyInput);
      draft.conditions = splitLines(conditionInput);
      draft.notes = notesInput.value;

      const saved = await Store.upsert(draft);
      location.hash = '#/p/' + saved.id;
      toast('Gespeichert');
    });

    render(form, {
      heading: isNew ? 'Neue Person' : 'Bearbeiten',
      back: isNew ? '#/' : '#/p/' + person.id
    });
  }

  /* Info ------------------------------------------------------------------ */

  function viewAbout() {
    const info = [
      ['Speicherort', 'Nur dieses Gerät (Browser-Speicher)'],
      ['Datenstand', Store.people().length + ' Person(en)'],
      ['Installiert', isStandalone ? 'Ja, als App' : 'Nein, im Browser geöffnet'],
      ['Zugriffsschutz', Auth.endpoint ? 'Server-Token aktiv' : 'Noch keiner – Backend folgt']
    ];

    render([
      card('Über diese App', [
        el('p', { text: 'Familienakte bündelt die wichtigsten Gesundheits- und Stammdaten der Familie an einem Ort – auch ohne Internetverbindung.' }),
        rows(info)
      ]),
      card('Wichtiger Hinweis', [
        el('p', { text: 'In diesem Ausbaustand liegen alle Daten ausschließlich lokal auf dem jeweiligen Gerät. Sie werden nicht zwischen Geräten abgeglichen und nicht übertragen. Lege regelmäßig eine Sicherung über das Menü an.' })
      ]),
      el('div', { class: 'actions' }, el('a', { class: 'btn btn--ghost btn--block', href: '#/', text: 'Zurück' }))
    ], { heading: 'Info', back: '#/' });
  }

  /* --- Routing ----------------------------------------------------------- */

  function route() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const editMatch = hash.match(/^\/p\/([^/]+)\/edit$/);
    const personMatch = hash.match(/^\/p\/([^/]+)$/);

    if (hash === '/new') viewEdit(null, true);
    else if (editMatch) viewEdit(decodeURIComponent(editMatch[1]), false);
    else if (personMatch) viewPerson(decodeURIComponent(personMatch[1]));
    else if (hash === '/about') viewAbout();
    else viewList();
  }

  /* --- Menü -------------------------------------------------------------- */

  function setupMenu() {
    const sheet = $('#menu-sheet');
    const openBtn = $('#btn-menu');

    const open = () => { sheet.hidden = false; openBtn.setAttribute('aria-expanded', 'true'); };
    const close = () => { sheet.hidden = true; openBtn.setAttribute('aria-expanded', 'false'); };

    openBtn.addEventListener('click', open);
    sheet.querySelectorAll('[data-close-menu]').forEach(node => node.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) close(); });

    $('#menu-add').addEventListener('click', () => { close(); location.hash = '#/new'; });
    $('#menu-about').addEventListener('click', () => { close(); location.hash = '#/about'; });

    $('#menu-export').addEventListener('click', () => {
      close();
      const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      const link = el('a', { href: url, download: `familienakte-${stamp}.json` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('Sicherung erstellt');
    });

    const fileInput = $('#import-file');
    $('#menu-import').addEventListener('click', () => { close(); fileInput.click(); });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      if (!confirm('Die aktuelle Sicherung ersetzt alle Daten auf diesem Gerät. Fortfahren?')) return;
      try {
        const count = await Store.importJSON(await file.text(), 'replace');
        route();
        toast(`${count} Person(en) eingelesen`);
      } catch (err) {
        console.error('[import]', err);
        toast('Datei konnte nicht gelesen werden.');
      }
    });
  }

  /* --- Installationshinweis ---------------------------------------------- */

  function setupInstallHint() {
    const hint = $('#install-hint');
    const text = $('#install-hint-text');
    const action = $('#install-action');
    const DISMISS_KEY = 'familienakte.installHintDismissed';

    if (isStandalone) return;
    try { if (localStorage.getItem(DISMISS_KEY)) return; } catch { /* egal */ }

    const dismiss = () => {
      showBanner(hint, false);
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* egal */ }
    };
    $('#install-dismiss').addEventListener('click', dismiss);

    // Android/Chrome: eigener Installationsdialog.
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      text.textContent = 'Familienakte auf dem Startbildschirm ablegen?';
      action.hidden = false;
      action.onclick = async () => {
        showBanner(hint, false);
        event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome !== 'accepted') showBanner(hint, true); else dismiss();
      };
      showBanner(hint, true);
    });

    // iOS/Safari kennt keinen Dialog – dort hilft nur die Anleitung.
    if (isIOS) {
      text.textContent = 'Zum Installieren: unten auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen.';
      showBanner(hint, true);
    }
  }

  /* --- Offline-Anzeige ---------------------------------------------------- */

  function setupOfflineBar() {
    const bar = el('div', { class: 'offline-bar', id: 'offline-bar', role: 'status', text: 'Keine Internetverbindung – gespeicherte Daten bleiben verfügbar.' });
    bar.hidden = navigator.onLine;
    $('#appbar').after(bar);
    window.addEventListener('online', () => { bar.hidden = true; });
    window.addEventListener('offline', () => { bar.hidden = false; });
  }

  /* --- Service Worker ----------------------------------------------------- */

  function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });

        // Wartet bereits eine neue Version? Dann Hinweis zeigen.
        if (reg.waiting) showUpdate(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const incoming = reg.installing;
          if (!incoming) return;
          incoming.addEventListener('statechange', () => {
            // Nur melden, wenn schon eine alte Version aktiv war – sonst ist es die Erstinstallation.
            if (incoming.state === 'installed' && navigator.serviceWorker.controller) showUpdate(incoming);
          });
        });
      } catch (err) {
        console.warn('[sw] Registrierung fehlgeschlagen:', err);
      }
    });

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });

    function showUpdate(worker) {
      const banner = $('#update-banner');
      showBanner(banner, true);
      $('#update-action').onclick = () => {
        showBanner(banner, false);
        worker.postMessage({ type: 'SKIP_WAITING' });
      };
    }
  }

  /* --- Start -------------------------------------------------------------- */

  async function boot() {
    const session = await Auth.start();
    if (session.state === 'missing' || session.state === 'rejected') {
      render(card('Zugang erforderlich', [
        el('p', { text: session.state === 'rejected'
          ? 'Der Zugang dieses Geräts ist nicht mehr gültig. Bitte einen neuen Einladungslink anfordern.'
          : 'Diese App lässt sich nur über einen persönlichen Einladungslink öffnen.' })
      ]), { heading: 'Familienakte' });
      return;
    }

    await Store.init();

    // Browser bitten, den Speicher nicht bei Platzmangel zu verwerfen.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(ok => { if (!ok) navigator.storage.persist(); }).catch(() => {});
    }

    setupMenu();
    setupOfflineBar();
    setupInstallHint();
    window.addEventListener('hashchange', route);
    route();
  }

  setupServiceWorker();
  boot().catch(err => {
    console.error('[boot]', err);
    render(card('Fehler', el('p', { text: 'Die App konnte nicht gestartet werden. Bitte Seite neu laden.' })));
  });
})();
