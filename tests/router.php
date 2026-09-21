<?php
// Bildet die Umschreibung aus der .htaccess fuer den eingebauten
// PHP-Server nach (php -S kennt keine .htaccess).
$root = dirname(__DIR__);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path, '/api')) {
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require $root . '/api/index.php';
    return true;
}
return false;
