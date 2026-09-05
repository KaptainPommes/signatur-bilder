const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const MEMBER_FIELDS = [
  'name',
  'relation',
  'birthdate',
  'blood_type',
  'allergies',
  'medications',
  'doctor_name',
  'doctor_phone',
  'insurance_company',
  'insurance_number',
  'id_doc_type',
  'id_doc_number',
  'id_doc_expiry',
  'school_or_kita',
  'notes',
  'color',
];

const HOUSEHOLD_FIELDS = [
  'address',
  'phone',
  'doctor_name',
  'doctor_phone',
  'emergency_name',
  'emergency_phone',
  'notes',
];

function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (typeof body[f] === 'string') out[f] = body[f].slice(0, 2000);
  }
  return out;
}

router.get('/household', (req, res) => {
  res.json(db.prepare('SELECT * FROM household WHERE id = 1').get());
});

router.put('/household', (req, res) => {
  const data = pick(req.body || {}, HOUSEHOLD_FIELDS);
  const setClause = Object.keys(data)
    .map((f) => `${f} = @${f}`)
    .join(', ');
  if (setClause) {
    db.prepare(`UPDATE household SET ${setClause}, updated_at = datetime('now') WHERE id = 1`).run(data);
  }
  res.json(db.prepare('SELECT * FROM household WHERE id = 1').get());
});

router.get('/members', (req, res) => {
  res.json(db.prepare('SELECT * FROM members ORDER BY id ASC').all());
});

router.post('/members', (req, res) => {
  const data = pick(req.body || {}, MEMBER_FIELDS);
  if (!data.name || !data.name.trim()) {
    return res.status(400).json({ error: 'name_erforderlich' });
  }
  const fields = Object.keys(data);
  const columns = fields.join(', ');
  const placeholders = fields.map((f) => `@${f}`).join(', ');
  const info = db
    .prepare(`INSERT INTO members (${columns}) VALUES (${placeholders})`)
    .run(data);
  res.status(201).json(db.prepare('SELECT * FROM members WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/members/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM members WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'nicht_gefunden' });
  const data = pick(req.body || {}, MEMBER_FIELDS);
  if ('name' in data && !data.name.trim()) {
    return res.status(400).json({ error: 'name_erforderlich' });
  }
  const fields = Object.keys(data);
  if (fields.length) {
    const setClause = fields.map((f) => `${f} = @${f}`).join(', ');
    db.prepare(`UPDATE members SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
      ...data,
      id,
    });
  }
  res.json(db.prepare('SELECT * FROM members WHERE id = ?').get(id));
});

router.delete('/members/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM members WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
