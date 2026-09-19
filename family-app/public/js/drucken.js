(function () {
  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function alter(iso) {
    if (!iso) return '';
    const geb = new Date(iso + 'T00:00:00');
    if (Number.isNaN(geb.getTime())) return '';
    const heute = new Date();
    let jahre = heute.getFullYear() - geb.getFullYear();
    const m = heute.getMonth() - geb.getMonth();
    if (m < 0 || (m === 0 && heute.getDate() < geb.getDate())) jahre -= 1;
    return jahre >= 0 ? `${jahre} Jahre` : '';
  }

  function zeile(label, wert) {
    if (!wert) return '';
    return `<div class="zeile"><span class="label">${label}</span><span class="wert">${wert}</span></div>`;
  }

  function personHtml(m) {
    const groessen = [
      m.shoe_size ? `Schuhe ${escapeHtml(m.shoe_size)}` : '',
      m.clothing_size ? `Kleidung ${escapeHtml(m.clothing_size)}` : '',
      m.trouser_size ? `Hose ${escapeHtml(m.trouser_size)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    const aerzte = m.doctors.length
      ? `<ul class="liste">${m.doctors
          .map((d) => {
            const teile = [d.address, d.phone].filter(Boolean).map(escapeHtml);
            return `<li><strong>${escapeHtml(d.name)}</strong>${
              teile.length ? `<br /><span class="klein">${teile.join(' · ')}</span>` : ''
            }</li>`;
          })
          .join('')}</ul>`
      : '';

    const namen = (liste) => liste.map((c) => escapeHtml(c.name)).join(', ');

    const medikation = m.medications.length
      ? `<table class="med">
          <thead><tr><th>Medikament</th><th>morgens</th><th>mittags</th><th>abends</th></tr></thead>
          <tbody>${m.medications
            .map(
              (med) =>
                `<tr><td>${escapeHtml(med.name)}</td><td>${escapeHtml(med.morning) || '–'}</td><td>${
                  escapeHtml(med.noon) || '–'
                }</td><td>${escapeHtml(med.evening) || '–'}</td></tr>`
            )
            .join('')}</tbody>
        </table>`
      : '';

    const geburt = m.birthdate
      ? `${formatDate(m.birthdate)}${alter(m.birthdate) ? ` (${alter(m.birthdate)})` : ''}`
      : '';

    return `
      <section class="person">
        <h2>${escapeHtml(m.name)}</h2>
        ${zeile('Geboren', geburt)}
        ${zeile('Größen', groessen)}
        ${m.allergies.length ? zeile('Allergien', `<strong class="warn">${namen(m.allergies)}</strong>`) : ''}
        ${m.illnesses.length ? zeile('Krankheiten', namen(m.illnesses)) : ''}
        ${aerzte ? `<div class="zeile"><span class="label">Ärzte</span><span class="wert">${aerzte}</span></div>` : ''}
        ${medikation ? `<div class="zeile"><span class="label">Medikation</span><span class="wert">${medikation}</span></div>` : ''}
      </section>
    `;
  }

  (async () => {
    const sheet = document.getElementById('sheet');
    const ids = (new URLSearchParams(location.search).get('ids') || '')
      .split(',')
      .map((n) => Number(n))
      .filter(Number.isInteger);

    const res = await fetch('/api/members');
    if (res.status === 401) {
      window.location.replace('/login.html');
      return;
    }
    const alle = await res.json();
    const gewaehlt = ids.length ? alle.filter((m) => ids.includes(m.id)) : alle;

    if (!gewaehlt.length) {
      sheet.innerHTML = '<p>Keine Personen ausgewählt.</p>';
      return;
    }

    const datum = new Date().toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    sheet.innerHTML = `
      <header class="blatt-kopf">
        <h1>Familienbuch</h1>
        <span class="stand">Stand: ${datum}</span>
      </header>
      ${gewaehlt.map(personHtml).join('')}
    `;

    document.getElementById('toolbar-info').textContent =
      gewaehlt.length === 1 ? '1 Person' : `${gewaehlt.length} Personen`;
  })();
})();
