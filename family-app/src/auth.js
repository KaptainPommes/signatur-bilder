const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SESSION_COOKIE = 'familienbuch_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage

const cookieSecure = process.env.COOKIE_SECURE === 'true';

function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function listUsers() {
  return db
    .prepare('SELECT id, username, display_name, color FROM users ORDER BY id ASC')
    .all();
}

function createUser({ username, password, displayName, color }) {
  const passwordHash = bcrypt.hashSync(password, 12);
  const info = db
    .prepare(
      'INSERT INTO users (username, password_hash, display_name, color) VALUES (?, ?, ?, ?)'
    )
    .run(username.toLowerCase().trim(), passwordHash, displayName.trim(), color || '#2F5D50');
  return db.prepare('SELECT id, username, display_name, color FROM users WHERE id = ?').get(
    info.lastInsertRowid
  );
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password_hash);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt
  );
  return { token, expiresAt };
}

function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function getUserByToken(token) {
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    destroySession(token);
    return null;
  }
  return db
    .prepare('SELECT id, username, display_name, color FROM users WHERE id = ?')
    .get(session.user_id);
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    maxAge: SESSION_DURATION_MS,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// Sehr einfache Rate-Begrenzung gegen Brute-Force auf den Login.
const failedAttempts = new Map(); // key -> { count, lockedUntil }
const MAX_ATTEMPTS = 8;
const LOCK_MS = 5 * 60 * 1000;

function isLocked(key) {
  const entry = failedAttempts.get(key);
  if (!entry) return false;
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) return true;
  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) {
    failedAttempts.delete(key);
  }
  return false;
}

function registerFailedAttempt(key) {
  const entry = failedAttempts.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCK_MS;
    entry.count = 0;
  }
  failedAttempts.set(key, entry);
}

function clearFailedAttempts(key) {
  failedAttempts.delete(key);
}

function requireAuth(req, res, next) {
  const token = req.cookies ? req.cookies[SESSION_COOKIE] : null;
  const user = getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'nicht_angemeldet' });
  }
  req.user = user;
  next();
}

module.exports = {
  SESSION_COOKIE,
  countUsers,
  findUserByUsername,
  listUsers,
  createUser,
  verifyPassword,
  createSession,
  destroySession,
  getUserByToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  isLocked,
  registerFailedAttempt,
  clearFailedAttempts,
};
