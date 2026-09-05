const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'family.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#2F5D50',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS household (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    address TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    doctor_name TEXT DEFAULT '',
    doctor_phone TEXT DEFAULT '',
    emergency_name TEXT DEFAULT '',
    emergency_phone TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    relation TEXT NOT NULL DEFAULT '',
    birthdate TEXT DEFAULT '',
    blood_type TEXT DEFAULT '',
    allergies TEXT DEFAULT '',
    medications TEXT DEFAULT '',
    doctor_name TEXT DEFAULT '',
    doctor_phone TEXT DEFAULT '',
    insurance_company TEXT DEFAULT '',
    insurance_number TEXT DEFAULT '',
    id_doc_type TEXT DEFAULT '',
    id_doc_number TEXT DEFAULT '',
    id_doc_expiry TEXT DEFAULT '',
    school_or_kita TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    color TEXT NOT NULL DEFAULT '#2F5D50',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`INSERT OR IGNORE INTO household (id) VALUES (1)`);

module.exports = db;
