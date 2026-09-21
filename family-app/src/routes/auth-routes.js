const express = require('express');
const auth = require('../auth');

const router = express.Router();

const MAX_ACCOUNTS = 6; // reicht für Eltern + ggf. ältere Kinder, verhindert offene Registrierung

function validCredentials(username, password) {
  return (
    typeof username === 'string' &&
    username.trim().length >= 3 &&
    typeof password === 'string' &&
    password.length >= 8
  );
}

// Status: wird für den ersten Start gebraucht, um zu wissen ob schon Konten existieren.
router.get('/status', (req, res) => {
  res.json({ hasUsers: auth.countUsers() > 0 });
});

// Ersteinrichtung: nur erlaubt solange noch kein Konto existiert.
router.post('/setup', (req, res) => {
  if (auth.countUsers() > 0) {
    return res.status(403).json({ error: 'bereits_eingerichtet' });
  }
  const { username, password, displayName, color } = req.body || {};
  if (!validCredentials(username, password) || !displayName || !displayName.trim()) {
    return res.status(400).json({
      error: 'ungueltige_eingabe',
      message: 'Benutzername (min. 3 Zeichen), Anzeigename und Passwort (min. 8 Zeichen) werden benötigt.',
    });
  }
  const user = auth.createUser({ username, password, displayName, color });
  const session = auth.createSession(user.id);
  auth.setSessionCookie(res, session.token);
  res.json({ user });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const key = `${req.ip}:${(username || '').toLowerCase()}`;
  if (auth.isLocked(key)) {
    return res.status(429).json({
      error: 'zu_viele_versuche',
      message: 'Zu viele Fehlversuche. Bitte in ein paar Minuten erneut versuchen.',
    });
  }
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'ungueltige_eingabe' });
  }
  const user = auth.findUserByUsername(username.toLowerCase().trim());
  if (!user || !auth.verifyPassword(user, password)) {
    auth.registerFailedAttempt(key);
    return res.status(401).json({ error: 'login_fehlgeschlagen', message: 'Benutzername oder Passwort ist falsch.' });
  }
  auth.clearFailedAttempts(key);
  const session = auth.createSession(user.id);
  auth.setSessionCookie(res, session.token);
  res.json({
    user: { id: user.id, username: user.username, display_name: user.display_name, color: user.color },
  });
});

router.post('/logout', (req, res) => {
  const token = req.cookies ? req.cookies[auth.SESSION_COOKIE] : null;
  if (token) auth.destroySession(token);
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', auth.requireAuth, (req, res) => {
  res.json({ user: req.user, canAddAccount: auth.countUsers() < MAX_ACCOUNTS });
});

// Wer hat bereits einen Zugang? Damit sichtbar ist, welche Konten es gibt.
router.get('/users', auth.requireAuth, (req, res) => {
  res.json({ users: auth.listUsers(), canAddAccount: auth.countUsers() < MAX_ACCOUNTS });
});

// Weiteres Familienmitglied als Login hinzufügen (z.B. Partner/-in).
router.post('/users', auth.requireAuth, (req, res) => {
  if (auth.countUsers() >= MAX_ACCOUNTS) {
    return res.status(400).json({ error: 'limit_erreicht' });
  }
  const { username, password, displayName, color } = req.body || {};
  if (!validCredentials(username, password) || !displayName || !displayName.trim()) {
    return res.status(400).json({
      error: 'ungueltige_eingabe',
      message: 'Benutzername (min. 3 Zeichen), Anzeigename und Passwort (min. 8 Zeichen) werden benötigt.',
    });
  }
  if (auth.findUserByUsername(username.toLowerCase().trim())) {
    return res.status(409).json({ error: 'benutzer_existiert' });
  }
  const user = auth.createUser({ username, password, displayName, color });
  res.json({ user });
});

// Konto entfernen. Zwei Sperren: das eigene Konto nicht (sonst sperrt man
// sich mitten im Betrieb selbst aus) und nie das letzte verbliebene.
router.delete('/users/:id', auth.requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ungueltige_id' });
  if (id === req.user.id) {
    return res.status(400).json({
      error: 'eigenes_konto',
      message: 'Das eigene Konto lässt sich nicht entfernen.',
    });
  }
  if (auth.countUsers() <= 1) {
    return res.status(400).json({
      error: 'letztes_konto',
      message: 'Das letzte verbliebene Konto lässt sich nicht entfernen.',
    });
  }
  if (!auth.listUsers().some((u) => u.id === id)) {
    return res.status(404).json({ error: 'nicht_gefunden' });
  }
  auth.deleteUser(id);
  res.json({ ok: true });
});

module.exports = router;
