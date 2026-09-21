/* ==========================================================================
   store.js – Datenschicht
   --------------------------------------------------------------------------
   Kapselt saemtliche Lese-/Schreibzugriffe hinter einer schmalen API.
   Aktueller Adapter: localStorage (Daten bleiben auf dem jeweiligen Geraet).
   Fuer die spaetere Server-Anbindung wird nur `Store.adapter` ausgetauscht –
   die Oberflaeche in app.js bleibt unveraendert.
   ========================================================================== */

const Store = (() => {
  const KEY = 'familienakte.data.v1';
  const SCHEMA = 1;

  /** Leeres Dokument in der aktuellen Schema-Version. */
  function emptyDoc() {
    return { schema: SCHEMA, updatedAt: null, people: [] };
  }

  /** Leere Person mit allen Feldern – dient auch als Feldreferenz. */
  function emptyPerson() {
    return {
      id: newId(),
      name: '',
      birthdate: '',        // ISO: YYYY-MM-DD
      allergies: [],        // ["Penicillin", ...]
      conditions: [],       // Krankheiten
      medications: [],      // { name, morning, noon, evening, note }
      doctors: [],          // { name, field, street, zip, city, phone }
      sizes: { shoe: '', clothing: '', trousers: '' },
      notes: ''
    };
  }

  function newId() {
    if (self.crypto && typeof self.crypto.randomUUID === 'function') return self.crypto.randomUUID();
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* --- Normalisierung ---------------------------------------------------
     Alles, was aus localStorage oder einer Importdatei kommt, laeuft hier
     durch: fehlende Felder werden ergaenzt, Typen erzwungen. So kann die
     Oberflaeche ohne Defensiv-Checks arbeiten.                            */

  const str = v => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
  const list = v => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

  function normalizePerson(raw) {
    const base = emptyPerson();
    if (!raw || typeof raw !== 'object') return base;
    return {
      id: str(raw.id) || base.id,
      name: str(raw.name),
      birthdate: /^\d{4}-\d{2}-\d{2}$/.test(str(raw.birthdate)) ? str(raw.birthdate) : '',
      allergies: list(raw.allergies),
      conditions: list(raw.conditions),
      medications: Array.isArray(raw.medications)
        ? raw.medications.map(m => ({
            name: str(m && m.name),
            morning: str(m && m.morning),
            noon: str(m && m.noon),
            evening: str(m && m.evening),
            note: str(m && m.note)
          })).filter(m => m.name)
        : [],
      doctors: Array.isArray(raw.doctors)
        ? raw.doctors.map(d => ({
            name: str(d && d.name),
            field: str(d && d.field),
            street: str(d && d.street),
            zip: str(d && d.zip),
            city: str(d && d.city),
            phone: str(d && d.phone)
          })).filter(d => d.name || d.phone)
        : [],
      sizes: {
        shoe: str(raw.sizes && raw.sizes.shoe),
        clothing: str(raw.sizes && raw.sizes.clothing),
        trousers: str(raw.sizes && raw.sizes.trousers)
      },
      notes: str(raw.notes)
    };
  }

  function normalizeDoc(raw) {
    const doc = emptyDoc();
    if (!raw || typeof raw !== 'object') return doc;
    doc.updatedAt = str(raw.updatedAt) || null;
    doc.people = Array.isArray(raw.people) ? raw.people.map(normalizePerson) : [];
    return doc;
  }

  /* --- Adapter: localStorage -------------------------------------------- */

  const localAdapter = {
    name: 'local',
    async load() {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? normalizeDoc(JSON.parse(raw)) : emptyDoc();
      } catch (err) {
        console.warn('[store] Lesen fehlgeschlagen, starte leer:', err);
        return emptyDoc();
      }
    },
    async save(doc) {
      localStorage.setItem(KEY, JSON.stringify(doc));
      return doc;
    }
  };

  /* --- Oeffentliche API -------------------------------------------------- */

  let doc = emptyDoc();
  let loaded = false;
  const listeners = new Set();

  function emit() {
    listeners.forEach(fn => {
      try { fn(doc); } catch (err) { console.error('[store] Listener-Fehler:', err); }
    });
  }

  async function persist() {
    doc.updatedAt = new Date().toISOString();
    await api.adapter.save(doc);
    emit();
  }

  const api = {
    adapter: localAdapter,
    SCHEMA,
    emptyPerson,

    async init() {
      if (loaded) return doc;
      doc = await api.adapter.load();
      loaded = true;
      return doc;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Alle Personen, alphabetisch – Namenlose ans Ende. */
    people() {
      return doc.people.slice().sort((a, b) =>
        (a.name || '￿').localeCompare(b.name || '￿', 'de'));
    },

    person(id) {
      return doc.people.find(p => p.id === id) || null;
    },

    async upsert(person) {
      const clean = normalizePerson(person);
      const idx = doc.people.findIndex(p => p.id === clean.id);
      if (idx >= 0) doc.people[idx] = clean; else doc.people.push(clean);
      await persist();
      return clean;
    },

    async remove(id) {
      doc.people = doc.people.filter(p => p.id !== id);
      await persist();
    },

    /** Vollstaendiges Dokument als JSON-String – fuer die Sicherung. */
    exportJSON() {
      return JSON.stringify({ ...doc, exportedAt: new Date().toISOString() }, null, 2);
    },

    /**
     * Sicherung einlesen. `mode` = 'replace' ersetzt alles,
     * 'merge' fuegt nur unbekannte IDs hinzu.
     */
    async importJSON(text, mode = 'replace') {
      const incoming = normalizeDoc(JSON.parse(text));
      if (mode === 'merge') {
        const known = new Set(doc.people.map(p => p.id));
        incoming.people.forEach(p => { if (!known.has(p.id)) doc.people.push(p); });
      } else {
        doc.people = incoming.people;
      }
      await persist();
      return doc.people.length;
    },

    /** Beispielperson zum Ausprobieren der Oberflaeche. */
    async seedDemo() {
      const demo = normalizePerson({
        name: 'Beispiel Oma',
        birthdate: '1948-04-12',
        allergies: ['Penicillin', 'Nussöle'],
        conditions: ['Bluthochdruck', 'Diabetes Typ 2'],
        medications: [
          { name: 'Ramipril 5 mg', morning: '1 Tablette', noon: '', evening: '', note: 'nüchtern' },
          { name: 'Metformin 850 mg', morning: '1 Tablette', noon: '', evening: '1 Tablette', note: 'zum Essen' },
          { name: 'Vitamin D3', morning: '1 Tropfen', noon: '', evening: '', note: '' }
        ],
        doctors: [
          { name: 'Dr. med. Anna Berg', field: 'Hausärztin', street: 'Lindenweg 4', zip: '54290', city: 'Trier', phone: '+49 651 1234567' },
          { name: 'Dr. med. Paul Wenz', field: 'Kardiologe', street: 'Marktstraße 11', zip: '54290', city: 'Trier', phone: '+49 651 7654321' }
        ],
        sizes: { shoe: '38', clothing: '42', trousers: '40' },
        notes: 'Hörgerät rechts. Bei Terminen bitte abholen.'
      });
      doc.people.push(demo);
      await persist();
      return demo;
    }
  };

  return api;
})();
