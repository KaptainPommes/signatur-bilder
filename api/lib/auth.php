<?php
declare(strict_types=1);

/**
 * Zugang ohne Passwoerter: Einladungslink -> einmalig einloesen -> Sitzungscookie.
 *
 * Ablauf:
 *   1. Ein Geraet mit Verwalterrecht erzeugt eine Einladung und erhaelt einen
 *      Link der Form  https://…/#einladung=<token>
 *   2. Beim Oeffnen loest die App den Token per POST ein. Der Server legt ein
 *      Geraet an und setzt ein httpOnly-Cookie – ab da ist genau dieses Geraet
 *      angemeldet, ohne dass jemand etwas eintippen muss.
 *   3. Der Token ist danach verbraucht; der Link nuetzt niemandem mehr etwas.
 *
 * Der Zugang liegt bewusst NICHT in localStorage: ein httpOnly-Cookie ist fuer
 * Skripte unlesbar und wird von iOS nicht nach einigen Wochen Nichtnutzung
 * geloescht – sonst stuenden die Grosseltern irgendwann vor einer leeren App.
 */
final class Auth
{
    private const FAILURE_LIMIT = 8;
    private const LOCK_MINUTES = 5;
    /** Sitzung erst verlaengern, wenn sie eine Weile unberuehrt war (spart Schreibzugriffe). */
    private const TOUCH_AFTER_SECONDS = 3600;

    private static ?array $device = null;
    private static bool $resolved = false;

    /* --- Token-Werkzeug ---------------------------------------------------- */

    private static function newToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    private static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    private static function cookieName(): string
    {
        return (string) Config::get('cookie_name');
    }

    /** Pfad der Installation, damit das Cookie auch im Unterordner passt. */
    private static function cookiePath(): string
    {
        $apiDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
        $root = rtrim(dirname($apiDir), '/');
        return ($root === '' || $root === '.') ? '/' : $root . '/';
    }

    private static function setCookie(string $token, int $expiresAt): void
    {
        setcookie(self::cookieName(), $token, [
            'expires'  => $expiresAt,
            'path'     => self::cookiePath(),
            'secure'   => Http::isSecure(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    private static function clearCookie(): void
    {
        setcookie(self::cookieName(), '', [
            'expires'  => time() - 3600,
            'path'     => self::cookiePath(),
            'secure'   => Http::isSecure(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    /* --- Fehlversuchssperre ------------------------------------------------ */

    public static function assertNotLocked(): void
    {
        $pdo = Db::conn();
        $since = gmdate('Y-m-d\TH:i:s\Z', time() - self::LOCK_MINUTES * 60);
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM auth_attempt WHERE ip_hash = ? AND at > ?');
        $stmt->execute([Http::clientKey(), $since]);

        if ((int) $stmt->fetchColumn() >= self::FAILURE_LIMIT) {
            throw new ApiError(429, sprintf(
                'Zu viele Fehlversuche. Bitte in %d Minuten erneut versuchen.',
                self::LOCK_MINUTES
            ));
        }
    }

    private static function recordFailure(): void
    {
        $pdo = Db::conn();
        $pdo->prepare('INSERT INTO auth_attempt (ip_hash, at) VALUES (?, ?)')
            ->execute([Http::clientKey(), Db::now()]);
    }

    private static function clearFailures(): void
    {
        Db::conn()->prepare('DELETE FROM auth_attempt WHERE ip_hash = ?')
            ->execute([Http::clientKey()]);
    }

    /** Abgelaufene Datensaetze entfernen – laeuft bei jeder Anmeldung mit. */
    private static function sweep(): void
    {
        $pdo = Db::conn();
        $now = Db::now();
        $pdo->prepare('DELETE FROM device WHERE expires_at < ?')->execute([$now]);
        $pdo->prepare('DELETE FROM invite WHERE redeemed_at IS NULL AND expires_at < ?')->execute([$now]);
        $pdo->prepare('DELETE FROM auth_attempt WHERE at < ?')
            ->execute([gmdate('Y-m-d\TH:i:s\Z', time() - 86400)]);
    }

    /* --- Angemeldetes Geraet ----------------------------------------------- */

    public static function currentDevice(): ?array
    {
        if (self::$resolved) {
            return self::$device;
        }
        self::$resolved = true;

        $token = $_COOKIE[self::cookieName()] ?? '';
        if (!is_string($token) || $token === '') {
            return self::$device = null;
        }

        $stmt = Db::conn()->prepare('SELECT * FROM device WHERE session_hash = ?');
        $stmt->execute([self::hash($token)]);
        $device = $stmt->fetch();

        if (!$device) {
            return self::$device = null;
        }
        if ($device['expires_at'] < Db::now()) {
            Db::conn()->prepare('DELETE FROM device WHERE id = ?')->execute([$device['id']]);
            return self::$device = null;
        }

        // Gleitende Verlaengerung: wer die App nutzt, bleibt angemeldet.
        if (strtotime((string) $device['last_seen_at']) < time() - self::TOUCH_AFTER_SECONDS) {
            $expires = time() + (int) Config::get('session_days') * 86400;
            Db::conn()
                ->prepare('UPDATE device SET last_seen_at = ?, expires_at = ? WHERE id = ?')
                ->execute([Db::now(), gmdate('Y-m-d\TH:i:s\Z', $expires), $device['id']]);
            self::setCookie($token, $expires);
        }

        return self::$device = $device;
    }

    public static function require(): array
    {
        $device = self::currentDevice();
        if (!$device) {
            throw new ApiError(401, 'Nicht angemeldet. Bitte den Einladungslink oeffnen.');
        }
        return $device;
    }

    public static function requireAdmin(): array
    {
        $device = self::require();
        if ((int) $device['is_admin'] !== 1) {
            throw new ApiError(403, 'Dafuer wird ein Geraet mit Verwalterrecht benoetigt.');
        }
        return $device;
    }

    /* --- Anmelden ----------------------------------------------------------- */

    private static function startSession(string $label, bool $isAdmin): array
    {
        $pdo = Db::conn();

        $count = (int) $pdo->query('SELECT COUNT(*) FROM device')->fetchColumn();
        if ($count >= (int) Config::get('max_devices')) {
            throw new ApiError(409, sprintf(
                'Es sind bereits %d Geraete angemeldet. Bitte zuerst eines entfernen.',
                $count
            ));
        }

        $token = self::newToken();
        $expires = time() + (int) Config::get('session_days') * 86400;
        $now = Db::now();

        $pdo->prepare(
            'INSERT INTO device (label, session_hash, is_admin, user_agent, created_at, last_seen_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $label,
            self::hash($token),
            $isAdmin ? 1 : 0,
            mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200),
            $now,
            $now,
            gmdate('Y-m-d\TH:i:s\Z', $expires),
        ]);

        $id = (int) $pdo->lastInsertId();
        self::setCookie($token, $expires);

        return ['id' => $id, 'label' => $label, 'isAdmin' => $isAdmin];
    }

    /** Einladungslink einloesen. Der Token ist danach verbraucht. */
    public static function redeem(string $token): array
    {
        self::assertNotLocked();
        self::sweep();

        $stmt = Db::conn()->prepare('SELECT * FROM invite WHERE token_hash = ?');
        $stmt->execute([self::hash($token)]);
        $invite = $stmt->fetch();

        if (!$invite || $invite['redeemed_at'] !== null || $invite['expires_at'] < Db::now()) {
            self::recordFailure();
            throw new ApiError(401, 'Dieser Einladungslink ist ungueltig oder bereits benutzt.');
        }

        $device = self::startSession((string) $invite['label'], (int) $invite['make_admin'] === 1);

        Db::conn()->prepare('UPDATE invite SET redeemed_at = ?, device_id = ? WHERE id = ?')
            ->execute([Db::now(), $device['id'], $invite['id']]);

        self::clearFailures();
        return $device;
    }

    /**
     * Notschluessel: meldet mit dem admin_code aus der Konfiguration ein
     * Verwaltergeraet an. Dient der Ersteinrichtung und dem Fall, dass kein
     * angemeldetes Geraet mehr uebrig ist.
     */
    public static function adminLogin(string $code, string $label): array
    {
        self::assertNotLocked();
        self::sweep();

        $expected = (string) Config::get('admin_code');
        if ($code === '' || !hash_equals($expected, $code)) {
            self::recordFailure();
            throw new ApiError(401, 'Der Verwaltercode stimmt nicht.');
        }

        $device = self::startSession($label !== '' ? $label : 'Verwaltung', true);
        self::clearFailures();
        return $device;
    }

    public static function logout(): void
    {
        $device = self::currentDevice();
        if ($device) {
            Db::conn()->prepare('DELETE FROM device WHERE id = ?')->execute([$device['id']]);
        }
        self::clearCookie();
    }

    /* --- Verwaltung ---------------------------------------------------------- */

    public static function createInvite(string $label, bool $makeAdmin): array
    {
        $token = self::newToken();
        $expires = time() + (int) Config::get('invite_hours') * 3600;

        Db::conn()->prepare(
            'INSERT INTO invite (token_hash, label, make_admin, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([
            self::hash($token),
            $label,
            $makeAdmin ? 1 : 0,
            Db::now(),
            gmdate('Y-m-d\TH:i:s\Z', $expires),
        ]);

        return [
            'id'        => (int) Db::conn()->lastInsertId(),
            'label'     => $label,
            'token'     => $token,           // nur dieses eine Mal sichtbar
            'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', $expires),
        ];
    }

    public static function listInvites(): array
    {
        $rows = Db::conn()->query(
            'SELECT id, label, make_admin, created_at, expires_at, redeemed_at
             FROM invite WHERE redeemed_at IS NULL ORDER BY created_at DESC'
        )->fetchAll();

        return array_map(static fn(array $r) => [
            'id'        => (int) $r['id'],
            'label'     => $r['label'],
            'isAdmin'   => (int) $r['make_admin'] === 1,
            'createdAt' => $r['created_at'],
            'expiresAt' => $r['expires_at'],
        ], $rows);
    }

    public static function deleteInvite(int $id): void
    {
        $stmt = Db::conn()->prepare('DELETE FROM invite WHERE id = ? AND redeemed_at IS NULL');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            throw new ApiError(404, 'Diese Einladung gibt es nicht (mehr).');
        }
    }

    public static function listDevices(): array
    {
        $current = self::currentDevice();
        $rows = Db::conn()->query(
            'SELECT id, label, is_admin, created_at, last_seen_at, expires_at
             FROM device ORDER BY created_at'
        )->fetchAll();

        return array_map(static fn(array $r) => [
            'id'         => (int) $r['id'],
            'label'      => $r['label'],
            'isAdmin'    => (int) $r['is_admin'] === 1,
            'isCurrent'  => $current && (int) $current['id'] === (int) $r['id'],
            'createdAt'  => $r['created_at'],
            'lastSeenAt' => $r['last_seen_at'],
            'expiresAt'  => $r['expires_at'],
        ], $rows);
    }

    /** Zugang eines Geraets sofort entziehen. */
    public static function revokeDevice(int $id): void
    {
        $current = self::currentDevice();
        if ($current && (int) $current['id'] === $id) {
            throw new ApiError(409, 'Das eigene Geraet kann hier nicht entfernt werden – dafuer gibt es "Abmelden".');
        }

        $pdo = Db::conn();
        $total = (int) $pdo->query('SELECT COUNT(*) FROM device')->fetchColumn();
        if ($total <= 1) {
            throw new ApiError(409, 'Das letzte verbleibende Geraet kann nicht entfernt werden.');
        }

        $stmt = $pdo->prepare('DELETE FROM device WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            throw new ApiError(404, 'Dieses Geraet gibt es nicht (mehr).');
        }
    }

    /** Verwalterrecht setzen oder entziehen. */
    public static function setAdmin(int $id, bool $isAdmin): void
    {
        $pdo = Db::conn();
        if (!$isAdmin) {
            $admins = (int) $pdo->query('SELECT COUNT(*) FROM device WHERE is_admin = 1')->fetchColumn();
            $stmt = $pdo->prepare('SELECT is_admin FROM device WHERE id = ?');
            $stmt->execute([$id]);
            if ((int) $stmt->fetchColumn() === 1 && $admins <= 1) {
                throw new ApiError(409, 'Es muss mindestens ein Geraet mit Verwalterrecht bleiben.');
            }
        }

        $stmt = $pdo->prepare('UPDATE device SET is_admin = ? WHERE id = ?');
        $stmt->execute([$isAdmin ? 1 : 0, $id]);
        if ($stmt->rowCount() === 0) {
            throw new ApiError(404, 'Dieses Geraet gibt es nicht (mehr).');
        }
    }

    public static function deviceCount(): int
    {
        return (int) Db::conn()->query('SELECT COUNT(*) FROM device')->fetchColumn();
    }
}
