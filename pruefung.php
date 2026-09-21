<?php
declare(strict_types=1);

/**
 * Installationspruefung.
 *
 * Nach dem Hochladen auf IONOS einmal https://deine-subdomain/pruefung.php
 * aufrufen. Sobald api/config.php vorhanden ist, wird der Verwaltercode
 * verlangt:  …/pruefung.php?code=DEIN_CODE
 *
 * Diese Datei kann nach erfolgreicher Einrichtung geloescht werden.
 */

$configFile = __DIR__ . '/api/config.php';
$configExists = is_file($configFile);
$authorized = !$configExists;   // ohne Konfiguration nur die Grundpruefung

if ($configExists) {
    require __DIR__ . '/api/lib/config.php';
    try {
        $expected = (string) Config::get('admin_code');
        $given = (string) ($_GET['code'] ?? '');
        $authorized = $given !== '' && hash_equals($expected, $given);
    } catch (Throwable) {
        $authorized = false;
    }
}

$checks = [];
$add = static function (string $name, bool $ok, string $detail, bool $warnOnly = false) use (&$checks): void {
    $checks[] = ['name' => $name, 'ok' => $ok, 'detail' => $detail, 'warn' => $warnOnly];
};

/* --- Grundvoraussetzungen ------------------------------------------------- */

$add('PHP-Version', PHP_VERSION_ID >= 80100, 'Gefunden: ' . PHP_VERSION . ' (benoetigt wird 8.1 oder neuer)');
$add('Erweiterung pdo_sqlite', extension_loaded('pdo_sqlite'), 'Wird fuer die Datenbank benoetigt');
$add('Erweiterung mbstring', extension_loaded('mbstring'), 'Wird fuer Umlaute benoetigt');

$https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
    || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
$add('HTTPS aktiv', $https, $https
    ? 'Die Seite wird verschluesselt ausgeliefert'
    : 'Ohne HTTPS laesst iOS die App nicht auf den Home-Bildschirm legen');

$rewrite = function_exists('apache_get_modules') ? in_array('mod_rewrite', apache_get_modules(), true) : null;
$add('mod_rewrite', $rewrite !== false, $rewrite === null
    ? 'Nicht direkt pruefbar – der Schnittstellentest unten gibt Auskunft'
    : ($rewrite ? 'Verfuegbar' : 'Fehlt – die Schnittstelle unter /api ist dann nicht erreichbar'), $rewrite === null);

$add('Konfiguration api/config.php', $configExists, $configExists
    ? 'Vorhanden'
    : 'Fehlt noch – api/config.sample.php als api/config.php kopieren und ausfuellen');

/* --- Nur mit gueltigem Code ------------------------------------------------ */

if ($configExists && $authorized) {
    try {
        $dbPath = (string) Config::get('db_path');
        $dir = dirname($dbPath);

        if (!is_dir($dir)) {
            @mkdir($dir, 0770, true);
        }
        $add('Datenverzeichnis beschreibbar', is_dir($dir) && is_writable($dir), $dir);

        $docRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '';
        $realDir = realpath($dir) ?: $dir;
        $inside = $docRoot !== '' && str_starts_with($realDir, $docRoot);
        $add('Datenbank ausserhalb des Web-Verzeichnisses', !$inside, $inside
            ? 'Die Datenbank liegt im Web-Verzeichnis. data/.htaccess schuetzt sie, '
              . 'besser ist ein Ordner oberhalb davon (db_path in der Konfiguration).'
            : 'Die Datei ist ueber das Internet gar nicht erst erreichbar', true);

        require __DIR__ . '/api/lib/http.php';
        require __DIR__ . '/api/lib/db.php';
        Db::conn();
        $add('Datenbank', true, 'Verbindung steht, Schema ist angelegt');

        require __DIR__ . '/api/lib/auth.php';
        $count = Auth::deviceCount();
        $add('Angemeldete Geraete', true, $count === 0
            ? 'Noch keines – jetzt unten die Ersteinrichtung starten'
            : $count . ' Geraet(e) angemeldet');
    } catch (Throwable $e) {
        $add('Datenbank', false, $e->getMessage());
    }
}

$failed = array_filter($checks, static fn(array $c) => !$c['ok'] && !$c['warn']);
$esc = static fn(?string $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
?>
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Installationsprüfung – Familienbuch</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.5;
         max-width: 720px; margin: 0 auto; padding: 24px 16px; background: #f4f6f6; color: #16241f; }
  h1 { font-size: 1.4rem; }
  ul { list-style: none; padding: 0; }
  li { background: #fff; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px;
       box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .state { font-weight: 700; margin-right: 8px; }
  .ok   { color: #1f7a74; } .bad { color: #a4331f; } .warn { color: #8a5a00; }
  .detail { color: #56675f; font-size: .94rem; }
  .box { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  code { background: #e3f0ef; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
<h1>Installationsprüfung</h1>

<?php if ($configExists && !$authorized): ?>
  <div class="box">
    <p>Die Konfiguration ist vorhanden. Für die vollständige Prüfung bitte den
       Verwaltercode anhängen:</p>
    <p><code><?= $esc(($_SERVER['SCRIPT_NAME'] ?? '/pruefung.php')) ?>?code=DEIN_CODE</code></p>
    <p class="detail">Der Code steht in <code>api/config.php</code> unter <code>admin_code</code>.</p>
  </div>
<?php endif; ?>

<ul>
<?php foreach ($checks as $c): ?>
  <li>
    <span class="state <?= $c['ok'] ? 'ok' : ($c['warn'] ? 'warn' : 'bad') ?>">
      <?= $c['ok'] ? '✓' : ($c['warn'] ? '!' : '✕') ?>
    </span>
    <strong><?= $esc($c['name']) ?></strong><br>
    <span class="detail"><?= $esc($c['detail']) ?></span>
  </li>
<?php endforeach; ?>
</ul>

<div class="box">
  <h2 style="font-size:1.1rem;margin-top:0">Schnittstellentest</h2>
  <p class="detail">Prüft, ob <code>/api/session</code> erreichbar ist – damit steht
     auch fest, ob die Umschreibung per <code>.htaccess</code> greift.</p>
  <p id="api-result">wird geprüft …</p>
</div>

<p class="detail" style="margin-top:20px">
  <?= $failed ? 'Bitte zuerst die rot markierten Punkte beheben.'
              : 'Alles Nötige ist vorhanden. Diese Datei kann nach der Einrichtung gelöscht werden.' ?>
</p>

<script>
  const base = location.pathname.replace(/\/[^/]*$/, '');
  fetch(base + '/api/session', { credentials: 'same-origin' })
    .then(async r => {
      const data = await r.json();
      document.getElementById('api-result').textContent = r.ok
        ? '✓ Erreichbar. ' + (data.setupNeeded
            ? 'Es ist noch kein Gerät angemeldet – die Ersteinrichtung steht an.'
            : 'Es sind bereits Geräte angemeldet.')
        : '✕ Antwort ' + r.status + ': ' + (data.error || 'unbekannter Fehler');
    })
    .catch(e => {
      document.getElementById('api-result').textContent =
        '✕ Nicht erreichbar (' + e.message + '). Meist fehlt die .htaccess oder mod_rewrite ist aus.';
    });
</script>
</body>
</html>
