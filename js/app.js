/* ==========================================================================
   app.js – Oberflaeche des Familienbuchs
   ========================================================================== */

(() => {
  'use strict';

  const { el, formatDate, birthLine, initials, telHref, mapHref,
          addressLines, toast } = UI;

  /* --- Auswahllisten aus der Spezifikation -------------------------------- */

  const SHOE_SIZES = Array.from({ length: 16 }, (_, i) => String(35 + i));   // 35–50
  const CLOTHING_SIZES = ['134/140', '146/152', '158/164', '170/176', 'S', 'M', 'L', 'XL', 'XXL'];
  const DOCTOR_KINDS = [
    'Hausarzt', 'Kinderarzt', 'Zahnarzt', 'Kieferorthopäde', 'Frauenarzt',
    'Augenarzt', 'HNO-Arzt', 'Hautarzt', 'Orthopäde', 'Psychotherapeut',
    'Physiotherapeut', 'Logopäde', 'Ergotherapeut', 'Apotheke',
  ];

  /* --- Zustand ------------------------------------------------------------- */

  let session = null;     // Antwort von /api/session
  let data = null;        // kompletter Datenbestand
  let dirty = false;      // ungespeicherte Aenderungen im Formular
  let lastHash = '#/';    // fuer den Fall, dass ein Verlassen abgebrochen wird

  const view = document.getElementById('view');
  const titleEl = document.getElementById('appbar-title');
  const backBtn = document.getElementById('btn-back');
  const menuBtn = document.getElementById('btn-menu');
  const themeBtn = document.getElementById('btn-theme');
  const offlineBar = document.getElementById('offline-bar');

  const person = id => (data ? data.persons.find(p => p.id === id) : null);
  const byId = (list, id) => list.find(x => x.id === id);

  /* --- Geruest -------------------------------------------------------------- */

  function render(nodes, { heading = 'Familienbuch', back = null, menu = null, narrow = false } = {}) {
    titleEl.textContent = heading;
    document.title = heading === 'Familienbuch' ? heading : heading + ' – Familienbuch';

    backBtn.hidden = !back;
    backBtn.onclick = back ? () => go(back) : null;

    menuBtn.hidden = !menu;
    menuBtn.onclick = menu || null;

    view.classList.toggle('view--narrow', narrow);
    view.replaceChildren(...[].concat(nodes));
    window.scrollTo(0, 0);
  }

  const card = (head, body) => el('section', { class: 'card' }, [
    head && el('h2', { class: 'card__head', text: head }),
    el('div', { class: 'card__body' }, body),
  ]);

  const go = hash => { location.hash = hash; };

  /* --- Ueberlagerung --------------------------------------------------------- */

  let modalNode = null;

  function closeModal() {
    if (modalNode) { modalNode.remove(); modalNode = null; }
  }

  function openModal(title, content) {
    closeModal();
    const panel = el('div', { class: 'modal__panel', role: 'dialog', 'aria-modal': 'true' }, [
      title && el('h2', { class: 'modal__title', text: title }),
      content,
    ]);
    modalNode = el('div', { class: 'modal' }, [
      el('div', { class: 'modal__backdrop', onclick: closeModal }),
      panel,
    ]);
    document.body.append(modalNode);
    const focusable = panel.querySelector('input, select, textarea, button');
    if (focusable) focusable.focus();
    return modalNode;
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  /** Menue als Liste von Eintraegen; `null` erzeugt eine Trennung. */
  function openMenu(items) {
    openModal(null, el('div', null, [
      ...items.filter(Boolean).map(item => el('button', {
        class: 'sheet__item' + (item.danger ? ' sheet__item--danger' : ''),
        type: 'button',
        onclick: () => { closeModal(); item.action(); },
      }, [el('span', { 'aria-hidden': 'true', text: item.icon }), item.label])),
      el('button', { class: 'sheet__item sheet__item--cancel', type: 'button',
                     text: 'Abbrechen', onclick: closeModal }),
    ]));
  }

  /* --- Fehlerbehandlung ------------------------------------------------------- */

  /** Fuehrt eine Serveraktion aus und macht Fehler sichtbar, statt sie zu schlucken. */
  async function guard(work, { busy } = {}) {
    if (busy) busy.disabled = true;
    try {
      return await work();
    } catch (err) {
      if (err instanceof AuthError) {
        session = null;
        data = null;
        viewLocked('Die Anmeldung dieses Geräts gilt nicht mehr. Bitte einen neuen Einladungslink anfordern.');
        return undefined;
      }
      toast(err instanceof OfflineError ? 'Keine Verbindung zum Server.' : err.message);
      return undefined;
    } finally {
      if (busy) busy.disabled = false;
    }
  }

  /* --- Übersicht --------------------------------------------------------------- */

  function viewOverview() {
    const people = data.persons;

    const body = people.length
      ? el('ul', { class: 'people' }, people.map(p => el('li', null,
          el('button', {
            class: 'people__tile', type: 'button',
            onclick: () => go(`#/p/${p.id}`),
            'aria-label': `${p.name} öffnen`,
          }, [
            el('span', { class: 'badge', 'aria-hidden': 'true',
                         style: `background:${p.color}`, text: initials(p.name) }),
            el('span', { class: 'people__name', text: p.name }),
            p.birthdate && el('span', { class: 'people__birth', text: birthLine(p.birthdate) }),
            el('span', { class: 'people__counts' }, [
              count(p.allergyIds.length, 'Allergie', 'Allergien'),
              count(p.illnessIds.length, 'Krankheit', 'Krankheiten'),
              count(p.medications.length, 'Medikament', 'Medikamente'),
            ]),
            sizeLine(p) && el('span', { class: 'people__sizes', text: sizeLine(p) }),
          ])
        )))
      : card(null, el('div', { class: 'empty' }, [
          el('strong', { text: 'Noch niemand angelegt' }),
          el('p', { text: 'Lege für jedes Familienmitglied einen Eintrag an.' }),
        ]));

    render([
      body,
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn btn--block', type: 'button', text: '＋ Person hinzufügen',
                       onclick: () => go('#/neu') }),
        people.length ? el('button', {
          class: 'btn btn--ghost btn--block', type: 'button', text: 'Daten drucken',
          onclick: () => go('#/drucken'),
        }) : null,
      ]),
    ], { heading: 'Familienbuch', menu: overviewMenu });
  }

  const count = (n, one, many) =>
    el('span', { class: 'people__count' }, [el('b', { text: String(n) }), ' ', n === 1 ? one : many]);

  function sizeLine(p) {
    const parts = [];
    if (p.sizes.shoe) parts.push('Schuh ' + p.sizes.shoe);
    if (p.sizes.clothing) parts.push('Kleid. ' + p.sizes.clothing);
    if (p.sizes.trousers) parts.push('Hose ' + p.sizes.trousers);
    return parts.join(' · ');
  }

  function overviewMenu() {
    openMenu([
      { icon: '＋', label: 'Person hinzufügen', action: () => go('#/neu') },
      data.persons.length > 0 && { icon: '🖶', label: 'Daten drucken', action: () => go('#/drucken') },
      session.device.isAdmin && { icon: '🔑', label: 'Zugänge verwalten', action: () => go('#/zugaenge') },
      { icon: '◐', label: UI.themeLabel(UI.storedTheme()), action: () => { UI.cycleTheme(); toast(UI.themeLabel(UI.storedTheme())); } },
      { icon: '⏻', label: 'Auf diesem Gerät abmelden', danger: true, action: confirmLogout },
    ]);
  }

  async function confirmLogout() {
    if (!confirm('Dieses Gerät abmelden? Zum Wiederherstellen brauchst du einen neuen Einladungslink.')) return;
    await guard(async () => {
      await Api.logout();
      session = null; data = null;
      viewLocked('Du bist abgemeldet.');
    });
  }

  /* --- Leseansicht ---------------------------------------------------------------- */

  function viewPerson(id) {
    const p = person(id);
    if (!p) { go('#/'); return; }

    const cards = [];

    // Allergien stehen bewusst ganz oben und rot – das ist die Notfall-Information.
    if (p.allergyIds.length) {
      cards.push(card('Allergien', el('ul', { class: 'chips' },
        p.allergyIds.map(aid => byId(data.allergies, aid))
          .filter(Boolean)
          .map(a => el('li', { class: 'chip chip--danger', text: a.label })))));
    }

    const facts = [];
    if (p.birthdate) facts.push(['Geburtsdatum', birthLine(p.birthdate)]);
    if (p.sizes.shoe) facts.push(['Schuhgröße', p.sizes.shoe]);
    if (p.sizes.clothing) facts.push(['Kleidergröße', p.sizes.clothing]);
    if (p.sizes.trousers) facts.push(['Hosengröße', p.sizes.trousers]);
    if (facts.length) {
      cards.push(card('Stammdaten', el('dl', { class: 'rows' }, facts.map(([k, v]) =>
        el('div', null, [el('dt', { text: k }), el('dd', { text: v })])))));
    }

    if (p.illnessIds.length) {
      cards.push(card('Krankheiten', el('ul', { class: 'chips' },
        p.illnessIds.map(iid => byId(data.illnesses, iid))
          .filter(Boolean)
          .map(i => el('li', { class: 'chip', text: i.label })))));
    }

    if (p.medications.length) {
      cards.push(card('Medikation', p.medications.map(m => el('div', { class: 'med' }, [
        el('div', { class: 'med__name', text: m.name }),
        m.strength && el('div', { class: 'med__strength', text: m.strength }),
        el('div', { class: 'med__times' }, [
          ['Morgens', m.morning], ['Mittags', m.noon], ['Abends', m.evening],
        ].map(([label, dose]) => el('div', { class: 'med__slot' + (dose ? '' : ' med__slot--off') }, [
          el('span', { class: 'med__slot-label', text: label }),
          el('span', { class: 'med__slot-dose', text: dose || '–' }),
        ]))),
      ]))));
    }

    if (p.doctorIds.length) {
      const docs = p.doctorIds.map(did => byId(data.doctors, did)).filter(Boolean);
      cards.push(card('Ärzte', docs.map(d => {
        const map = mapHref(d);
        return el('div', { class: 'doc' }, [
          d.kind && el('div', { class: 'doc__kind', text: d.kind }),
          el('div', { class: 'doc__name', text: d.name }),
          addressLines(d).length
            ? el('address', { class: 'doc__addr' }, addressLines(d).map(line => el('div', { text: line })))
            : null,
          d.email && el('div', { class: 'doc__addr', text: d.email }),
          (d.phone || map) ? el('div', { class: 'doc__actions' }, [
            d.phone && el('a', { class: 'btn', href: telHref(d.phone), text: '📞 ' + d.phone }),
            map && el('a', { class: 'btn btn--ghost', href: map, target: '_blank', rel: 'noopener', text: 'Route' }),
          ]) : null,
        ]);
      })));
    }

    if (!cards.length) {
      cards.push(card(null, el('div', { class: 'empty' }, [
        el('strong', { text: 'Noch keine Angaben' }),
        el('p', { text: 'Über das Menü oben rechts lassen sich Daten ergänzen.' }),
      ])));
    }

    render(cards, {
      heading: p.name,
      back: '#/',
      narrow: true,
      menu: () => openMenu([
        { icon: '✎', label: 'Bearbeiten', action: () => go(`#/p/${p.id}/bearbeiten`) },
        { icon: '🖶', label: 'Daten drucken', action: () => openPrint([p.id]) },
      ]),
    });
  }

  function openPrint(ids) {
    const url = 'druck.html?ids=' + ids.join(',');
    const opened = window.open(url, '_blank');
    if (!opened) location.href = url;   // falls der Browser neue Tabs blockiert
  }

  /* --- Formular --------------------------------------------------------------------- */

  function field(label, control, hint) {
    return el('div', { class: 'field' }, [
      el('label', { for: control.id, text: label }),
      control,
      hint && el('p', { class: 'field__hint', text: hint }),
    ]);
  }

  function selectField(id, value, options, placeholder) {
    const node = el('select', { id, name: id });
    node.append(el('option', { value: '', text: placeholder }));
    for (const option of options) {
      node.append(el('option', { value: option, text: option, selected: option === value }));
    }
    if (value && !options.includes(value)) {
      node.append(el('option', { value, text: value, selected: true }));
    }
    node.value = value || '';
    return node;
  }

  const textInput = (id, value, attrs) =>
    el('input', Object.assign({ id, name: id, type: 'text', value: value || '' }, attrs || {}));

  function viewForm(id, isNew) {
    const original = isNew ? null : person(id);
    if (!isNew && !original) { go('#/'); return; }

    const draft = original ? JSON.parse(JSON.stringify(original)) : {
      name: '', birthdate: '', color: '',
      sizes: { shoe: '', clothing: '', trousers: '' },
      doctorIds: [], allergyIds: [], illnessIds: [], medications: [],
    };
    dirty = false;
    const touch = () => { dirty = true; };

    const form = el('form', { id: 'person-form', autocomplete: 'off', novalidate: true });

    /* Stammdaten */
    const nameInput = textInput('f-name', draft.name, { autocomplete: 'name', required: true });
    const birthInput = el('input', { id: 'f-birth', type: 'date', value: draft.birthdate || '' });
    const shoeSelect = selectField('f-shoe', draft.sizes.shoe, SHOE_SIZES, 'keine Angabe');
    const clothSelect = selectField('f-cloth', draft.sizes.clothing, CLOTHING_SIZES, 'keine Angabe');
    const trouserInput = textInput('f-trouser', draft.sizes.trousers);
    [nameInput, birthInput, shoeSelect, clothSelect, trouserInput]
      .forEach(node => node.addEventListener('input', touch));

    form.append(card('Person', [
      field('Name', nameInput, 'Pflichtfeld.'),
      field('Geburtsdatum', birthInput, 'Das Alter wird daraus berechnet.'),
      el('div', { class: 'grid-3' }, [
        field('Schuhgröße', shoeSelect),
        field('Kleidergröße', clothSelect),
        field('Hosengröße', trouserInput),
      ]),
      el('p', { class: 'field__hint', text: 'Hosengröße frei, z. B. „32/34“ oder „128 slim“.' }),
    ]));

    /* Allergien und Krankheiten – Wiederverwendung ueber Kacheln */
    form.append(card('Allergien', labelPicker({
      entries: () => data.allergies,
      selected: draft.allergyIds,
      create: Api.createAllergy,
      placeholder: 'Neue Allergie, z. B. Penicillin',
      onChange: touch,
    })));

    form.append(card('Krankheiten', labelPicker({
      entries: () => data.illnesses,
      selected: draft.illnessIds,
      create: Api.createIllness,
      placeholder: 'Neue Krankheit, z. B. Asthma',
      onChange: touch,
    })));

    /* Ärzte */
    form.append(card('Ärzte', doctorPicker(draft.doctorIds, touch)));

    /* Medikation */
    const medList = el('div');
    const medNames = el('datalist', { id: 'med-names' },
      (data.medicationNames || []).map(name => el('option', { value: name })));

    function medRow(med) {
      const idx = draft.medications.indexOf(med);
      const name = textInput(`med-name-${idx}`, med.name, { list: 'med-names' });
      const strength = textInput(`med-strength-${idx}`, med.strength);
      const morning = textInput(`med-m-${idx}`, med.morning);
      const noon = textInput(`med-n-${idx}`, med.noon);
      const evening = textInput(`med-e-${idx}`, med.evening);

      [name, strength, morning, noon, evening].forEach(node => node.addEventListener('input', () => {
        med.name = name.value; med.strength = strength.value;
        med.morning = morning.value; med.noon = noon.value; med.evening = evening.value;
        touch();
      }));

      return el('div', { class: 'subform' }, [
        el('div', { class: 'subform__head' }, [
          el('h4', { text: 'Medikament' }),
          el('button', {
            class: 'linkbtn', type: 'button', text: 'Entfernen',
            onclick: () => {
              draft.medications.splice(draft.medications.indexOf(med), 1);
              touch(); redrawMeds();
            },
          }),
        ]),
        el('div', { class: 'grid-2' }, [
          field('Medikament', name),
          field('Dosierung', strength),
        ]),
        el('div', { class: 'grid-3', style: 'margin-top:10px' }, [
          field('morgens', morning),
          field('mittags', noon),
          field('abends', evening),
        ]),
      ]);
    }

    const redrawMeds = () => medList.replaceChildren(...draft.medications.map(medRow));
    redrawMeds();

    form.append(card('Medikation', [
      medNames,
      medList,
      el('button', {
        class: 'btn btn--ghost btn--block', type: 'button', text: '＋ Medikament hinzufügen',
        onclick: () => {
          if (draft.medications.length >= (session.limits?.medications ?? 30)) {
            toast('Mehr Medikamentenzeilen sind nicht möglich.'); return;
          }
          draft.medications.push({ name: '', strength: '', morning: '', noon: '', evening: '' });
          touch(); redrawMeds();
        },
      }),
      el('p', { class: 'field__hint', text: 'Mengen frei eintragen, z. B. „1 Tbl.“, „1 Hub“, „5 ml“.' }),
    ]));

    /* Speichern, Abbrechen, Löschen */
    const saveBtn = el('button', { class: 'btn btn--block', type: 'submit', text: 'Speichern' });
    form.append(el('div', { class: 'actions' }, [
      saveBtn,
      el('button', {
        class: 'btn btn--ghost btn--block', type: 'button', text: 'Abbrechen',
        onclick: () => go(isNew ? '#/' : `#/p/${id}`),
      }),
      !isNew && el('button', {
        class: 'btn btn--danger btn--block', type: 'button', text: 'Person entfernen',
        onclick: async () => {
          if (!confirm(`„${original.name}“ mit allen Angaben entfernen?\n\nÄrzte, Allergien und Krankheiten bleiben für die anderen erhalten.`)) return;
          const result = await guard(() => Api.deletePerson(id));
          if (!result) return;
          data = result; dirty = false;
          go('#/'); toast('Eintrag entfernt');
        },
      }),
    ]));

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!nameInput.value.trim()) {
        nameInput.focus();
        toast('Bitte einen Namen eintragen.');
        return;
      }

      const payload = {
        name: nameInput.value,
        birthdate: birthInput.value,
        shoeSize: shoeSelect.value,
        clothingSize: clothSelect.value,
        trouserSize: trouserInput.value,
        doctorIds: draft.doctorIds,
        allergyIds: draft.allergyIds,
        illnessIds: draft.illnessIds,
        medications: draft.medications.filter(m => m.name.trim()),
      };

      const result = await guard(
        () => (isNew ? Api.createPerson(payload) : Api.updatePerson(id, payload)),
        { busy: saveBtn }
      );
      if (!result) return;

      data = result;
      dirty = false;
      go(`#/p/${result.id ?? id}`);     // nach dem Speichern zurueck in die Leseansicht
      toast('Gespeichert');
    });

    render(form, {
      heading: isNew ? 'Neue Person' : 'Bearbeiten',
      back: isNew ? '#/' : `#/p/${id}`,
      narrow: true,
    });
  }

  /* --- Kachelauswahl fuer Allergien und Krankheiten ------------------------------ */

  function labelPicker({ entries, selected, create, placeholder, onChange }) {
    const grid = el('div', { class: 'picker' });

    function draw() {
      const list = entries();
      grid.replaceChildren(...(list.length
        ? list.map(entry => {
            const on = selected.includes(entry.id);
            return el('button', {
              class: 'pick', type: 'button', 'aria-pressed': String(on),
              onclick: () => {
                const at = selected.indexOf(entry.id);
                if (at >= 0) selected.splice(at, 1); else selected.push(entry.id);
                onChange(); draw();
              },
            }, [on && el('span', { class: 'pick__mark', 'aria-hidden': 'true', text: '✓' }), entry.label]);
          })
        : [el('p', { class: 'field__hint', text: 'Noch nichts angelegt – unten eintragen.' })]));
    }
    draw();

    const input = el('input', { type: 'text', placeholder, 'aria-label': placeholder });
    const addBtn = el('button', { class: 'btn btn--small', type: 'button', text: 'Anlegen' });

    async function add() {
      const label = input.value.trim();
      if (!label) return;
      const result = await guard(() => create(label), { busy: addBtn });
      if (!result) return;

      // Vorhandene Eintraege liefert der Server ohne Fehler zurueck – dann
      // wird der bestehende einfach ausgewaehlt.
      if (result.created) {
        const list = entries();
        list.push(result.entry);
        list.sort((a, b) => a.label.localeCompare(b.label, 'de'));
      }
      if (!selected.includes(result.entry.id)) selected.push(result.entry.id);
      input.value = '';
      onChange(); draw();
      toast(result.created ? 'Angelegt und ausgewählt' : 'War schon vorhanden – ausgewählt');
    }

    addBtn.onclick = add;
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); add(); }
    });

    return [
      grid,
      el('div', { class: 'addline' }, [input, addBtn]),
      el('p', { class: 'field__hint',
                text: 'Einmal angelegt, steht der Eintrag bei jeder Person zur Auswahl.' }),
    ];
  }

  /* --- Kachelauswahl fuer Aerzte -------------------------------------------------- */

  function doctorPicker(selected, onChange) {
    const grid = el('div', { class: 'picker' });

    function draw() {
      const tiles = data.doctors.map(doc => {
        const on = selected.includes(doc.id);
        return el('div', { class: 'pick pick--doctor', 'aria-pressed': String(on) }, [
          el('button', {
            class: 'pick__edit', type: 'button', title: 'Arzt bearbeiten',
            'aria-label': `${doc.name} bearbeiten`,
            onclick: e => { e.stopPropagation(); openDoctorForm(doc, draw); },
          }, '✎'),
          el('button', {
            type: 'button',
            style: 'all:unset;cursor:pointer;display:flex;flex-direction:column;gap:1px',
            'aria-pressed': String(on),
            onclick: () => {
              const at = selected.indexOf(doc.id);
              if (at >= 0) selected.splice(at, 1); else selected.push(doc.id);
              onChange(); draw();
            },
          }, [
            el('span', { class: 'pick__kind', text: doc.kind }),
            el('span', null, [on ? '✓ ' : '', doc.name]),
          ]),
        ]);
      });

      tiles.push(el('button', {
        class: 'pick pick--add', type: 'button', text: '＋ Neuer Arzt',
        onclick: () => openDoctorForm(null, draw),
      }));

      grid.replaceChildren(...tiles);
    }
    draw();

    return [
      grid,
      el('p', { class: 'field__hint',
                text: 'Ein Arzt kann mehreren Personen zugeordnet sein. Das Stift-Symbol öffnet die Anschrift.' }),
    ];

    /** Formular fuer einen neuen oder vorhandenen Arzt. */
    function openDoctorForm(doc, afterSave) {
      const isNew = !doc;
      const kindList = el('datalist', { id: 'doc-kinds' },
        DOCTOR_KINDS.map(kind => el('option', { value: kind })));

      const kind = textInput('d-kind', doc?.kind || '', { list: 'doc-kinds', required: true });
      const name = textInput('d-name', doc?.name || '', { required: true });
      const street = textInput('d-street', doc?.street || '');
      const zip = textInput('d-zip', doc?.zip || '', { inputmode: 'numeric' });
      const city = textInput('d-city', doc?.city || '');
      const phone = el('input', { id: 'd-phone', type: 'tel', inputmode: 'tel', value: doc?.phone || '' });
      const email = el('input', { id: 'd-email', type: 'email', inputmode: 'email', value: doc?.email || '' });

      const submit = el('button', { class: 'btn btn--block', type: 'submit',
                                    text: isNew ? 'Anlegen' : 'Speichern' });

      const form = el('form', { autocomplete: 'off', novalidate: true }, [
        kindList,
        field('Art', kind, 'Auswahl oder eigene Eingabe.'),
        field('Name / Praxis', name, 'Pflichtfeld.'),
        field('Straße und Hausnummer', street),
        el('div', { class: 'grid-3' }, [field('PLZ', zip), field('Ort', city)]),
        el('div', { style: 'margin-top:14px' }, [field('Telefon', phone), field('E-Mail', email)]),
        el('div', { class: 'actions' }, [
          submit,
          el('button', { class: 'btn btn--ghost btn--block', type: 'button',
                         text: 'Abbrechen', onclick: closeModal }),
        ]),
      ]);

      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!kind.value.trim() || !name.value.trim()) {
          toast('Art und Name sind Pflichtfelder.');
          return;
        }
        const payload = {
          kind: kind.value, name: name.value, street: street.value,
          zip: zip.value, city: city.value, phone: phone.value, email: email.value,
        };

        const result = await guard(
          () => (isNew ? Api.createDoctor(payload) : Api.updateDoctor(doc.id, payload)),
          { busy: submit }
        );
        if (!result) return;

        if (isNew) {
          if (result.created) data.doctors.push(result.doctor);
          if (!selected.includes(result.doctor.id)) selected.push(result.doctor.id);
          onChange();
          toast(result.created ? 'Angelegt und ausgewählt' : 'War schon vorhanden – ausgewählt');
        } else {
          Object.assign(byId(data.doctors, doc.id), result.doctor);
          toast('Gespeichert');
        }
        data.doctors.sort((a, b) =>
          a.name.localeCompare(b.name, 'de') || a.kind.localeCompare(b.kind, 'de'));

        closeModal();
        afterSave();
      });

      openModal(isNew ? 'Neuer Arzt' : 'Arzt bearbeiten', form);
    }
  }

  /* --- Druckauswahl ------------------------------------------------------------------ */

  function viewPrintSelect() {
    const boxes = data.persons.map(p => {
      const box = el('input', { type: 'checkbox', value: String(p.id), checked: true });
      return { person: p, box, node: el('label', { class: 'check' }, [box, el('span', { class: 'check__name', text: p.name })]) };
    });

    const allBox = el('input', { type: 'checkbox', checked: true });
    allBox.addEventListener('change', () => boxes.forEach(b => { b.box.checked = allBox.checked; }));
    boxes.forEach(b => b.box.addEventListener('change', () => {
      allBox.checked = boxes.every(x => x.box.checked);
    }));

    render([
      card('Wen ausdrucken?', [
        el('label', { class: 'check' }, [allBox, el('span', { class: 'check__name', text: 'Alle auswählen' })]),
        ...boxes.map(b => b.node),
      ]),
      el('p', { class: 'field__hint',
                text: 'Es öffnet sich ein A4-Blatt in einem neuen Tab. Gedruckt wird über den normalen Druckdialog.' }),
      el('div', { class: 'actions' }, [
        el('button', {
          class: 'btn btn--block', type: 'button', text: 'Druckblatt öffnen',
          onclick: () => {
            const ids = boxes.filter(b => b.box.checked).map(b => b.person.id);
            if (!ids.length) { toast('Bitte mindestens eine Person auswählen.'); return; }
            openPrint(ids);
          },
        }),
        el('button', { class: 'btn btn--ghost btn--block', type: 'button',
                       text: 'Zurück', onclick: () => go('#/') }),
      ]),
    ], { heading: 'Daten drucken', back: '#/', narrow: true });
  }

  /* --- Zugänge verwalten --------------------------------------------------------------- */

  async function viewDevices() {
    if (!session.device.isAdmin) { go('#/'); return; }

    render(el('p', { class: 'loading', text: 'Wird geladen …' }),
           { heading: 'Zugänge', back: '#/', narrow: true });

    const [devicesResult, invitesResult] = await Promise.all([
      guard(() => Api.devices()),
      guard(() => Api.invites()),
    ]);
    if (!devicesResult || !invitesResult) return;

    const devices = devicesResult.devices;
    const invites = invitesResult.invites;

    const deviceCard = card('Angemeldete Geräte', devices.map(d => el('div', { class: 'listrow' }, [
      el('div', { class: 'listrow__text' }, [
        el('div', { class: 'listrow__title' }, [
          d.label,
          d.isAdmin ? ' ' : null,
          d.isAdmin ? el('span', { class: 'tag', text: 'Verwaltung' }) : null,
        ]),
        el('div', { class: 'listrow__meta',
                    text: (d.isCurrent ? 'Dieses Gerät · ' : '') + 'zuletzt ' + formatDate(d.lastSeenAt.slice(0, 10)) }),
      ]),
      !d.isCurrent && el('button', {
        class: 'btn btn--danger btn--small', type: 'button', text: 'Entziehen',
        onclick: async () => {
          if (!confirm(`Zugang von „${d.label}“ entziehen?\n\nDas Gerät ist danach sofort ausgesperrt.`)) return;
          if (await guard(() => Api.revokeDevice(d.id))) { toast('Zugang entzogen'); viewDevices(); }
        },
      }),
    ])));

    const inviteCard = card('Offene Einladungen', invites.length
      ? invites.map(i => el('div', { class: 'listrow' }, [
          el('div', { class: 'listrow__text' }, [
            el('div', { class: 'listrow__title', text: i.label }),
            el('div', { class: 'listrow__meta',
                        text: 'gültig bis ' + new Date(i.expiresAt).toLocaleString('de-DE') }),
          ]),
          el('button', {
            class: 'btn btn--danger btn--small', type: 'button', text: 'Zurückziehen',
            onclick: async () => {
              if (await guard(() => Api.deleteInvite(i.id))) { toast('Zurückgezogen'); viewDevices(); }
            },
          }),
        ]))
      : el('p', { class: 'field__hint', text: 'Keine offenen Einladungen.' }));

    render([
      deviceCard,
      inviteCard,
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn btn--block', type: 'button',
                       text: '＋ Einladungslink erzeugen', onclick: openInviteForm }),
        el('button', { class: 'btn btn--ghost btn--block', type: 'button',
                       text: 'Zurück', onclick: () => go('#/') }),
      ]),
    ], { heading: 'Zugänge', back: '#/', narrow: true });
  }

  function openInviteForm() {
    const label = textInput('i-label', '', { placeholder: 'z. B. Oma Erna / iPhone', required: true });
    const admin = el('input', { type: 'checkbox', id: 'i-admin' });
    const submit = el('button', { class: 'btn btn--block', type: 'submit', text: 'Link erzeugen' });

    const form = el('form', { novalidate: true }, [
      field('Für wen ist der Link?', label, 'Nur zur Wiedererkennung in der Geräteliste.'),
      el('label', { class: 'check' }, [admin, el('span', { text: 'Darf Zugänge verwalten' })]),
      el('div', { class: 'actions' }, [
        submit,
        el('button', { class: 'btn btn--ghost btn--block', type: 'button',
                       text: 'Abbrechen', onclick: closeModal }),
      ]),
    ]);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!label.value.trim()) { toast('Bitte eine Bezeichnung eintragen.'); return; }

      const result = await guard(() => Api.createInvite(label.value, admin.checked), { busy: submit });
      if (!result) return;

      const url = location.origin + location.pathname.replace(/\/[^/]*$/, '/')
                + '#einladung=' + result.invite.token;
      showInviteLink(url, result.invite.label);
    });

    openModal('Einladungslink erzeugen', form);
  }

  function showInviteLink(url, label) {
    const box = el('textarea', { class: 'linkbox', rows: '3', readonly: true }, url);

    const copyBtn = el('button', {
      class: 'btn btn--block', type: 'button', text: 'Link kopieren',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast('Link kopiert');
        } catch {
          box.select();
          toast('Bitte von Hand markieren und kopieren.');
        }
      },
    });

    const buttons = [copyBtn];
    if (navigator.share) {
      buttons.push(el('button', {
        class: 'btn btn--ghost btn--block', type: 'button', text: 'Link teilen',
        onclick: () => navigator.share({ title: 'Familienbuch', text: 'Dein Zugang zum Familienbuch', url }).catch(() => {}),
      }));
    }
    buttons.push(el('button', {
      class: 'btn btn--ghost btn--block', type: 'button', text: 'Fertig',
      onclick: () => { closeModal(); viewDevices(); },
    }));

    openModal('Link für „' + label + '“', el('div', null, [
      el('p', { text: 'Diesen Link verschicken. Er lässt sich genau einmal öffnen und verfällt nach 24 Stunden.' }),
      box,
      el('p', { class: 'field__hint',
                text: 'Der Link wird nur jetzt angezeigt und lässt sich später nicht erneut aufrufen.' }),
      el('div', { class: 'actions' }, buttons),
    ]));
  }

  /* --- Gesperrte Ansicht ------------------------------------------------------------------- */

  function viewLocked(message, options = {}) {
    render(card('Zugang', [
      el('p', { text: message }),
      options.extra || null,
    ]), { heading: 'Familienbuch', narrow: true });
  }

  /* --- Anmeldung ---------------------------------------------------------------------------- */

  /** Nimmt `#einladung=…` bzw. `#verwaltung=…` entgegen und bereinigt die Adresse. */
  async function consumeHashCredentials() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const invite = params.get('einladung');
    const adminCode = params.get('verwaltung');
    if (!invite && !adminCode) return false;
    lastHash = '#/';

    // Zugangsdaten sofort aus der Adresszeile entfernen: sie sollen weder im
    // Verlauf noch in einem Screenshot oder im Teilen-Dialog auftauchen.
    history.replaceState(null, '', location.pathname + location.search);

    render(el('p', { class: 'loading', text: 'Zugang wird eingerichtet …' }));

    try {
      if (invite) {
        await Api.redeem(invite);
      } else {
        const label = prompt('Bezeichnung für dieses Gerät:', 'Mein Rechner') || 'Verwaltung';
        await Api.adminLogin(adminCode, label);
      }
      toast('Willkommen!');
      return true;
    } catch (err) {
      viewLocked(
        err instanceof OfflineError
          ? 'Keine Verbindung zum Server. Bitte später erneut versuchen.'
          : err.message,
        { extra: el('p', { class: 'field__hint',
                           text: 'Einladungslinks lassen sich nur einmal öffnen und verfallen nach 24 Stunden.' }) }
      );
      return null;
    }
  }

  /* --- Wegweiser ----------------------------------------------------------------------------- */

  function route() {
    if (!session || !session.authenticated) return;

    const hash = location.hash || '#/';

    // Ungespeicherte Aenderungen nicht stillschweigend verwerfen.
    if (dirty && hash !== lastHash) {
      if (!confirm('Es gibt ungespeicherte Änderungen. Diese Seite wirklich verlassen?')) {
        history.replaceState(null, '', lastHash);
        return;
      }
      dirty = false;
    }
    lastHash = hash;
    closeModal();

    const path = hash.replace(/^#/, '') || '/';
    const edit = path.match(/^\/p\/(\d+)\/bearbeiten$/);
    const read = path.match(/^\/p\/(\d+)$/);

    if (path === '/neu') viewForm(null, true);
    else if (edit) viewForm(Number(edit[1]), false);
    else if (read) viewPerson(Number(read[1]));
    else if (path === '/drucken') viewPrintSelect();
    else if (path === '/zugaenge') viewDevices();
    else viewOverview();
  }

  window.addEventListener('beforeunload', event => {
    if (dirty) { event.preventDefault(); event.returnValue = ''; }
  });

  /* --- Verbindungsanzeige ---------------------------------------------------------------------- */

  function watchConnection() {
    const update = () => { offlineBar.hidden = navigator.onLine; };
    update();
    window.addEventListener('online', () => { update(); if (session?.authenticated) reload(); });
    window.addEventListener('offline', update);
  }

  async function reload() {
    const result = await guard(() => Api.data());
    if (!result) return;
    data = result;
    if (result.fromCache) {
      offlineBar.hidden = false;
      offlineBar.textContent = 'Keine Verbindung – angezeigt wird der zuletzt geladene Stand.';
    }
    route();
  }

  /* --- Service Worker --------------------------------------------------------------------------- */

  function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
        if (reg.waiting) showUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const incoming = reg.installing;
          if (!incoming) return;
          incoming.addEventListener('statechange', () => {
            if (incoming.state === 'installed' && navigator.serviceWorker.controller) showUpdate(incoming);
          });
        });
      } catch (err) {
        console.warn('[sw] Registrierung fehlgeschlagen:', err);
      }
    });

    // Beim allerersten Besuch uebernimmt der Service Worker die Seite ohne
    // vorherigen Controller. Das ist kein Update – dann darf nicht neu
    // geladen werden, sonst blinkt der Einstieg unnoetig.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading || dirty) return;
      reloading = true;
      location.reload();
    });

    function showUpdate(worker) {
      const banner = document.getElementById('update-banner');
      banner.hidden = false;
      document.body.classList.add('has-banner');
      document.getElementById('update-action').onclick = () => {
        banner.hidden = true;
        document.body.classList.remove('has-banner');
        worker.postMessage({ type: 'SKIP_WAITING' });
      };
    }
  }

  /* --- Installationshinweis ------------------------------------------------------------------------ */

  function setupInstallHint() {
    const hint = document.getElementById('install-hint');
    const text = document.getElementById('install-hint-text');
    const action = document.getElementById('install-action');
    const KEY = 'familienbuch.installHint';

    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true;
    if (standalone) return;
    try { if (localStorage.getItem(KEY)) return; } catch { /* Privatmodus */ }

    const show = on => {
      hint.hidden = !on;
      document.body.classList.toggle('has-banner',
        Array.from(document.querySelectorAll('.banner')).some(b => !b.hidden));
    };
    const dismiss = () => {
      show(false);
      try { localStorage.setItem(KEY, '1'); } catch { /* Privatmodus */ }
    };
    document.getElementById('install-dismiss').addEventListener('click', dismiss);

    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      text.textContent = 'Familienbuch auf dem Startbildschirm ablegen?';
      action.hidden = false;
      action.onclick = async () => {
        show(false);
        event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === 'accepted') dismiss(); else show(true);
      };
      show(true);
    });

    if (UI.isIOS()) {
      text.textContent = 'Zum Installieren: unten auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen.';
      show(true);
    }
  }

  /* --- Start -------------------------------------------------------------------------------------- */

  /**
   * Meldet den Zustand vom Server ab und zeichnet die passende Ansicht.
   * @returns {Promise<boolean>} true, wenn dieses Geraet angemeldet ist
   */
  async function loadSession() {
    try {
      session = await Api.session();
    } catch (err) {
      viewLocked(err instanceof OfflineError
        ? 'Keine Verbindung zum Server. Sobald wieder Netz da ist, funktioniert alles wie gewohnt.'
        : 'Die App konnte nicht gestartet werden.');
      return false;
    }

    if (!session.authenticated) {
      viewLocked(
        session.setupNeeded
          ? 'Das Familienbuch ist noch nicht eingerichtet. Melde dich einmalig mit dem Verwaltercode an.'
          : 'Dieses Gerät ist nicht angemeldet. Zum Öffnen wird ein persönlicher Einladungslink benötigt.',
        { extra: el('p', { class: 'field__hint',
                           text: 'Den Link bekommst du von der Person, die das Familienbuch eingerichtet hat.' }) }
      );
      return false;
    }

    if (!location.hash || location.hash === '#') {
      history.replaceState(null, '', location.pathname + location.search + '#/');
    }
    lastHash = location.hash;
    await reload();
    return true;
  }

  const hasCredentials = () => /^#(einladung|verwaltung)=/.test(location.hash);

  /**
   * Ein Einladungslink kann auch bei bereits geoeffneter App ankommen – dann
   * aendert sich nur der Hash und die Seite laedt NICHT neu. Dieser Fall muss
   * hier mitbehandelt werden, sonst passiert beim Antippen des Links nichts.
   */
  async function onHashChange() {
    if (hasCredentials()) {
      if (await consumeHashCredentials()) await loadSession();
      return;
    }
    route();
  }

  async function boot() {
    themeBtn.onclick = () => {
      const next = UI.cycleTheme();
      themeBtn.setAttribute('aria-label', UI.themeLabel(next));
      toast(UI.themeLabel(next));
    };
    themeBtn.setAttribute('aria-label', UI.themeLabel(UI.storedTheme()));

    watchConnection();
    setupInstallHint();
    window.addEventListener('hashchange', onHashChange);

    if (hasCredentials() && (await consumeHashCredentials()) === null) {
      return;     // Einloesen fehlgeschlagen, Meldung steht bereits
    }
    await loadSession();
  }

  setupServiceWorker();
  boot().catch(err => {
    console.error('[boot]', err);
    viewLocked('Die App konnte nicht gestartet werden. Bitte die Seite neu laden.');
  });
})();
