# Familienbuch

Eine private Web-App, in der ihr zu zweit wichtige Familiendaten pflegt: Kontaktdaten,
Gesundheitsinfos (Allergien, Blutgruppe, Ärzte), Dokumente (Ausweis, Versicherung) und
Notizen – für euch und eure Kinder. Läuft auf einem eigenen kleinen Server, damit ihr
von mehreren Geräten aus mit Login darauf zugreifen könnt.

## Was die App kann

- Login für mehrere Konten (z. B. eins für jeden Elternteil)
- Ein Bereich "Zuhause & Notfall" (Adresse, Hausarzt, Notfallkontakt)
- Eine Karte pro Familienmitglied mit den Reitern Basis / Gesundheit / Dokumente / Notizen
- Alle Daten liegen in einer lokalen SQLite-Datei (`data/family.db`) – nichts wird an
  Dritte geschickt

## Voraussetzungen

- Node.js **22.5 oder neuer** (nutzt das eingebaute `node:sqlite`, keine externe Datenbank nötig)

## Installation & erster Start

```bash
cd family-app
npm install
cp .env.example .env
```

Öffnet `.env` und setzt `SESSION_SECRET` auf einen zufälligen Wert, z. B. erzeugt mit:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Dann starten:

```bash
npm start
```

Die App läuft jetzt auf `http://localhost:3000`. Beim ersten Aufruf werdet ihr zur
Ersteinrichtung geleitet und legt euer erstes Konto an. Ein zweites Konto (für
Partner/-in) könnt ihr danach direkt oben rechts in der App über "Konto hinzufügen"
anlegen.

## Von mehreren Geräten aus nutzen

Die App muss dauerhaft irgendwo laufen, damit ihr von Handy und PC darauf zugreifen
könnt – lokal auf eurem Rechner reicht dafür nicht. Optionen:

- **Zuhause auf einem Raspberry Pi / NAS**, erreichbar über euer Heimnetz (z. B. per
  Tailscale/WireGuard, wenn ihr auch unterwegs zugreifen wollt)
- **Ein kleiner Cloud-Server** (z. B. Fly.io, Render, ein günstiger VPS) – dann bitte
  unbedingt `COOKIE_SECURE=true` in `.env` setzen und die App nur über HTTPS
  erreichbar machen

Da hier persönliche Familiendaten gespeichert werden, sollte die App **nicht ohne
HTTPS öffentlich im Internet** erreichbar sein.

## Backup

Alle Daten liegen in einer einzigen Datei: `data/family.db`. Regelmäßig sichern
(z. B. Kopie auf einen USB-Stick oder in einen privaten Cloud-Speicher) genügt als
Backup.

## Projektstruktur

```
family-app/
  server.js            Einstiegspunkt
  src/db.js             SQLite-Schema
  src/auth.js            Login/Sessions
  src/routes/            API-Endpunkte
  public/                Frontend (HTML/CSS/JS, kein Build-Schritt nötig)
```
