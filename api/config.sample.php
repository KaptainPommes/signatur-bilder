<?php
/**
 * Vorlage fuer api/config.php.
 *
 * 1. Diese Datei als `config.php` in denselben Ordner kopieren
 * 2. admin_code durch einen langen Zufallswert ersetzen, z. B. erzeugt mit
 *      php -r "echo bin2hex(random_bytes(24));"
 *    Dieser Code ist dein Notschluessel: damit kommst du auch dann wieder
 *    hinein, wenn kein angemeldetes Geraet mehr uebrig ist. Nicht weitergeben.
 * 3. config.php NICHT ins Repository aufnehmen (steht in .gitignore).
 */
return [
    'admin_code' => 'HIER-EINEN-LANGEN-ZUFALLSWERT-EINTRAGEN',

    // Ablageort der Datenbank. Standard ist ../data/ neben dem api-Ordner.
    // Wenn dein IONOS-Paket einen Ordner OBERHALB des Web-Verzeichnisses
    // erlaubt, ist der noch besser – dann ist die Datei gar nicht erst
    // ueber das Internet erreichbar.
    // 'db_path' => '/homepages/xx/dxxxxxxx/familienbuch-daten/familienbuch.sqlite',

    'session_days'  => 365,   // so lange bleibt ein Geraet angemeldet
    'invite_hours'  => 24,    // so lange ist ein Einladungslink einloesbar
    'max_devices'   => 12,
    'require_https' => true,  // zum Testen auf http://localhost auf false setzen

    // Die Sperre nach zu vielen Fehlversuchen zaehlt je Besucheradresse.
    // Standard ist REMOTE_ADDR vom Webserver – auf IONOS richtig so.
    // Steht ein Vermittler davor (z. B. Cloudflare), der die echte Adresse in
    // einem Kopffeld weitergibt, hier dessen Namen eintragen. NIEMALS raten:
    // ein falscher Wert hebelt die Sperre aus, weil das Feld dann vom
    // Aufrufer selbst stammt.
    // 'client_ip_header' => 'HTTP_X_FORWARDED_FOR',
];
