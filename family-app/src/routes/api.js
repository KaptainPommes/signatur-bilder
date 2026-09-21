const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const MEMBER_FIELDS = ['name', 'birthdate', 'shoe_size', 'clothing_size', 'trouser_size', 'color'];

function text(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (typeof body[f] === 'string') out[f] = text(body[f]);
  }
  return out;
}

// ---------- Kataloge: einmal anlegen, überall auswählbar ----------

function alleAerzte() {
  return db.prepare('SELECT * FROM doctors ORDER BY name COLLATE NOCASE').all();
}

function alleEintraege(kind) {
  return db
    .prepare('SELECT * FROM conditions WHERE kind = ? ORDER BY name COLLATE NOCASE')
    .all(kind);
}

router.get('/catalog', (req, res) => {
  res.json({
    doctors: alleAerzte(),
    allergies: alleEintraege('allergie'),
    illnesses: alleEintraege('krankheit'),
    medicationNames: db
      .prepare('SELECT DISTINCT name FROM medications ORDER BY name COLLATE NOCASE')
      .all()
      .map((r) => r.name),
  });
});

function arztAusBody(body) {
  return {
    kind: text(body?.kind, 60),
    name: text(body?.name, 120),
    street: text(body?.street, 120),
    zip: text(body?.zip, 12),
    city: text(body?.city, 80),
    phone: text(body?.phone, 60),
    email: text(body?.email, 120),
  };
}

router.post('/doctors', (req, res) => {
  const d = arztAusBody(req.body);
  if (!d.name) return res.status(400).json({ error: 'name_erforderlich' });
  const vorhanden = db
    .prepare('SELECT * FROM doctors WHERE name = ? COLLATE NOCASE AND IFNULL(kind, \'\') = ? COLLATE NOCASE')
    .get(d.name, d.kind);
  if (vorhanden) return res.status(409).json({ error: 'existiert_schon', doctor: vorhanden });
  const info = db
    .prepare(
      'INSERT INTO doctors (kind, name, street, zip, city, phone, email) VALUES (@kind, @name, @street, @zip, @city, @phone, @email)'
    )
    .run(d);
  res.status(201).json(db.prepare('SELECT * FROM doctors WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/doctors/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM doctors WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'nicht_gefunden' });
  }
  const d = arztAusBody(req.body);
  if (!d.name) return res.status(400).json({ error: 'name_erforderlich' });
  // Die alte Freitext-Anschrift wird beim Speichern geleert: ihr Inhalt
  // steckt ab jetzt in den Einzelfeldern.
  db.prepare(
    `UPDATE doctors SET kind = @kind, name = @name, street = @street, zip = @zip,
     city = @city, phone = @phone, email = @email, address = '' WHERE id = @id`
  ).run({ ...d, id });
  res.json(db.prepare('SELECT * FROM doctors WHERE id = ?').get(id));
});

router.delete('/doctors/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM member_doctors WHERE doctor_id = ?').run(id);
  db.prepare('DELETE FROM doctors WHERE id = ?').run(id);
  res.json({ ok: true });
});

// kind steckt im Pfad: /conditions/allergie oder /conditions/krankheit
router.post('/conditions/:kind', (req, res) => {
  const kind = req.params.kind === 'krankheit' ? 'krankheit' : 'allergie';
  const name = text(req.body?.name, 120);
  if (!name) return res.status(400).json({ error: 'name_erforderlich' });
  const vorhanden = db
    .prepare('SELECT * FROM conditions WHERE kind = ? AND name = ? COLLATE NOCASE')
    .get(kind, name);
  if (vorhanden) return res.status(409).json({ error: 'existiert_schon', condition: vorhanden });
  const info = db.prepare('INSERT INTO conditions (name, kind) VALUES (?, ?)').run(name, kind);
  res
    .status(201)
    .json(db.prepare('SELECT * FROM conditions WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/conditions/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM member_conditions WHERE condition_id = ?').run(id);
  db.prepare('DELETE FROM conditions WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------- Personen ----------

function mitgliedMitAllem(id) {
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  if (!m) return null;
  return {
    id: m.id,
    name: m.name,
    birthdate: m.birthdate || '',
    shoe_size: m.shoe_size || '',
    clothing_size: m.clothing_size || '',
    trouser_size: m.trouser_size || '',
    color: m.color || '#2F5D50',
    doctors: db
      .prepare(
        `SELECT d.* FROM doctors d
         JOIN member_doctors md ON md.doctor_id = d.id
         WHERE md.member_id = ?
         ORDER BY d.name COLLATE NOCASE`
      )
      .all(id),
    allergies: db
      .prepare(
        `SELECT c.* FROM conditions c
         JOIN member_conditions mc ON mc.condition_id = c.id
         WHERE mc.member_id = ? AND c.kind = 'allergie'
         ORDER BY c.name COLLATE NOCASE`
      )
      .all(id),
    illnesses: db
      .prepare(
        `SELECT c.* FROM conditions c
         JOIN member_conditions mc ON mc.condition_id = c.id
         WHERE mc.member_id = ? AND c.kind = 'krankheit'
         ORDER BY c.name COLLATE NOCASE`
      )
      .all(id),
    medications: db
      .prepare('SELECT * FROM medications WHERE member_id = ? ORDER BY position, id')
      .all(id),
  };
}

function alleMitglieder() {
  return db
    .prepare('SELECT id FROM members ORDER BY id')
    .all()
    .map((r) => mitgliedMitAllem(r.id));
}

// Verknüpfungen und Medikation einer Person neu setzen.
function verknuepfungenSetzen(memberId, body) {
  if (Array.isArray(body.doctorIds)) {
    db.prepare('DELETE FROM member_doctors WHERE member_id = ?').run(memberId);
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO member_doctors (member_id, doctor_id) VALUES (?, ?)'
    );
    for (const raw of body.doctorIds.slice(0, 50)) {
      const id = Number(raw);
      if (Number.isInteger(id) && db.prepare('SELECT id FROM doctors WHERE id = ?').get(id)) {
        stmt.run(memberId, id);
      }
    }
  }

  if (Array.isArray(body.conditionIds)) {
    db.prepare('DELETE FROM member_conditions WHERE member_id = ?').run(memberId);
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO member_conditions (member_id, condition_id) VALUES (?, ?)'
    );
    for (const raw of body.conditionIds.slice(0, 100)) {
      const id = Number(raw);
      if (Number.isInteger(id) && db.prepare('SELECT id FROM conditions WHERE id = ?').get(id)) {
        stmt.run(memberId, id);
      }
    }
  }

  if (Array.isArray(body.medications)) {
    db.prepare('DELETE FROM medications WHERE member_id = ?').run(memberId);
    const stmt = db.prepare(
      'INSERT INTO medications (member_id, name, morning, noon, evening, position) VALUES (?, ?, ?, ?, ?, ?)'
    );
    body.medications.slice(0, 30).forEach((med, i) => {
      const name = text(med?.name, 120);
      if (!name) return;
      stmt.run(memberId, name, text(med?.morning, 30), text(med?.noon, 30), text(med?.evening, 30), i);
    });
  }
}

router.get('/members', (req, res) => {
  res.json(alleMitglieder());
});

router.post('/members', (req, res) => {
  const data = pick(req.body || {}, MEMBER_FIELDS);
  if (!data.name) return res.status(400).json({ error: 'name_erforderlich' });
  const felder = Object.keys(data);
  const info = db
    .prepare(
      `INSERT INTO members (${felder.join(', ')}) VALUES (${felder.map((f) => `@${f}`).join(', ')})`
    )
    .run(data);
  const id = Number(info.lastInsertRowid);
  verknuepfungenSetzen(id, req.body || {});
  res.status(201).json(mitgliedMitAllem(id));
});

router.put('/members/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM members WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'nicht_gefunden' });
  }
  const data = pick(req.body || {}, MEMBER_FIELDS);
  if ('name' in data && !data.name) return res.status(400).json({ error: 'name_erforderlich' });
  const felder = Object.keys(data);
  if (felder.length) {
    db.prepare(
      `UPDATE members SET ${felder.map((f) => `${f} = @${f}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`
    ).run({ ...data, id });
  }
  verknuepfungenSetzen(id, req.body || {});
  res.json(mitgliedMitAllem(id));
});

router.delete('/members/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM member_doctors WHERE member_id = ?').run(id);
  db.prepare('DELETE FROM member_conditions WHERE member_id = ?').run(id);
  db.prepare('DELETE FROM medications WHERE member_id = ?').run(id);
  db.prepare('DELETE FROM members WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
