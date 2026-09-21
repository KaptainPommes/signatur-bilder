<?php
declare(strict_types=1);

/**
 * Einstellungen aus api/config.php (nicht im Repository, siehe config.sample.php).
 */
final class Config
{
    private static ?array $values = null;

    private const DEFAULTS = [
        'db_path'       => null,      // wird unten gesetzt
        'admin_code'    => '',
        'session_days'  => 365,       // Gueltigkeit eines angemeldeten Geraets
        'invite_hours'  => 24,        // Gueltigkeit eines Einladungslinks
        'max_devices'   => 12,
        'cookie_name'   => 'fb_session',
        'require_https' => true,
        // IONOS meldet die Verschluesselung ueber X-Forwarded-Proto.
        'trust_proxy'   => true,
        // Quelle der Besucheradresse fuer die Fehlversuchssperre. null = REMOTE_ADDR
        // (sicher). Nur setzen, wenn sicher ein Vermittler davorsteht, z. B.
        // 'HTTP_X_FORWARDED_FOR' hinter einem Cloudflare-Tunnel.
        'client_ip_header' => null,
    ];

    public static function load(): array
    {
        if (self::$values !== null) {
            return self::$values;
        }

        // FB_CONFIG erlaubt der Testsuite eine eigene Konfiguration,
        // ohne die echte api/config.php anzufassen.
        $file = getenv('FB_CONFIG') ?: __DIR__ . '/../config.php';
        if (!is_file($file)) {
            throw new RuntimeException(
                'api/config.php fehlt. Bitte api/config.sample.php kopieren und ausfuellen.'
            );
        }

        $custom = require $file;
        if (!is_array($custom)) {
            throw new RuntimeException('api/config.php muss ein Array zurueckgeben.');
        }

        $values = array_merge(self::DEFAULTS, $custom);
        $values['db_path'] ??= __DIR__ . '/../../data/familienbuch.sqlite';

        if (strlen((string) $values['admin_code']) < 20) {
            throw new RuntimeException(
                'admin_code in api/config.php fehlt oder ist zu kurz (mindestens 20 Zeichen).'
            );
        }

        return self::$values = $values;
    }

    public static function get(string $key): mixed
    {
        return self::load()[$key] ?? null;
    }
}
