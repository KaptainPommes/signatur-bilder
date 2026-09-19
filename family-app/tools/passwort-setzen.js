#!/usr/bin/env node
//
// Passwort eines Kontos neu setzen – für den Fall, dass es vergessen wurde.
//
// Aufruf auf dem Server:
//   sudo node /opt/familienbuch/family-app/tools/passwort-setzen.js julia
//
// Ohne Benutzernamen werden die vorhandenen Konten aufgelistet.
//
const bcrypt = require('bcryptjs');
const db = require('../src/db');

const stdin = process.stdin;

// Alles, was schon eingetippt wurde, aber noch keiner Frage zugeordnet ist.
// Ohne diesen Puffer geht bei eingefügtem Text die zweite Eingabe verloren.
let puffer = '';
let wartenderResolver = null;

function zeileAusPuffer() {
  const ende = puffer.search(/[\r\n]/);
  if (ende === -1) return null;
  const zeile = puffer.slice(0, ende);
  let weiter = ende + 1;
  if (puffer[ende] === '\r' && puffer[weiter] === '\n') weiter += 1;
  puffer = puffer.slice(weiter);
  return zeile;
}

function pruefePuffer() {
  if (!wartenderResolver) return;
  const zeile = zeileAusPuffer();
  if (zeile === null) return;
  const resolver = wartenderResolver;
  wartenderResolver = null;
  process.stdout.write('\n');
  resolver(zeile);
}

function eingabeBeenden() {
  if (stdin.isTTY) stdin.setRawMode(false);
  stdin.pause();
}

function abbrechen() {
  eingabeBeenden();
  process.stdout.write('\nAbgebrochen. Nichts geändert.\n');
  process.exit(1);
}

function starteEingabe() {
  stdin.setEncoding('utf8');
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.on('data', (stueck) => {
    for (const zeichen of stueck) {
      if (zeichen === '\u0003') return abbrechen(); // Strg+C
      if (zeichen === '\u007f' || zeichen === '\b') {
        puffer = puffer.slice(0, -1);
      } else {
        puffer += zeichen;
      }
    }
    pruefePuffer();
  });
  stdin.on('end', () => {
    if (wartenderResolver) abbrechen();
  });
}

// Eingabe ohne sichtbare Zeichen, damit das Passwort nicht auf dem Schirm steht.
function frage(text) {
  process.stdout.write(text);
  return new Promise((resolve) => {
    wartenderResolver = resolve;
    pruefePuffer(); // vielleicht liegt die Antwort schon im Puffer
  });
}

function konten() {
  return db.prepare('SELECT id, username, display_name FROM users ORDER BY id').all();
}

function zeigeKonten() {
  console.log('\nVorhandene Konten:');
  for (const k of konten()) {
    console.log(`  ${k.username}  (${k.display_name})`);
  }
  console.log('');
}

(async () => {
  const username = (process.argv[2] || '').toLowerCase().trim();

  if (!username) {
    console.log('Aufruf: sudo node tools/passwort-setzen.js <benutzername>');
    zeigeKonten();
    process.exit(1);
  }

  const user = db
    .prepare('SELECT id, username, display_name FROM users WHERE username = ?')
    .get(username);
  if (!user) {
    console.error(`Es gibt kein Konto mit dem Benutzernamen "${username}".`);
    zeigeKonten();
    process.exit(1);
  }

  starteEingabe();
  console.log(`Neues Passwort für ${user.display_name} (Benutzername: ${user.username})`);

  const pw1 = await frage('Neues Passwort (mind. 8 Zeichen): ');
  if (pw1.length < 8) {
    eingabeBeenden();
    console.error('Zu kurz – mindestens 8 Zeichen. Nichts geändert.');
    process.exit(1);
  }

  const pw2 = await frage('Zur Kontrolle nochmal: ');
  eingabeBeenden();

  if (pw1 !== pw2) {
    console.error('Die beiden Eingaben stimmen nicht überein. Nichts geändert.');
    process.exit(1);
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(pw1, 12), user.id);
  // Bestehende Anmeldungen dieses Kontos beenden – sonst bliebe ein altes
  // Gerät weiter eingeloggt.
  const weg = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

  console.log(`\nPasswort für "${user.username}" geändert.`);
  if (weg.changes > 0) {
    console.log(`${weg.changes} bestehende Anmeldung(en) beendet – bitte neu anmelden.`);
  }
})();
