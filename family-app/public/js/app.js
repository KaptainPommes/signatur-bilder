(function () {
  const state = { members: [], household: null, me: null };

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

  // ---------- Theme ----------
  const themeToggle = document.getElementById('theme-toggle');
  function applyStoredTheme() {
    try {
      const stored = localStorage.getItem('familienbuch-theme');
      if (stored) document.documentElement.setAttribute('data-theme', stored);
    } catch (e) {
      /* localStorage kann in manchen Kontexten fehlen */
    }
  }
  applyStoredTheme();
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('familienbuch-theme', next);
    } catch (e) {
      /* ignorieren */
    }
  });

  // ---------- Auth guard ----------
  async function loadMe() {
    const res = await fetch('/api/auth/me');
    if (res.status === 401) {
      window.location.replace('/login.html');
      return null;
    }
    const data = await res.json();
    return data;
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login.html');
  });

  // ---------- Household ----------
  const householdModal = document.getElementById('household-modal');
  const householdForm = document.getElementById('household-form');
  const householdSaveStatus = document.getElementById('household-save-status');

  function renderHousehold() {
    const h = state.household || {};
    document.querySelectorAll('#household-view [data-field]').forEach((el) => {
      const key = el.dataset.field;
      const value = h[key] || '';
      el.textContent = value;
      el.classList.toggle('is-empty', !value);
    });
  }

  function openHouseholdModal() {
    const h = state.household || {};
    householdForm.querySelector('#h-address').value = h.address || '';
    householdForm.querySelector('#h-phone').value = h.phone || '';
    householdForm.querySelector('#h-doctor').value = h.doctor_name || '';
    householdForm.querySelector('#h-doctor-phone').value = h.doctor_phone || '';
    householdForm.querySelector('#h-emergency').value = h.emergency_name || '';
    householdForm.querySelector('#h-emergency-phone').value = h.emergency_phone || '';
    householdForm.querySelector('#h-notes').value = h.notes || '';
    householdSaveStatus.textContent = '';
    householdModal.hidden = false;
  }

  document.getElementById('edit-household-btn').addEventListener('click', openHouseholdModal);
  document.getElementById('household-modal-close').addEventListener('click', () => {
    householdModal.hidden = true;
  });
  householdModal.addEventListener('click', (e) => {
    if (e.target === householdModal) householdModal.hidden = true;
  });

  householdForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      address: householdForm.querySelector('#h-address').value,
      phone: householdForm.querySelector('#h-phone').value,
      doctor_name: householdForm.querySelector('#h-doctor').value,
      doctor_phone: householdForm.querySelector('#h-doctor-phone').value,
      emergency_name: householdForm.querySelector('#h-emergency').value,
      emergency_phone: householdForm.querySelector('#h-emergency-phone').value,
      notes: householdForm.querySelector('#h-notes').value,
    };
    const res = await fetch('/api/household', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    state.household = await res.json();
    renderHousehold();
    householdSaveStatus.textContent = 'Gespeichert.';
    setTimeout(() => {
      householdModal.hidden = true;
    }, 500);
  });

  // ---------- Members: grid ----------
  const memberGrid = document.getElementById('member-grid');
  const addMemberBtn = document.getElementById('add-member-btn');

  function memberCardHtml(m, idx) {
    const color = m.color || colorForIndex(idx);
    const badges = [];
    if (m.blood_type) badges.push(`<span class="badge mono">${escapeHtml(m.blood_type)}</span>`);
    if (m.allergies) badges.push(`<span class="badge badge-danger">⚠ Allergie</span>`);
    if (m.birthdate) badges.push(`<span class="badge mono">${formatDate(m.birthdate)}</span>`);
    return `
      <button class="member-card" data-id="${m.id}">
        <div class="member-card-top">
          <span class="avatar" style="background:${color}">${initials(m.name)}</span>
          <div>
            <div class="name">${escapeHtml(m.name)}</div>
            <div class="relation">${escapeHtml(m.relation || '')}</div>
          </div>
        </div>
        <div class="badge-row">${badges.join('')}</div>
      </button>
    `;
  }

  function renderMembers() {
    const cards = state.members.map((m, i) => memberCardHtml(m, i)).join('');
    memberGrid.innerHTML = cards;
    memberGrid.appendChild(addMemberBtn);
    memberGrid.querySelectorAll('.member-card').forEach((btn) => {
      btn.addEventListener('click', () => openMemberModal(Number(btn.dataset.id)));
    });
  }

  // ---------- Members: modal ----------
  const memberModal = document.getElementById('member-modal');
  const memberForm = document.getElementById('member-form');
  const memberSaveStatus = document.getElementById('member-save-status');
  const deleteMemberBtn = document.getElementById('delete-member-btn');
  const memberModalTitle = document.getElementById('member-modal-title');
  const memberModalSubtitle = document.getElementById('member-modal-subtitle');

  const MEMBER_FIELD_MAP = {
    name: '#m-name',
    relation: '#m-relation',
    birthdate: '#m-birthdate',
    school_or_kita: '#m-school',
    blood_type: '#m-blood',
    doctor_name: '#m-doctor',
    doctor_phone: '#m-doctor-phone',
    allergies: '#m-allergies',
    medications: '#m-medications',
    id_doc_type: '#m-doc-type',
    id_doc_number: '#m-doc-number',
    id_doc_expiry: '#m-doc-expiry',
    insurance_company: '#m-insurance',
    insurance_number: '#m-insurance-number',
    notes: '#m-notes',
  };

  function fillMemberForm(m) {
    document.getElementById('m-id').value = m.id || '';
    Object.entries(MEMBER_FIELD_MAP).forEach(([key, sel]) => {
      memberForm.querySelector(sel).value = m[key] || '';
    });
  }

  function openMemberModal(id) {
    const m = id ? state.members.find((x) => x.id === id) : {};
    fillMemberForm(m || {});
    memberModalTitle.textContent = m && m.id ? m.name : 'Neues Familienmitglied';
    memberModalSubtitle.textContent = m && m.id ? m.relation || '' : 'Wird gespeichert, sobald ihr auf "Speichern" klickt.';
    deleteMemberBtn.hidden = !(m && m.id);
    memberSaveStatus.textContent = '';
    switchTab('basis');
    memberModal.hidden = false;
  }

  document.getElementById('member-modal-close').addEventListener('click', () => {
    memberModal.hidden = true;
  });
  memberModal.addEventListener('click', (e) => {
    if (e.target === memberModal) memberModal.hidden = true;
  });
  addMemberBtn.addEventListener('click', () => openMemberModal(null));

  function switchTab(tab) {
    memberModal.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    memberModal.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab));
  }
  memberModal.querySelectorAll('.tab-btn').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  memberForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('m-id').value;
    const payload = {};
    Object.entries(MEMBER_FIELD_MAP).forEach(([key, sel]) => {
      payload[key] = memberForm.querySelector(sel).value;
    });
    if (!id) {
      payload.color = colorForIndex(state.members.length);
    }
    const url = id ? `/api/members/${id}` : '/api/members';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      memberSaveStatus.textContent = 'Bitte Namen prüfen.';
      memberSaveStatus.style.color = 'var(--danger)';
      return;
    }
    const saved = await res.json();
    if (id) {
      state.members = state.members.map((m) => (m.id === saved.id ? saved : m));
    } else {
      state.members.push(saved);
    }
    renderMembers();
    memberSaveStatus.style.color = 'var(--primary)';
    memberSaveStatus.textContent = 'Gespeichert.';
    document.getElementById('m-id').value = saved.id;
    deleteMemberBtn.hidden = false;
    memberModalTitle.textContent = saved.name;
    setTimeout(() => {
      memberModal.hidden = true;
    }, 500);
  });

  deleteMemberBtn.addEventListener('click', async () => {
    const id = document.getElementById('m-id').value;
    if (!id) return;
    if (!confirm('Dieses Familienmitglied wirklich entfernen?')) return;
    await fetch(`/api/members/${id}`, { method: 'DELETE' });
    state.members = state.members.filter((m) => m.id !== Number(id));
    renderMembers();
    memberModal.hidden = true;
  });

  // ---------- Account (add login) ----------
  const accountModal = document.getElementById('account-modal');
  const accountForm = document.getElementById('account-form');
  const accountError = document.getElementById('account-error');

  document.getElementById('add-account-btn').addEventListener('click', () => {
    accountError.hidden = true;
    accountForm.reset();
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
    const payload = {
      displayName: document.getElementById('a-name').value,
      username: document.getElementById('a-username').value,
      password: document.getElementById('a-password').value,
    };
    const res = await fetch('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      accountError.textContent =
        data.error === 'benutzer_existiert' ? 'Dieser Benutzername ist schon vergeben.' : data.message || 'Konto konnte nicht angelegt werden.';
      accountError.hidden = false;
      return;
    }
    accountModal.hidden = true;
  });

  // ---------- Boot ----------
  async function boot() {
    const me = await loadMe();
    if (!me) return;
    state.me = me.user;
    document.getElementById('me-name').textContent = me.user.display_name;
    const avatar = document.getElementById('me-avatar');
    avatar.textContent = initials(me.user.display_name);
    avatar.style.background = me.user.color || '#2F5D50';

    const [household, members] = await Promise.all([
      fetch('/api/household').then((r) => r.json()),
      fetch('/api/members').then((r) => r.json()),
    ]);
    state.household = household;
    state.members = members;
    renderHousehold();
    renderMembers();
  }

  boot();
})();
