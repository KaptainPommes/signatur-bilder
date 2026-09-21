/* ==========================================================================
   druck.js – baut das A4-Blatt fuer die ausgewaehlten Personen auf
   --------------------------------------------------------------------------
   Aufruf:  druck.html?ids=1,2,3
   Die Seite laedt die Daten ueber dieselbe Schnittstelle wie die App und
   verlangt damit ebenfalls eine gueltige Anmeldung.
   ========================================================================== */

(() => {
  'use strict';

  const { el, birthLine, today, addressLines } = UI;

  const sheet = document.getElementById('sheet');
  const barText = document.getElementById('bar-text');
  const printBtn = document.getElementById('print-btn');

  const message = text => sheet.replaceChildren(el('p', { class: 'hinweis', text }));

  function block(title, body, alert = false) {
    return el('section', { class: 'block' + (alert ? ' block--alert' : '') }, [
      el('h3', { class: 'block__title', text: title }),
      el('div', { class: 'block__body' }, body),
    ]);
  }

  function sizeLine(p) {
    const parts = [];
    if (p.sizes.shoe) parts.push('Schuhgröße ' + p.sizes.shoe);
    if (p.sizes.clothing) parts.push('Kleidergröße ' + p.sizes.clothing);
    if (p.sizes.trousers) parts.push('Hosengröße ' + p.sizes.trousers);
    return parts.join('   ·   ');
  }

  function medicationTable(medications) {
    const head = el('tr', null, [
      el('th', { text: 'Medikament' }),
      el('th', { text: 'Dosierung' }),
      el('th', { text: 'morgens' }),
      el('th', { text: 'mittags' }),
      el('th', { text: 'abends' }),
    ]);

    const rows = medications.map(m => el('tr', null, [
      el('td', { text: m.name }),
      el('td', { text: m.strength || '' }),
      ...[m.morning, m.noon, m.evening].map(dose =>
        el('td', { class: 'med-dose' + (dose ? '' : ' nix'), text: dose || '–' })),
    ]));

    return el('table', null, [el('thead', null, head), el('tbody', null, rows)]);
  }

  function doctorBlock(doctors) {
    return el('div', { class: 'docs' }, doctors.map(d => el('div', null, [
      d.kind && el('span', { class: 'doc__kind doc__line', text: d.kind }),
      el('span', { class: 'doc__line', text: d.name }),
      ...addressLines(d).map(line => el('span', { class: 'doc__line', text: line })),
      d.phone && el('span', { class: 'doc__line', text: 'Tel. ' + d.phone }),
      d.email && el('span', { class: 'doc__line', text: d.email }),
    ])));
  }

  function personBlock(p, data) {
    const labels = (ids, list) => ids.map(id => list.find(x => x.id === id))
      .filter(Boolean).map(x => x.label);

    const allergies = labels(p.allergyIds, data.allergies);
    const illnesses = labels(p.illnessIds, data.illnesses);
    const doctors = p.doctorIds.map(id => data.doctors.find(d => d.id === id)).filter(Boolean);

    return el('article', { class: 'person' }, [
      el('div', { class: 'person__head' }, [
        el('h2', { class: 'person__name', text: p.name }),
        p.birthdate && el('span', { class: 'person__birth', text: birthLine(p.birthdate) }),
      ]),
      sizeLine(p) && el('p', { class: 'person__sizes', text: sizeLine(p) }),
      // Bewusst "> 0": ein blosses `laenge && …` liefert bei 0 die Zahl selbst,
      // und die landet dann als "0" im Ausdruck.
      allergies.length > 0 && block('Allergien', allergies.join(' · '), true),
      illnesses.length > 0 && block('Krankheiten', illnesses.join(' · ')),
      p.medications.length > 0 && block('Medikation', medicationTable(p.medications)),
      doctors.length > 0 && block('Ärzte', doctorBlock(doctors)),
    ]);
  }

  async function start() {
    const ids = new URLSearchParams(location.search).get('ids') || '';
    const wanted = ids.split(',').map(Number).filter(Number.isInteger).filter(n => n > 0);

    if (!wanted.length) {
      barText.textContent = 'Keine Auswahl';
      message('Es wurde niemand zum Drucken ausgewählt.');
      return;
    }

    let data;
    try {
      data = await Api.data();
    } catch (err) {
      if (err instanceof AuthError) {
        barText.textContent = 'Nicht angemeldet';
        message('Für den Ausdruck wird eine gültige Anmeldung benötigt. Bitte zuerst das Familienbuch öffnen.');
      } else {
        barText.textContent = 'Fehler';
        message(err instanceof OfflineError
          ? 'Keine Verbindung zum Server.'
          : 'Die Daten konnten nicht geladen werden.');
      }
      return;
    }

    // Reihenfolge wie in der Übersicht, nicht wie in der Adresszeile.
    const persons = data.persons.filter(p => wanted.includes(p.id));
    if (!persons.length) {
      barText.textContent = 'Keine Treffer';
      message('Die ausgewählten Personen wurden nicht gefunden.');
      return;
    }

    sheet.replaceChildren(
      el('header', { class: 'sheet__head' }, [
        el('h1', { class: 'sheet__title', text: 'Familienbuch' }),
        el('span', { class: 'sheet__stand', text: 'Stand: ' + today() }),
      ]),
      ...persons.map(p => personBlock(p, data))
    );

    barText.textContent = persons.length === 1
      ? persons[0].name
      : persons.length + ' Personen';
    printBtn.hidden = false;
    printBtn.onclick = () => window.print();
    document.title = 'Familienbuch – Stand ' + today();
  }

  start();
})();
