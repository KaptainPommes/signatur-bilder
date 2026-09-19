# Familienbuch auf einem Server einrichten

Diese Anleitung ist für Einsteiger geschrieben. Du musst nichts verstehen – nur
die Befehle kopieren und einfügen. Dauer: ungefähr 15 Minuten.

Es gibt **zwei Varianten**. Die Entscheidung fällt nur an einer Stelle
(Schritt 3), der Rest ist identisch.

| | Variante A: Heimserver | Variante B: Server im Internet |
|---|---|---|
| Wo liegen die Daten | zu Hause, bei euch | beim Anbieter (z. B. Netcup) |
| Erreichbar | im WLAN, von unterwegs über WireGuard | von überall |
| Verschlüsselung | im Heimnetz direkt, sonst über den WireGuard-Tunnel | HTTPS-Zertifikat |
| Zusatzkosten | keine | Miete des Servers |
| Befehl in Schritt 3 | `... \| bash -s -- --lokal` | `... \| bash -s -- DEINE-ADRESSE` |

**Variante A ist für Familiendaten die datenschutzfreundlichere Wahl**, wenn
ohnehin schon ein Heimserver läuft und WireGuard eingerichtet ist.
Schritt 1 (Adresse) entfällt dann komplett.

---

## Schritt 1: Adresse festlegen

> **Bei Variante A (Heimserver) überspringst du diesen Schritt.**


Das Familienbuch braucht eine Internet-Adresse, damit ihr euch später sicher
(verschlüsselt) anmelden könnt. Zwei Möglichkeiten:

**a) Ihr habt schon eine eigene Domain** (z. B. `mustermann.de`)
Dann legt bei eurem Domain-Anbieter einen Eintrag an, der auf die IP-Adresse
eures Servers zeigt – zum Beispiel `familie.mustermann.de`.
(Bei Netcup heißt das im Kundenkonto "DNS" → neuer Eintrag vom Typ **A** →
Name: `familie`, Ziel: die IP eures Servers.)

**b) Ihr habt keine eigene Domain**
Netcup vergibt für jeden Server automatisch einen Standard-Hostnamen, der aussieht
wie `v2202509123456789.meinsrv.de`. Den findest du im Netcup-Kundenkonto (SCP)
bei deinem Server. Der funktioniert genauso gut – nur merkt ihn sich niemand.

Schreib dir diese Adresse auf, du brauchst sie in Schritt 3.

---

## Schritt 2: Mit dem Server verbinden

Du brauchst ein schwarzes Fenster, in dem du Befehle eintippen kannst.

**Windows:** Drücke die Windows-Taste, tippe `powershell`, Enter. Dann:

```
ssh root@DEINE-SERVER-IP
```

**Mac:** Programm "Terminal" öffnen, dann derselbe Befehl.

**Ohne Programm:** Im Netcup-Kundenkonto gibt es eine Konsole direkt im Browser
("VNC" oder "Konsole" beim Server). Die geht auch.

Beim ersten Mal fragt er `Are you sure you want to continue connecting?` →
tippe `yes` und Enter. Danach das Root-Passwort eingeben, das Netcup dir
geschickt hat. (Beim Tippen sieht man das Passwort nicht – das ist normal.)

Wenn alles klappt, steht da am Ende so etwas wie `root@v2202...:~#`.

---

## Schritt 3: Einen einzigen Befehl ausführen

Diese Anleitung ist für **Ubuntu** (und Debian) gemacht – bei einem frisch
bestellten Server ist das genau richtig.

Kopiere die folgende Zeile, **ersetze `DEINE-ADRESSE`** durch die Adresse aus
Schritt 1, und füge sie im schwarzen Fenster ein (Rechtsklick fügt meist ein):

```
curl -fsSL https://raw.githubusercontent.com/KaptainPommes/signatur-bilder/claude/family-data-app-4uk4un/family-app/deploy/setup.sh | bash -s -- DEINE-ADRESSE
```

Beispiel mit einer echten Adresse:

```
curl -fsSL https://raw.githubusercontent.com/KaptainPommes/signatur-bilder/claude/family-data-app-4uk4un/family-app/deploy/setup.sh | bash -s -- familie.mustermann.de
```

**Für Variante A (Heimserver)** stattdessen genau diese Zeile – nichts
ersetzen:

```
curl -fsSL https://raw.githubusercontent.com/KaptainPommes/signatur-bilder/claude/family-data-app-4uk4un/family-app/deploy/setup.sh | bash -s -- --lokal
```

Dabei wird **kein** Webserver installiert und an der Firewall nichts
verändert. Die App läuft dann auf Port 3000 und ist unter
`http://SERVER-IP:3000` erreichbar – im WLAN direkt, von unterwegs
über WireGuard.

**Achtung beim Heimserver-Backup:** Sichert dein restic-Backup nur `/etc`
und `/home`, fehlen die Familiendaten unter `/opt`. Dann in
`/usr/local/bin/backup.sh` die Zeile erweitern:

```
restic backup /etc /home /opt/familienbuch/family-app/data --exclude-caches
```

Jetzt läuft ein paar Minuten Text durch – das ist normal. Am Ende steht groß
**"Fertig!"** und darunter die Adresse eurer App.

Falls die Meldung `curl: command not found` kommt, einmal das hier ausführen
und den Befehl von oben danach nochmal probieren:

```
apt update && apt install -y curl
```

---

## Schritt 4: App einrichten

1. Öffne die angezeigte Adresse (`https://...`) im Browser.
2. Du landest bei "Willkommen! Legt euer erstes Konto an" → dein Name,
   Benutzername und ein Passwort (mindestens 8 Zeichen, bitte ein gutes).
3. Nach dem Anlegen bist du direkt drin.
4. Oben rechts auf das Symbol **+👤** klicken und das zweite Konto für deine
   Frau anlegen. Sie kann sich dann von ihrem Handy unter derselben Adresse
   anmelden.
5. Familienmitglieder anlegen: Karte "Familienmitglied hinzufügen" klicken.

Fertig – ihr könnt von jedem Gerät auf eure Familiendaten zugreifen.

---

## Später mal gebraucht

Alles im schwarzen Fenster, nachdem du dich wie in Schritt 2 verbunden hast:

| Was du willst | Befehl |
|---|---|
| Läuft die App noch? | `systemctl status familienbuch` |
| App neu starten | `systemctl restart familienbuch` |
| Fehlermeldungen ansehen | `journalctl -u familienbuch -n 50` |
| Neue Version einspielen | `bash /opt/familienbuch/family-app/deploy/update.sh` |

**Backups:** Jede Nacht wird automatisch eine Kopie der Daten angelegt unter
`/var/backups/familienbuch`. Die letzten 14 Tage werden aufbewahrt.
Zum Herunterladen auf deinen PC (im Fenster auf deinem eigenen Rechner,
nicht auf dem Server):

```
scp root@DEINE-SERVER-IP:/var/backups/familienbuch/*.db .
```

---

## Wenn etwas nicht klappt

**Die Seite lädt nicht / Zertifikatsfehler**
Warte 2 Minuten und lade neu. Das Sicherheitszertifikat wird beim ersten
Aufruf automatisch geholt, das dauert einen Moment. Wenn es dauerhaft nicht
geht: Zeigt die Adresse wirklich auf den Server? Prüfen mit `ping DEINE-ADRESSE`
– die angezeigte IP muss die deines Servers sein.

**"command not found" oder das Skript bricht ab**
Kopiere die letzte rote Fehlermeldung und schick sie mir, dann schaue ich drauf.

**Du kommst nicht mehr per SSH rauf**
Über die Browser-Konsole im Netcup-Kundenkonto kommst du immer rein, auch
wenn die Firewall zickt.

---

## Was das Skript gemacht hat (nur zur Info)

- Node.js installiert (die Technik, auf der die App läuft)
- Die App nach `/opt/familienbuch` gelegt und so eingerichtet, dass sie
  nach einem Neustart des Servers von allein wieder hochfährt
- Caddy installiert: ein Webserver, der automatisch für HTTPS
  (das Schloss-Symbol im Browser) sorgt
- Eine Firewall aktiviert – von außen sind nur SSH und die Webseite erreichbar
- Ein tägliches Backup eingerichtet

Eure Familiendaten liegen ausschließlich auf eurem eigenen Server, in einer
Datei unter `/opt/familienbuch/family-app/data/family.db`. Sie landen nie auf
GitHub und nie bei Dritten.
