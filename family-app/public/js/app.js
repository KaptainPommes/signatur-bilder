(function () {
  const state = {
    members: [],
    me: null,
    catalog: { doctors: [], allergies: [], illnesses: [], medicationNames: [] },
    // Auswahl im gerade offenen Formular
    auswahl: { doctorIds: new Set(), conditionIds: new Set() },
  };

  const SHOE_SIZES = Array.from({ length: 16 }, (_, i) => String(35 + i)); // 35 bis 50
  const CLOTHING_SIZES = ['134/140', '146/152', '158/164', '170/176', 'S', 'M', 'L', 'XL', 'XXL'];

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function initials(name) {
    return (name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('');
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const PALETTE = ['#2F5D50', '#C98A3E', '#4A6FA5', '#8A5A9E', '#B0503F', '#3E7C7C'];
  function colorForIndex(i) {
    return PALETTE[i % PALETTE.length];
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach((m) => {
      m.hidden = true;
    });
  }

  async function json(url, options) {
    const res = await fetch(url, options);
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  }

  // ---------- Theme ----------
  const themeToggle = document.getElementById('theme-toggle');
  try {
    const stored = localStorage.getItem('familienbuch-theme');
    if (stored) document.documentElement.setAttribute('data-theme', stored);
  } catch (e) {
    /* localStorage kann fehlen */
  }
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('familienbuch-theme', next);
    } catch (e) {
      /* ignorieren */
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login.html');
  });

  // ---------- Übersicht ----------
  const memberGrid = document.getElementById('member-grid');
  const addMemberBtn = document.getElementById('add-member-btn');

  function memberCardHtml(m, idx) {
    const color = m.color || colorForIndex(idx);
    const zeilen = [];
    if (m.birthdate) zeilen.push(`<span class="badge mono">${formatDate(m.birthdate)}</span>`);
    if (m.allergies.length) zeilen.push(`<span class="badge badge-danger">${m.allergies.length}× Allergie</span>`);
    if (m.illnesses.length) zeilen.push(`<span class="badge badge-warn">${m.illnesses.length}× Krankheit</span>`);
    if (m.medications.length) zeilen.push(`<span class="badge">${m.medications.length}× Medikament</span>`);
    const groessen = [m.shoe_size && `Schuh ${m.shoe_size}`, m.clothing_size, m.trouser_size && `Hose ${m.trouser_size}`]
      .filter(Boolean)
      .join(' · ');
    return `
      <button class="member-card" data-id="${m.id}">
        <div class="member-card-top">
          <span class="avatar" style="background:${color}">${initials(m.name)}</span>
          <div class="name">${escapeHtml(m.name)}</div>
        </div>
        <div class="badge-row">${zeilen.join('')}</div>
        ${groessen ? `<div class="card-sizes">${escapeHtml(groessen)}</div>` : ''}
      </button>
    `;
  }

  function renderMembers() {
    memberGrid.innerHTML = state.members.map((m, i) => memberCardHtml(m, i)).join('');
    memberGrid.appendChild(addMemberBtn);
    memberGrid.querySelectorAll('.member-card').forEach((btn) => {
      btn.addEventListener('click', () => openMemberModal(Number(btn.dataset.id)));
    });
  }

  // ---------- Personen-Formular ----------
  const memberModal = document.getElementById('member-modal');
  const memberForm = document.getElementById('member-form');
  const memberSaveStatus = document.getElementById('member-save-status');
  const deleteMemberBtn = document.getElementById('delete-member-btn');
  const memberModalTitle = document.getElementById('member-modal-title');
  const medRows = document.getElementById('med-rows');

  function fillSelect(select, werte, leerText) {
    select.innerHTML =
      `<option value="">${leerText}</option>` +
      werte.map((w) => `<option value="${w}">${w}</option>`).join('');
  }
  fillSelect(document.getElementById('m-shoe'), SHOE_SIZES, '– keine Angabe –');
  fillSelect(document.getElementById('m-clothing'), CLOTHING_SIZES, '– keine Angabe –');

  function renderChips() {
    document.getElementById('doctor-chips').innerHTML = state.catalog.doctors.length
      ? state.catalog.doctors
          .map((d) => {
            const an = state.auswahl.doctorIds.has(d.id);
            const zusatz = [d.address, d.phone].filter(Boolean).join(' · ');
            return `<button type="button" class="chip ${an ? 'on' : ''}" data-doctor="${d.id}">
                <span class="chip-main">${escapeHtml(d.name)}</span>
                ${zusatz ? `<span class="chip-sub">${escapeHtml(zusatz)}</span>` : ''}
              </button>`;
          })
          .join('')
      : '<p class="field-hint">Noch kein Arzt angelegt.</p>';

    const baue = (liste, attr) =>
      liste.length
        ? liste
            .map(
              (c) =>
                `<button type="button" class="chip ${state.auswahl.conditionIds.has(c.id) ? 'on' : ''}" data-${attr}="${c.id}"><span class="chip-main">${escapeHtml(c.name)}</span></button>`
            )
            .join('')
        : '<p class="field-hint">Noch nichts eingetragen.</p>';

    document.getElementById('allergy-chips').innerHTML = baue(state.catalog.allergies, 'allergy');
    document.getElementById('illness-chips').innerHTML = baue(state.catalog.illnesses, 'illness');

    document.getElementById('med-names').innerHTML = state.catalog.medicationNames
      .map((n) => `<option value="${escapeHtml(n)}"></option>`)
      .join('');
  }

  // Klicks auf Chips schalten die Auswahl um.
  memberForm.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    if (chip.dataset.doctor) {
      const id = Number(chip.dataset.doctor);
      state.auswahl.doctorIds.has(id)
        ? state.auswahl.doctorIds.delete(id)
        : state.auswahl.doctorIds.add(id);
    } else {
      const id = Number(chip.dataset.allergy || chip.dataset.illness);
      if (!id) return;
      state.auswahl.conditionIds.has(id)
        ? state.auswahl.conditionIds.delete(id)
        : state.auswahl.conditionIds.add(id);
    }
    renderChips();
  });

  function medRowHtml(med = {}) {
    return `<div class="med-row">
      <input class="med-name" list="med-names" maxlength="120" value="${escapeHtml(med.name || '')}" placeholder="Name" />
      <input class="med-morning mono" maxlength="30" value="${escapeHtml(med.morning || '')}" />
      <input class="med-noon mono" maxlength="30" value="${escapeHtml(med.noon || '')}" />
      <input class="med-evening mono" maxlength="30" value="${escapeHtml(med.evening || '')}" />
      <button type="button" class="row-remove" aria-label="Zeile entfernen">×</button>
    </div>`;
  }

  document.getElementById('add-med-btn').addEventListener('click', () => {
    medRows.insertAdjacentHTML('beforeend', medRowHtml());
  });

  medRows.addEventListener('click', (e) => {
    if (e.target.classList.contains('row-remove')) e.target.closest('.med-row').remove();
  });

  function sammleMedikation() {
    return [...medRows.querySelectorAll('.med-row')]
      .map((row) => ({
        name: row.querySelector('.med-name').value,
        morning: row.querySelector('.med-morning').value,
        noon: row.querySelector('.med-noon').value,
        evening: row.querySelector('.med-evening').value,
      }))
      .filter((m) => m.name.trim());
  }

  function openMemberModal(id) {
    const m = id ? state.members.find((x) => x.id === id) : null;
    document.getElementById('m-id').value = m ? m.id : '';
    document.getElementById('m-name').value = m ? m.name : '';
    document.getElementById('m-birthdate').value = m ? m.birthdate : '';
    document.getElementById('m-shoe').value = m ? m.shoe_size : '';
    document.getElementById('m-clothing').value = m ? m.clothing_size : '';
    document.getElementById('m-trouser').value = m ? m.trouser_size : '';

    state.auswahl.doctorIds = new Set(m ? m.doctors.map((d) => d.id) : []);
    state.auswahl.conditionIds = new Set(
      m ? [...m.allergies, ...m.illnesses].map((c) => c.id) : []
    );
    medRows.innerHTML = m && m.medications.length ? m.medications.map(medRowHtml).join('') : medRowHtml();

    memberModalTitle.textContent = m ? m.name : 'Neues Familienmitglied';
    deleteMemberBtn.hidden = !m;
    memberSaveStatus.textContent = '';
    document.getElementById('new-doctor-form').hidden = true;
    renderChips();
    closeAllModals();
    memberModal.hidden = false;
  }

  document.getElementById('member-modal-close').addEventListener('click', () => {
    memberModal.hidden = true;
  });
  memberModal.addEventListener('click', (e) => {
    if (e.target === memberModal) memberModal.hidden = true;
  });
  addMemberBtn.addEventListener('click', () => openMemberModal(null));

  // --- neuen Arzt anlegen ---
  const newDoctorForm = document.getElementById('new-doctor-form');
  const doctorError = document.getElementById('doctor-error');

  document.getElementById('new-doctor-btn').addEventListener('click', () => {
    doctorError.hidden = true;
    ['d-name', 'd-address', 'd-phone'].forEach((id) => (document.getElementById(id).value = ''));
    newDoctorForm.hidden = false;
    document.getElementById('d-name').focus();
  });
  document.getElementById('cancel-doctor-btn').addEventListener('click', () => {
    newDoctorForm.hidden = true;
  });

  document.getElementById('save-doctor-btn').addEventListener('click', async () => {
    doctorError.hidden = true;
    const payload = {
      name: document.getElementById('d-name').value,
      address: document.getElementById('d-address').value,
      phone: document.getElementById('d-phone').value,
    };
    if (!payload.name.trim()) {
      doctorError.textContent = 'Bitte einen Namen eintragen.';
      doctorError.hidden = false;
      return;
    }
    const { ok, status, data } = await json('/api/doctors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!ok) {
      doctorError.textContent =
        status === 409 ? 'Diesen Arzt gibt es schon – er steht bereits in der Liste.' : 'Konnte nicht gespeichert werden.';
      doctorError.hidden = false;
      return;
    }
    await ladeKatalog();
    state.auswahl.doctorIds.add(data.id); // neu angelegter Arzt gleich ausgewählt
    renderChips();
    newDoctorForm.hidden = true;
  });

  // --- Allergie / Krankheit neu anlegen ---
  async function neuerEintrag(kind, inputId) {
    const input = document.getElementById(inputId);
    const name = input.value.trim();
    if (!name) return;
    const { ok, data } = await json(`/api/conditions/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const eintrag = ok ? data : data.condition; // bei 409 kommt der vorhandene zurück
    if (eintrag && eintrag.id) state.auswahl.conditionIds.add(eintrag.id);
    input.value = '';
    await ladeKatalog();
    renderChips();
  }

  document.getElementById('add-allergy-btn').addEventListener('click', () => neuerEintrag('allergie', 'new-allergy'));
  document.getElementById('add-illness-btn').addEventListener('click', () => neuerEintrag('krankheit', 'new-illness'));
  // Enter im Eingabefeld soll nicht das ganze Formular abschicken.
  ['new-allergy', 'new-illness'].forEach((id) => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      neuerEintrag(id === 'new-allergy' ? 'allergie' : 'krankheit', id);
    });
  });

  memberForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('m-id').value;
    const payload = {
      name: document.getElementById('m-name').value,
      birthdate: document.getElementById('m-birthdate').value,
      shoe_size: document.getElementById('m-shoe').value,
      clothing_size: document.getElementById('m-clothing').value,
      trouser_size: document.getElementById('m-trouser').value,
      doctorIds: [...state.auswahl.doctorIds],
      conditionIds: [...state.auswahl.conditionIds],
      medications: sammleMedikation(),
    };
    if (!id) payload.color = colorForIndex(state.members.length);

    const { ok, data } = await json(id ? `/api/members/${id}` : '/api/members', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!ok) {
      memberSaveStatus.style.color = 'var(--danger)';
      memberSaveStatus.textContent = 'Bitte einen Namen eintragen.';
      return;
    }
    state.members = id ? state.members.map((m) => (m.id === data.id ? data : m)) : [...state.members, data];
    renderMembers();
    memberSaveStatus.style.color = 'var(--primary)';
    memberSaveStatus.textContent = 'Gespeichert.';
    setTimeout(() => {
      memberModal.hidden = true;
    }, 500);
  });

  deleteMemberBtn.addEventListener('click', async () => {
    const id = document.getElementById('m-id').value;
    if (!id || !confirm('Dieses Familienmitglied wirklich entfernen?')) return;
    await fetch(`/api/members/${id}`, { method: 'DELETE' });
    state.members = state.members.filter((m) => m.id !== Number(id));
    renderMembers();
    memberModal.hidden = true;
  });

  // ---------- Drucken ----------
  const printModal = document.getElementById('print-modal');
  const printChoices = document.getElementById('print-choices');

  document.getElementById('print-btn').addEventListener('click', () => {
    if (!state.members.length) {
      alert('Es ist noch niemand angelegt.');
      return;
    }
    printChoices.innerHTML = state.members
      .map(
        (m) => `<label class="check-item">
          <input type="checkbox" value="${m.id}" checked />
          <span class="avatar" style="background:${m.color}">${initials(m.name)}</span>
          <span>${escapeHtml(m.name)}</span>
        </label>`
      )
      .join('');
    closeAllModals();
    printModal.hidden = false;
  });

  document.getElementById('print-modal-close').addEventListener('click', () => {
    printModal.hidden = true;
  });
  printModal.addEventListener('click', (e) => {
    if (e.target === printModal) printModal.hidden = true;
  });
  document.getElementById('print-all-btn').addEventListener('click', () => {
    printChoices.querySelectorAll('input').forEach((c) => (c.checked = true));
  });

  document.getElementById('print-go-btn').addEventListener('click', () => {
    const ids = [...printChoices.querySelectorAll('input:checked')].map((c) => c.value);
    if (!ids.length) {
      alert('Bitte mindestens eine Person auswählen.');
      return;
    }
    window.open(`/drucken.html?ids=${ids.join(',')}`, '_blank');
  });

  // ---------- Konten ----------
  const accountModal = document.getElementById('account-modal');
  const accountForm = document.getElementById('account-form');
  const accountError = document.getElementById('account-error');
  const accountSuccess = document.getElementById('account-success');
  const accountList = document.getElementById('account-list');

  async function renderAccountList() {
    const { ok, data } = await json('/api/auth/users');
    if (!ok) return;
    accountList.innerHTML = data.users
      .map(
        (u) => `<li>
          <span class="avatar" style="background:${u.color || '#2F5D50'}">${initials(u.display_name)}</span>
          <span>${escapeHtml(u.display_name)}</span>
          <span class="uname">${escapeHtml(u.username)}</span>
        </li>`
      )
      .join('');
  }

  document.getElementById('add-account-btn').addEventListener('click', () => {
    accountError.hidden = true;
    accountSuccess.hidden = true;
    accountForm.reset();
    renderAccountList();
    closeAllModals();
    accountModal.hidden = false;
  });
  document.getElementById('account-modal-close').addEventListener('click', () => {
    accountModal.hidden = true;
  });
  accountModal.addEventListener('click', (e) => {
    if (e.target === accountModal) accountModal.hidden = true;
  });

  accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    accountError.hidden = true;
    accountSuccess.hidden = true;
    const username = document.getElementById('a-username').value;
    const { ok, data } = await json('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: document.getElementById('a-name').value,
        username,
        password: document.getElementById('a-password').value,
      }),
    });
    if (!ok) {
      accountError.textContent =
        data.error === 'benutzer_existiert'
          ? `"${username}" gibt es schon – siehe Liste oben. Zum Anmelden dieses Konto benutzen, oder einen anderen Namen wählen.`
          : data.message || 'Konto konnte nicht angelegt werden.';
      accountError.hidden = false;
      renderAccountList();
      return;
    }
    accountSuccess.textContent = `Konto für ${data.user.display_name} angelegt. Anmelden mit dem Benutzernamen "${data.user.username}".`;
    accountSuccess.hidden = false;
    accountForm.reset();
    renderAccountList();
  });

  // ---------- Start ----------
  async function ladeKatalog() {
    const { ok, data } = await json('/api/catalog');
    if (ok) state.catalog = data;
  }

  async function boot() {
    const res = await fetch('/api/auth/me');
    if (res.status === 401) {
      window.location.replace('/login.html');
      return;
    }
    const me = await res.json();
    state.me = me.user;
    document.getElementById('me-name').textContent = me.user.display_name;
    const avatar = document.getElementById('me-avatar');
    avatar.textContent = initials(me.user.display_name);
    avatar.style.background = me.user.color || '#2F5D50';

    const [members] = await Promise.all([
      fetch('/api/members').then((r) => r.json()),
      ladeKatalog(),
    ]);
    state.members = members;
    renderMembers();
  }

  boot();
})();
