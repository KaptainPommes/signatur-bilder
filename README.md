# Familienakte – PWA

Private Progressive Web App für die wichtigsten Gesundheits- und Stammdaten der
Familie. Installation direkt über den Browser („Zum Home-Bildschirm“) – bewusst
ohne App Store und ohne Play Store.

## Stand: Schritt 1 – Grundgerüst

Lauffähig und auf iPhone wie Android installierbar. Enthalten sind:

| Bereich | Umsetzung |
|---|---|
| Datenfelder | Name, Geburtsdatum (mit Altersanzeige), Allergien, Krankheiten, Medikation (morgens/mittags/abends inkl. Hinweis), Ärzte (Fachrichtung, Anschrift, Telefon), Schuh-/Kleider-/Hosengröße, Notizen |
| Bedienung | Übersicht → Detailansicht → Formular; große Schrift, Touch-Ziele ≥ 48 px, Hell-/Dunkelmodus, Unterstützung für Notch/Safe Area |
| Direktaktionen | Telefonnummer antippen = anrufen, Adresse antippen = Route (Apple Maps auf iOS, sonst Google Maps) |
| Offline | Service Worker mit vorgeladener App-Shell, Offline-Hinweis, Fallback-Seite |
| Updates | Banner „Neue Version ist bereit“ statt stillem Neuladen |
| Sicherung | Export und Import als JSON-Datei über das Menü |

### ⚠️ Noch kein Zugriffsschutz

Dieser Schritt enthält bewusst **kein Backend**. Daraus folgt:

* Die Daten liegen **ausschließlich lokal** im Browser-Speicher des jeweiligen
  Geräts. Kein Abgleich zwischen Geräten, keine Übertragung irgendwohin.
* Wer die URL kennt, kann die (leere) App öffnen. `js/auth.js` legt bereits die
  Client-Hälfte des Magic-Link-Verfahrens – geprüft wird ein Token aber erst,
  wenn `ENDPOINT` dort auf die spätere Server-Route zeigt.

**Deshalb in diesem Stand noch keine echten Gesundheitsdaten eintragen.** Zum
Ausprobieren dient der Knopf „Beispiel laden“.

## Dateien

```
index.html              App-Shell, iOS-Meta-Tags, Einstiegspunkt
manifest.webmanifest    Installierbarkeit: standalone, Icons, Farben
sw.js                   Service Worker (Caching, Offline, Update)
offline.html            Rückfallseite ohne Verbindung
app.css                 Gesamtes Styling, hell und dunkel
js/store.js             Datenschicht – hier wird später der Server angebunden
js/auth.js              Magic-Link-/Token-Logik (Client-Seite)
js/app.js               Oberfläche, Routing, PWA-Einbindung
icons/                  App-Icons inkl. maskable und apple-touch-icon
```

## Lokal ausprobieren

Ein Service Worker braucht `https` oder `localhost` – die Datei direkt per
Doppelklick zu öffnen genügt nicht.

```bash
python3 -m http.server 8080
# danach http://localhost:8080 aufrufen
```

Für einen Test auf dem Handy im selben WLAN die IP des Rechners verwenden.
iOS-Safari installiert allerdings nur von einer **HTTPS**-Adresse – für den
echten Gerätetest also besser gleich auf die spätere Domain veröffentlichen.

## Installieren

* **Android/Chrome:** Die App schlägt die Installation selbst vor; alternativ
  Menü ⋮ → „App installieren“.
* **iOS/Safari:** Teilen-Symbol → „Zum Home-Bildschirm“. Safari zeigt keinen
  eigenen Dialog an, deshalb blendet die App unten eine Anleitung ein.

## Nach Änderungen: Version hochzählen

In `sw.js` steht oben `const VERSION = 'v1';`. Diese Zahl bei jeder Änderung an
HTML/CSS/JS erhöhen – sonst liefert der Service Worker weiter die alten Dateien
aus dem Cache aus.

## Nächste Schritte

1. **Backend + Magic Link** – Token serverseitig ausstellen und prüfen,
   `ENDPOINT` in `js/auth.js` setzen. Erst damit ist die App geschützt.
2. **Synchronisierung** – `Store.adapter` in `js/store.js` gegen einen
   Server-Adapter tauschen, damit alle Familienmitglieder denselben Stand sehen.
3. **Veröffentlichen** – inklusive HTTPS und eigener Subdomain.

## Hinweis zum Repository

`crafting-hill-logo.png`, `facebook-icon.png` und `instagram-icon.png` im
Wurzelverzeichnis stammen aus der früheren Nutzung dieses Repositories
(E-Mail-Signatur) und gehören nicht zur App. Sie sind unangetastet geblieben –
sie können gelöscht oder in einen Unterordner verschoben werden.
