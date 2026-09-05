const fs = require('fs');
const path = require('path');

// Sehr kleiner .env-Loader, damit kein zusätzliches Paket nötig ist.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

if (!process.env.SESSION_SECRET) {
  console.warn(
    'WARNUNG: SESSION_SECRET ist nicht gesetzt. Bitte .env aus .env.example anlegen und einen zufälligen Wert eintragen.'
  );
}

const express = require('express');
const cookieParser = require('cookie-parser');
const authRoutes = require('./src/routes/auth-routes');
const apiRoutes = require('./src/routes/api');
const auth = require('./src/auth');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

app.get('/', (req, res) => {
  if (auth.countUsers() === 0) return res.redirect('/setup.html');
  const token = req.cookies ? req.cookies[auth.SESSION_COOKIE] : null;
  if (!auth.getUserByToken(token)) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server_fehler' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Familienbuch läuft auf http://localhost:${PORT}`);
});
