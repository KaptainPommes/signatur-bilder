/* Oberflaechentest gegen einen laufenden Testserver.
   Wird von tests/run.sh gestartet; braucht Playwright:
       npm install playwright && npx playwright install chromium          */

import { chromium, devices } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8910/';
const CODE = process.env.ADMIN_CODE || 'test-verwaltercode-0123456789abcdef';

let ok = 0, bad = 0;
const check = (label, cond, extra = '') => {
  if (cond) { ok++; console.log('  ok   ' + label); }
  else { bad++; console.log('  FAIL ' + label + ' ' + extra); }
};

const browser = await chromium.launch(
  process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}
);
const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'allow' });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Mein Rechner' : ''));

console.log('\n== Anmeldung ==');
await page.goto(BASE, { waitUntil: 'networkidle' });
check('Ohne Anmeldung gesperrt', (await page.locator('.card__body p').first().textContent()).includes('noch nicht eingerichtet'));

await page.goto(BASE + '#verwaltung=' + CODE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
check('Verwaltercode aus der Adresse entfernt', !page.url().includes('verwaltung'), page.url());
check('Übersicht erreicht', (await page.locator('#appbar-title').textContent()) === 'Familienbuch');
check('Leerzustand sichtbar', await page.locator('.empty strong').isVisible());

// Regressionsprobe: der iOS-Installationshinweis darf keinen Knopf verdecken.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
check('Banner verdeckt Knopf nicht', await page.evaluate(() => {
  const b = document.querySelector('.actions .btn');
  const r = b.getBoundingClientRect();
  return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b;
}));
await page.locator('#install-dismiss').click();

console.log('\n== Person anlegen ==');
await page.getByRole('button', { name: '＋ Person hinzufügen' }).click();
await page.waitForTimeout(300);
await page.fill('#f-name', 'Mia Sophie');
await page.fill('#f-birth', '2015-06-01');
await page.selectOption('#f-shoe', '35');
await page.selectOption('#f-cloth', '146/152');
await page.fill('#f-trouser', '128 slim');
check('Schuhgrößen 35–50', (await page.locator('#f-shoe option').allTextContents()).slice(1).join() === Array.from({length:16},(_,i)=>35+i).join());
check('Kleidergrößen laut Liste', (await page.locator('#f-cloth option').nth(5).textContent()) === 'S');

// Allergien + Krankheiten über die Wiederverwendungs-Kacheln
const addLabel = async (cardName, value) => {
  const card = page.locator('.card', { has: page.locator('.card__head', { hasText: cardName }) });
  await card.locator('.addline input').fill(value);
  await card.getByRole('button', { name: 'Anlegen' }).click();
  await page.waitForTimeout(250);
};
await addLabel('Allergien', 'Penicillin');
await addLabel('Allergien', 'Äpfel');
await addLabel('Krankheiten', 'Asthma');
const allergyCard = page.locator('.card', { has: page.locator('.card__head', { hasText: 'Allergien' }) });
check('Allergie angelegt und ausgewählt', await allergyCard.locator('.pick[aria-pressed="true"]').count() === 2);

await addLabel('Allergien', 'penicillin');
await page.waitForTimeout(250);
check('Doppelte Allergie erzeugt keinen zweiten Eintrag',
      await allergyCard.locator('.pick').count() === 2,
      await allergyCard.locator('.pick').allTextContents());

// Arzt über den Dialog
await page.getByRole('button', { name: '＋ Neuer Arzt' }).click();
await page.waitForTimeout(300);
await page.fill('#d-kind', 'Kinderarzt');
await page.fill('#d-name', 'Dr. med. Anna Berg');
await page.fill('#d-street', 'Lindenweg 4');
await page.fill('#d-zip', '54290');
await page.fill('#d-city', 'Trier');
await page.fill('#d-phone', '0651 1234567');
await page.getByRole('dialog').getByRole('button', { name: 'Anlegen' }).click();
await page.waitForTimeout(400);
check('Arzt angelegt und ausgewählt', await page.locator('.pick--doctor[aria-pressed="true"]').count() === 1);

// Medikation
await page.getByRole('button', { name: '＋ Medikament hinzufügen' }).click();
await page.waitForTimeout(200);
await page.fill('#med-name-0', 'Salbutamol');
await page.fill('#med-strength-0', '100 µg');
await page.fill('#med-e-0', '1 Hub');

await page.getByRole('button', { name: 'Speichern' }).click();
await page.waitForTimeout(700);

console.log('\n== Leseansicht ==');
check('Nach Speichern in der Leseansicht', /#\/p\/\d+$/.test(page.url()), page.url());
check('Name in der Kopfleiste', (await page.locator('#appbar-title').textContent()) === 'Mia Sophie');
const heads = (await page.locator('.card__head').allTextContents()).map(h => h.trim());
check('Allergien stehen ganz oben', heads[0] === 'Allergien', heads);
check('Alle Abschnitte da', ['Stammdaten','Krankheiten','Medikation','Ärzte'].every(h => heads.includes(h)), heads);
check('Überschriften optisch in Versalien', await page.evaluate(() =>
  getComputedStyle(document.querySelector('.card__head')).textTransform === 'uppercase'));
check('Alter berechnet', (await page.locator('.rows dd').first().textContent()).includes('Jahre'));
check('Allergie rot hervorgehoben', await page.locator('.chip--danger').count() === 2);
check('Medikament mit Abendmenge', (await page.locator('.med__slot').nth(2).textContent()).includes('1 Hub'));
check('Telefon als Wählen-Link', (await page.locator('a[href^="tel:"]').getAttribute('href')) === 'tel:06511234567');
if (process.env.SHOTS) await page.screenshot({ path: 'shot-lese.png', fullPage: true });

console.log('\n== Wiederverwendung bei zweiter Person ==');
await page.locator('#btn-back').click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: '＋ Person hinzufügen' }).click();
await page.waitForTimeout(300);
check('Vorhandene Allergien stehen bereit', await allergyCard.locator('.pick').count() === 2);
check('Vorhandener Arzt steht bereit', await page.locator('.pick--doctor').count() === 1);
check('Nichts vorausgewählt', await page.locator('.pick[aria-pressed="true"]').count() === 0);
await page.fill('#f-name', 'Anton');
await page.locator('.pick--doctor button').nth(1).click();
await page.getByRole('button', { name: 'Speichern' }).click();
await page.waitForTimeout(700);
check('Zweite Person gespeichert', (await page.locator('#appbar-title').textContent()) === 'Anton');

await page.locator('#btn-back').click();
await page.waitForTimeout(400);
check('Kachelraster zeigt 2 Personen', await page.locator('.people__tile').count() === 2);
const names = await page.locator('.people__name').allTextContents();
check('Reihenfolge der Anlage', names.join() === 'Mia Sophie,Anton', names);
check('Kachel zeigt Anzahlen', (await page.locator('.people__counts').first().textContent()).includes('2'));
if (process.env.SHOTS) await page.screenshot({ path: 'shot-uebersicht.png' });

console.log('\n== Drucken ==');
await page.getByRole('button', { name: 'Daten drucken' }).click();
await page.waitForTimeout(300);
check('Alle vorausgewählt', await page.locator('.check input:checked').count() === 3);
await page.locator('.check').nth(2).click();
check('"Alle auswählen" folgt der Abwahl', await page.locator('.check input').first().isChecked() === false);

const printPage = await ctx.newPage();
await printPage.goto(BASE + 'druck.html?ids=1,2', { waitUntil: 'networkidle' });
await printPage.waitForTimeout(500);
check('Druckblatt zeigt beide Personen', await printPage.locator('.person').count() === 2);
check('Stand-Datum vorhanden', (await printPage.locator('.sheet__stand').textContent()).startsWith('Stand: '));
check('Medikationstabelle im Druck', await printPage.locator('table th').count() === 5);
// Regressionsprobe: eine Person ohne Angaben darf keine blanken Ziffern erzeugen.
const antonText = await printPage.locator('.person').nth(1).innerText();
check('Person ohne Angaben zeigt keine blanken Ziffern', !/^\s*0+\s*$/m.test(antonText),
      JSON.stringify(antonText));
check('Person nicht umbrechbar', await printPage.evaluate(() =>
  getComputedStyle(document.querySelector('.person')).breakInside === 'avoid'));
await printPage.emulateMedia({ media: 'print' });
if (process.env.SHOTS) await printPage.screenshot({ path: 'shot-druck.png', fullPage: true });
check('Leiste im Druck ausgeblendet', await printPage.evaluate(() =>
  getComputedStyle(document.querySelector('.bar')).display === 'none'));
await printPage.close();

console.log('\n== Druckseite verlangt Anmeldung ==');
const anon = await browser.newContext({ ...devices['iPhone 13'] });
const anonPage = await anon.newPage();
await anonPage.goto(BASE + 'druck.html?ids=1', { waitUntil: 'networkidle' });
await anonPage.waitForTimeout(400);
check('Ohne Anmeldung kein Ausdruck',
      (await anonPage.locator('.hinweis').textContent()).includes('Anmeldung'));
await anon.close();

console.log('\n== Zugänge verwalten ==');
await page.goto(BASE + '#/zugaenge', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
check('Geräteliste sichtbar', await page.locator('.listrow').count() >= 1);
await page.getByRole('button', { name: '＋ Einladungslink erzeugen' }).click();
await page.waitForTimeout(300);
await page.fill('#i-label', 'Oma Erna / iPhone');
await page.getByRole('dialog').getByRole('button', { name: 'Link erzeugen' }).click();
await page.waitForTimeout(500);
const link = await page.locator('.linkbox').inputValue();
check('Einladungslink erzeugt', link.includes('#einladung='), link);
await page.getByRole('button', { name: 'Fertig' }).click();
await page.waitForTimeout(500);

const oma = await browser.newContext({ ...devices['iPhone 13'] });
const omaPage = await oma.newPage();
omaPage.on('dialog', d => d.accept(''));
await omaPage.goto(link, { waitUntil: 'networkidle' });
await omaPage.waitForTimeout(800);
check('Oma ist mit einem Klick drin', await omaPage.locator('.people__tile').count() === 2);
check('Token aus Omas Adresszeile entfernt', !omaPage.url().includes('einladung'), omaPage.url());
check('Oma sieht keine Zugangsverwaltung', !(await omaPage.evaluate(async () => {
  const r = await fetch('api/devices', { credentials: 'same-origin' });
  return r.ok;
})));

const omaAgain = await browser.newContext({ ...devices['iPhone 13'] });
const p2 = await omaAgain.newPage();
await p2.goto(link, { waitUntil: 'networkidle' });
await p2.waitForTimeout(600);
check('Link ist verbraucht', (await p2.locator('.card__body p').first().textContent()).includes('ungueltig') ||
      (await p2.locator('.card__body p').first().textContent()).includes('benutzt'));
await omaAgain.close();

console.log('\n== Offline ==');
await omaPage.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
await omaPage.waitForTimeout(500);
await oma.setOffline(true);
await omaPage.reload({ waitUntil: 'load' });
await omaPage.waitForTimeout(1200);
check('Offline: Daten bleiben sichtbar', await omaPage.locator('.people__tile').count() === 2);
check('Offline-Hinweis sichtbar', await omaPage.locator('#offline-bar').isVisible());
if (process.env.SHOTS) await omaPage.screenshot({ path: 'shot-offline.png' });
await oma.setOffline(false);

console.log('\n== Zugang entziehen räumt den Zwischenspeicher ==');
await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.goto(BASE + '#/zugaenge', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
check('Neues Gerät erscheint in der Liste',
      await page.locator('.listrow', { hasText: 'Oma Erna' }).count() === 1);
const revoke = page.locator('.listrow', { hasText: 'Oma Erna' }).getByRole('button', { name: 'Entziehen' });
await revoke.click();
await page.waitForTimeout(700);
await omaPage.reload({ waitUntil: 'load' });
await omaPage.waitForTimeout(900);
check('Ausgesperrtes Gerät zeigt keine Daten mehr', await omaPage.locator('.people__tile').count() === 0);
await oma.setOffline(true);
await omaPage.reload({ waitUntil: 'load' });
await omaPage.waitForTimeout(900);
check('Auch offline keine Daten mehr', await omaPage.locator('.people__tile').count() === 0);
await oma.close();

console.log('\n== Farbschema ==');
await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.locator('#btn-theme').click();
check('Hell gewählt', await page.evaluate(() => document.documentElement.dataset.theme) === 'light');
await page.locator('#btn-theme').click();
check('Dunkel gewählt', await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
check('Wahl wird gemerkt', await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');
if (process.env.SHOTS) await page.screenshot({ path: 'shot-dunkel.png' });

console.log('\n== Person entfernen ==');
await page.locator('.people__tile').first().click();
await page.waitForTimeout(400);
await page.locator('#btn-menu').click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: 'Bearbeiten' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Person entfernen' }).click();
await page.waitForTimeout(800);
check('Person entfernt', await page.locator('.people__tile').count() === 1);
await page.getByRole('button', { name: '＋ Person hinzufügen' }).click();
await page.waitForTimeout(400);
check('Allergien bleiben in der gemeinsamen Liste', await allergyCard.locator('.pick').count() === 2);
check('Arzt bleibt in der gemeinsamen Liste', await page.locator('.pick--doctor').count() === 1);

console.log('\nFehler im Log: ' + (errors.length ? JSON.stringify(errors, null, 1) : 'keine'));
console.log(`\n${ok} bestanden, ${bad} fehlgeschlagen`);
await browser.close();
process.exit(bad || errors.length ? 1 : 0);
