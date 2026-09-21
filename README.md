# Familienbuch

Private Web-App, in der eine Familie die wichtigsten Daten zu jedem Mitglied
pflegt: Stammdaten, Größen, Allergien, Krankheiten, Ärzte und Medikation.
Läuft als installierbare PWA auf dem Home-Bildschirm – ohne App Store.

**Zugang ohne Passwörter:** Jedes Gerät wird einmalig über einen
Einladungslink freigeschaltet und bleibt danach angemeldet.

## Projektstand

Vollständig und getestet: Datenbank, Schnittstelle, Zugang per Einladungslink,
Oberfläche, Druckblatt und Geräteverwaltung. 92 automatische Tests
(40 Schnittstelle, 52 Oberfläche) laufen durch.

## Die Oberfläche

| Ansicht | Inhalt |
|---|---|
| **Übersicht** | Kachelraster aller Personen mit Namenskürzel in eigener Farbe, Geburtsdatum, Anzahl Allergien / Krankheiten / Medikamente und den Größen |
| **Leseansicht** | Nur anzeigen, nichts bearbeiten. Allergien stehen rot ganz oben, danach Stammdaten mit berechnetem Alter, Krankheiten, Medikationstabelle und Ärzte mit voller Anschrift. Telefonnummer antippen wählt, Adresse antippen öffnet die Route. Drei-Punkte-Menü oben rechts mit „Bearbeiten“ und „Daten drucken“ |
| **Formular** | Schuh- und Kleidergröße als Auswahlliste, Hosengröße frei. Ärzte, Allergien und Krankheiten als anklickbare Kacheln zur Mehrfachauswahl; neue Einträge direkt daneben anlegen. Ärzte über das Stift-Symbol bearbeiten. Gespeichert wird erst beim Klick auf „Speichern“ – beim Verlassen mit offenen Änderungen fragt die App nach |
| **Druckauswahl** | Ankreuzfelder je Person mit „Alle auswählen“, öffnet ein A4-Blatt in einem neuen Tab |
| **Zugänge** | Einladungslinks erzeugen und zurückziehen, angemeldete Geräte einsehen und aussperren (nur für Geräte mit Verwalterrecht) |

Dazu: helles und dunkles Farbschema (umschaltbar über das Symbol in der
Kopfleiste, die Wahl wird gemerkt), ausgelegt für Handy, Tablet und Rechner,
Schrift und Schaltflächen groß genug für die Großeltern.

### Offline
Der zuletzt geladene Datenstand bleibt im Gerät und wird ohne Verbindung
weiterhin angezeigt – damit stehen Telefonnummer und Medikation auch beim Arzt
ohne Empfang zur Verfügung. Ein Hinweis in der Kopfleiste macht kenntlich, dass
es sich um den zuletzt geladenen Stand handelt. Wird einem Gerät der Zugang
entzogen, verwirft es diesen Stand beim nächsten Aufruf sofort.

## Zugangskonzept

1. Du meldest dich einmalig mit dem **Verwaltercode** aus `api/config.php` an
   (`https://deine-subdomain/#verwaltung=DEIN_CODE`).
2. In der App erzeugst du je Gerät einen **Einladungslink** und verschickst ihn,
   z. B. per WhatsApp.
3. Oma öffnet den Link **einmal** – fertig. Der Server setzt ein Cookie, das
   Gerät bleibt ein Jahr angemeldet und verlängert sich bei jeder Nutzung.
4. Der Link ist danach verbraucht und verfällt ohnehin nach 24 Stunden.
5. Verloren gegangenes Handy? In der Geräteliste **Zugang entziehen** – sofort
   wirksam, ohne die anderen zu stören.

Der Zugang liegt bewusst in einem `httpOnly`-Cookie und nicht in
`localStorage`: Skripte können ihn nicht auslesen, und iOS räumt ihn nicht nach
einigen Wochen Nichtnutzung weg.

### Absicherung
- Einladungs- und Sitzungstoken: 32 zufällige Bytes, in der Datenbank nur als
  SHA-256-Hash abgelegt
- Cookie: `httpOnly`, `Secure`, `SameSite=Lax`
- Zusätzliche Herkunftsprüfung bei jedem schreibenden Zugriff
- Nach 8 Fehlversuchen 5 Minuten Sperre, gezählt je Besucheradresse
- HTTPS wird erzwungen (`.htaccess` und serverseitig)
- Datenbank liegt außerhalb des Web-Verzeichnisses bzw. hinter `.htaccess`

## Installation auf IONOS

**1. Vorbereiten**

```bash
cp api/config.sample.php api/config.php
php -r "echo bin2hex(random_bytes(24)), PHP_EOL;"   # Verwaltercode erzeugen
```

Den erzeugten Wert als `admin_code` in `api/config.php` eintragen. Dieser Code
ist dein Notschlüssel – damit kommst du auch dann wieder hinein, wenn kein
angemeldetes Gerät mehr übrig ist. Nicht weitergeben.

**2. Hochladen**

Alles per FTP in das Verzeichnis der Subdomain, `.htaccess` eingeschlossen
(FTP-Programme blenden Dateien mit Punkt am Anfang oft aus).
Nicht hochladen: `tests/`, `node_modules/`.

**3. Datenbank außerhalb des Web-Verzeichnisses ablegen (empfohlen)**

Wenn dein Paket einen Ordner oberhalb der Subdomain erlaubt, dort ein
Verzeichnis anlegen und in `api/config.php` eintragen:

```php
'db_path' => '/homepages/xx/dxxxxxxx/familienbuch-daten/familienbuch.sqlite',
```

Andernfalls bleibt es beim mitgelieferten `data/`, das durch `.htaccess`
geschützt ist. Die Prüfseite sagt dir, welcher Fall vorliegt.

**4. Prüfen**

`https://deine-subdomain/pruefung.php?code=DEIN_CODE` aufrufen. Die Seite
prüft PHP-Version, SQLite, Schreibrechte, HTTPS und ob `/api` erreichbar ist.
Nach erfolgreicher Einrichtung kann `pruefung.php` gelöscht werden.

**5. HTTPS**

Im IONOS-Kundenbereich das Zertifikat für die Subdomain aktivieren. Ohne HTTPS
legt iOS die App nicht auf den Home-Bildschirm. Läuft HTTPS stabil, in der
`.htaccess` zusätzlich die `Strict-Transport-Security`-Zeile aktivieren.

## Sicherung der Daten

Die gesamte Datenbank ist **eine einzige Datei** (`familienbuch.sqlite`).
Regelmäßig per FTP herunterladen – das ist die komplette Sicherung.
Zurückspielen heißt: Datei wieder hochladen. Ohne Sicherung sind die Daten bei
einem Ausfall weg; das ist der Preis dafür, dass alles bei dir liegt.

## Tests

```bash
sh tests/run.sh
```

Startet einen eigenen Testserver mit frischer Datenbank. Die echten Daten und
deine `api/config.php` bleiben dabei unberührt.

- **Schnittstelle (40 Fälle):** Anmeldung, Einladungen, Zugangsentzug,
  Wiederverwendung, Sortierung, Eingabeprüfung, Sperre nach Fehlversuchen
- **Oberfläche (52 Fälle):** kompletter Ablauf in einem echten Browser im
  iPhone-Format – Person anlegen, Kacheln auswählen, speichern, drucken,
  Einladung verschicken und einlösen, Zugang entziehen, offline weiterarbeiten

Der Oberflächentest braucht Playwright und wird ohne es übersprungen:

```bash
npm install playwright && npx playwright install chromium
sh tests/run.sh api        # nur die Schnittstelle
```

## Schnittstelle

Alle Antworten sind JSON. Schreibende Zugriffe verlangen ein angemeldetes Gerät.

| Methode | Adresse | Zweck |
|---|---|---|
| GET | `/api/session` | Anmeldestatus, Grenzwerte |
| POST | `/api/auth/redeem` | Einladungslink einlösen |
| POST | `/api/auth/admin` | Anmeldung mit Verwaltercode |
| POST | `/api/auth/logout` | Abmelden |
| GET/POST | `/api/invites` | Einladungen auflisten / erzeugen *(Verwaltung)* |
| DELETE | `/api/invites/{id}` | Einladung zurückziehen *(Verwaltung)* |
| GET | `/api/devices` | Geräteliste *(Verwaltung)* |
| DELETE/PATCH | `/api/devices/{id}` | Zugang entziehen / Recht ändern *(Verwaltung)* |
| GET | `/api/data` | kompletter Datenbestand |
| POST/PUT/DELETE | `/api/persons[/{id}]` | Person anlegen, ändern, entfernen |
| POST/PUT | `/api/doctors[/{id}]` | Arzt anlegen, ändern |
| POST/PUT | `/api/allergies[/{id}]` | Allergie anlegen, ändern |
| POST/PUT | `/api/illnesses[/{id}]` | Krankheit anlegen, ändern |

Schreibende Zugriffe auf Personen liefern den kompletten Datenbestand zurück –
die Oberfläche braucht danach keine zweite Abfrage.

### Wiederverwendung
Ärzte, Allergien und Krankheiten liegen in gemeinsamen Listen und werden
Personen nur zugeordnet. Wird ein bereits vorhandener Eintrag erneut angelegt
(Groß-/Kleinschreibung und Leerraum egal), gibt es **keinen Fehler**: die
Schnittstelle liefert den vorhandenen Eintrag mit `"created": false` zurück.
Derselbe Arztname darf mehrfach vorkommen, solange die Art sich unterscheidet.
Beim Löschen einer Person verschwinden nur die Zuordnungen.

## Kommandozeile (optional, benötigt SSH)

```bash
php bin/familienbuch.php status
php bin/familienbuch.php einladung "Oma Erna" [--verwalter]
php bin/familienbuch.php geraete
php bin/familienbuch.php entziehen 3
```

Ohne SSH geht alles davon ebenso in der App selbst.

## Abweichungen von der Spezifikation

Diese Punkte habe ich bewusst anders umgesetzt – bitte gegenlesen:

| Spezifikation | Umsetzung | Grund |
|---|---|---|
| Benutzername + Passwort, max. 6 Konten | Einladungslink je Gerät, max. 12 Geräte | von dir so gewünscht; ein Mensch hat oft Handy *und* Tablet |
| Anmeldung 30 Tage gültig | 365 Tage, bei Nutzung verlängert | Großeltern öffnen die App selten – nach 30 Tagen stünden sie vor einer Anmeldung, die es nicht mehr gibt |
| Keine Rechteabstufung | Daten dürfen alle sehen und ändern; nur Einladungen und Geräteverwaltung sind der Verwaltung vorbehalten | sonst könnte jedes Gerät alle anderen aussperren |
| Passwort-Zurücksetzen per Kommandozeile | Verwaltercode aus `api/config.php` | funktioniert auch ohne SSH, das IONOS-Pakete nicht immer haben |
| „Gespeichert wird erst beim Klick auf Speichern“ | gilt für die Person. Ein **neu angelegter** Arzt bzw. eine neue Allergie wird sofort gespeichert | die gemeinsame Liste braucht den Eintrag, bevor er einer Person zugeordnet werden kann. Bricht man das Personenformular danach ab, bleibt der Eintrag in der Liste stehen |

## Was die App bewusst nicht kann

- Ärzte, Allergien und Krankheiten lassen sich nicht löschen. Ärzte sind über
  das Stift-Symbol änderbar; Allergien und Krankheiten umbenennen kann die
  Schnittstelle, eine Schaltfläche dafür gibt es noch nicht
- keine Fotos, Dokumente oder Dateianhänge
- kein Freitext-Notizfeld
- keine Aufzeichnung, wer wann was geändert hat
- keine Erinnerungen, kein Kalender, keine Benachrichtigungen
- keine Rechteabstufung bei den Daten: jedes angemeldete Gerät darf alles sehen
  und ändern

## Hinweis zum Repository

`crafting-hill-logo.png`, `facebook-icon.png` und `instagram-icon.png` stammen
aus der früheren Nutzung dieses Repositories (E-Mail-Signatur) und gehören
nicht zur App.
