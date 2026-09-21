<?php
declare(strict_types=1);

/**
 * Kommandozeilen-Werkzeug (optional, benoetigt SSH-Zugang).
 *
 *   php bin/familienbuch.php status
 *   php bin/familienbuch.php einladung "Oma Erna"        Einladungslink erzeugen
 *   php bin/familienbuch.php einladung "Ich" --verwalter  … mit Verwalterrecht
 *   php bin/familienbuch.php geraete                      angemeldete Geraete
 *   php bin/familienbuch.php entziehen 3                  Zugang entziehen
 *
 * Ohne SSH geht alles Genannte ebenso ueber die App selbst; zum Hineinkommen
 * dient dann der Verwaltercode aus api/config.php.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Dieses Werkzeug laeuft nur auf der Kommandozeile.\n");
}

require __DIR__ . '/../api/lib/config.php';
require __DIR__ . '/../api/lib/http.php';
require __DIR__ . '/../api/lib/db.php';
require __DIR__ . '/../api/lib/auth.php';

$command = $argv[1] ?? 'hilfe';
$args = array_slice($argv, 2);
$flags = array_values(array_filter($args, static fn(string $a) => str_starts_with($a, '--')));
$plain = array_values(array_filter($args, static fn(string $a) => !str_starts_with($a, '--')));

try {
    switch ($command) {
        case 'status':
            $pdo = Db::conn();
            printf("Datenbank : %s\n", Config::get('db_path'));
            printf("Personen  : %d\n", $pdo->query('SELECT COUNT(*) FROM person')->fetchColumn());
            printf("Aerzte    : %d\n", $pdo->query('SELECT COUNT(*) FROM doctor')->fetchColumn());
            printf("Geraete   : %d von %d\n", Auth::deviceCount(), (int) Config::get('max_devices'));
            printf("Offene Einladungen: %d\n", count(Auth::listInvites()));
            break;

        case 'einladung':
            $label = $plain[0] ?? '';
            if ($label === '') {
                exit("Bitte eine Bezeichnung angeben, z. B.: einladung \"Oma Erna\"\n");
            }
            $invite = Auth::createInvite($label, in_array('--verwalter', $flags, true));
            printf("Einladung fuer \"%s\" angelegt, gueltig bis %s.\n\n", $invite['label'], $invite['expiresAt']);
            printf("Diesen Link verschicken (Adresse anpassen):\n\n");
            printf("    https://DEINE-SUBDOMAIN/#einladung=%s\n\n", $invite['token']);
            printf("Der Link laesst sich genau einmal oeffnen.\n");
            break;

        case 'geraete':
            $devices = Auth::listDevices();
            if (!$devices) {
                exit("Noch kein Geraet angemeldet.\n");
            }
            printf("%-4s %-24s %-10s %s\n", 'Nr.', 'Bezeichnung', 'Rolle', 'Zuletzt gesehen');
            foreach ($devices as $d) {
                printf("%-4d %-24s %-10s %s\n", $d['id'], mb_substr($d['label'], 0, 24),
                    $d['isAdmin'] ? 'Verwalter' : 'Familie', $d['lastSeenAt']);
            }
            break;

        case 'entziehen':
            $id = (int) ($plain[0] ?? 0);
            if ($id <= 0) {
                exit("Bitte die Nummer des Geraets angeben (siehe: geraete).\n");
            }
            Auth::revokeDevice($id);
            printf("Zugang von Geraet %d entzogen.\n", $id);
            break;

        default:
            echo "Familienbuch – Kommandozeilen-Werkzeug\n\n";
            echo "  status                        Kurzuebersicht\n";
            echo "  einladung \"Name\" [--verwalter] Einladungslink erzeugen\n";
            echo "  geraete                       angemeldete Geraete auflisten\n";
            echo "  entziehen <Nr.>               Zugang eines Geraets entziehen\n";
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Fehler: ' . $e->getMessage() . "\n");
    exit(1);
}
