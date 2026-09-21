<?php
declare(strict_types=1);

/** Wird geworfen, wenn eine Anfrage regulaer abgelehnt wird (kein Programmfehler). */
final class ApiError extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        string $message,
        public readonly ?array $extra = null
    ) {
        parent::__construct($message);
    }
}

final class Http
{
    /** Gelesener und dekodierter JSON-Rumpf der Anfrage. */
    private static ?array $body = null;

    public static function sendHeaders(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: same-origin');
        header('X-Frame-Options: DENY');
        // Gesundheitsdaten gehoeren nicht in Zwischenspeicher.
        header('Cache-Control: no-store, private');
    }

    public static function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public static function isSecure(): bool
    {
        if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
            return true;
        }
        if (Config::get('trust_proxy')) {
            $proto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
            if (strtolower((string) $proto) === 'https') {
                return true;
            }
        }
        return false;
    }

    /**
     * Pfad der Anfrage relativ zum Einstiegsskript, z. B. "/persons/3".
     * So funktioniert die Installation auch in einem Unterordner.
     */
    public static function path(): string
    {
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $uri = rawurldecode($uri);

        // Basis ist der Ordner, in dem index.php liegt (…/api).
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
        if ($base !== '' && str_starts_with($uri, $base)) {
            $uri = substr($uri, strlen($base));
        }

        $uri = '/' . ltrim($uri, '/');
        // Ein direkter Aufruf von /api/index.php/... ebenfalls abfangen.
        if (str_starts_with($uri, '/index.php')) {
            $uri = substr($uri, strlen('/index.php'));
        }

        return rtrim($uri, '/') ?: '/';
    }

    public static function body(): array
    {
        if (self::$body !== null) {
            return self::$body;
        }

        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            return self::$body = [];
        }
        if (strlen($raw) > 512 * 1024) {
            throw new ApiError(413, 'Die gesendeten Daten sind zu gross.');
        }

        try {
            $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new ApiError(400, 'Die Anfrage enthaelt kein gueltiges JSON.');
        }

        return self::$body = is_array($decoded) ? $decoded : [];
    }

    /**
     * Schutz vor Anfragen, die eine fremde Seite im Namen des angemeldeten
     * Geraets ausloest. SameSite=Lax verhindert das bereits fuer POST & Co.;
     * die Herkunftspruefung ist die zweite, unabhaengige Absicherung.
     */
    public static function assertSameOrigin(): void
    {
        $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? null;
        if ($site !== null) {
            if (in_array($site, ['same-origin', 'none'], true)) {
                return;
            }
            throw new ApiError(403, 'Anfrage von einer fremden Herkunft abgelehnt.');
        }

        // Aeltere Browser kennen Sec-Fetch-Site nicht – dann Origin pruefen.
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin === '') {
            return;
        }
        $expected = (self::isSecure() ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? '');
        if (!hash_equals($expected, $origin)) {
            throw new ApiError(403, 'Anfrage von einer fremden Herkunft abgelehnt.');
        }
    }

    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function fail(int $status, string $message, ?array $extra = null): never
    {
        http_response_code($status);
        echo json_encode(['error' => $message] + ($extra ?? []), JSON_UNESCAPED_UNICODE);
        exit;
    }

    /**
     * Gehashte Herkunft fuer die Fehlversuchssperre – ohne IP-Adressen zu speichern.
     *
     * Grundlage ist REMOTE_ADDR, weil diese Angabe vom Webserver stammt und
     * nicht vom Aufrufer. X-Forwarded-For waere frei waehlbar: mit einem neuen
     * Wert je Anfrage bekaeme ein Angreifer jedes Mal einen frischen Zaehler
     * und koennte den Verwaltercode unbegrenzt durchprobieren.
     *
     * Nur wenn sicher ein Vermittler davorsteht, darf client_ip_header gesetzt
     * werden. Dann zaehlt der LETZTE Eintrag der Liste – den hat der Vermittler
     * selbst angehaengt, alles davor kann der Aufrufer erfunden haben.
     */
    public static function clientKey(): string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

        $header = Config::get('client_ip_header');
        if (is_string($header) && $header !== '' && !empty($_SERVER[$header])) {
            $parts = array_filter(array_map('trim', explode(',', (string) $_SERVER[$header])));
            if ($parts) {
                $ip = (string) end($parts);
            }
        }

        return hash('sha256', 'fb|' . $ip);
    }
}

/** Eingabepruefung mit sprechenden Fehlermeldungen. */
final class Input
{
    public static function text(array $src, string $key, int $max, bool $required = false, string $label = null): string
    {
        $label ??= $key;
        $value = $src[$key] ?? '';
        if (is_int($value) || is_float($value)) {
            $value = (string) $value;
        }
        if (!is_string($value)) {
            throw new ApiError(400, sprintf('%s muss Text sein.', $label));
        }

        // Steuerzeichen entfernen, Zeilenumbrueche in Einzelfeldern eingeschlossen.
        $value = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $value) ?? '');
        $value = preg_replace('/\s{2,}/u', ' ', $value) ?? $value;

        if ($required && $value === '') {
            throw new ApiError(422, sprintf('%s darf nicht leer sein.', $label));
        }
        if (mb_strlen($value) > $max) {
            throw new ApiError(422, sprintf('%s ist zu lang (hoechstens %d Zeichen).', $label, $max));
        }
        return $value;
    }

    /** Datum im Format JJJJ-MM-TT; leer ist erlaubt. */
    public static function date(array $src, string $key, string $label = 'Geburtsdatum'): string
    {
        $value = trim((string) ($src[$key] ?? ''));
        if ($value === '') {
            return '';
        }
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if (!$parsed || $parsed->format('Y-m-d') !== $value) {
            throw new ApiError(422, $label . ' ist kein gueltiges Datum.');
        }
        $year = (int) $parsed->format('Y');
        if ($year < 1900 || $parsed > new DateTimeImmutable('tomorrow')) {
            throw new ApiError(422, $label . ' liegt ausserhalb des erlaubten Bereichs.');
        }
        return $value;
    }

    /** Liste von Datensatz-Kennungen (positive ganze Zahlen), ohne Dubletten. */
    public static function ids(array $src, string $key, int $max, string $label): array
    {
        $value = $src[$key] ?? [];
        if (!is_array($value)) {
            throw new ApiError(400, $label . ' muss eine Liste sein.');
        }
        $ids = [];
        foreach ($value as $item) {
            if (!is_int($item) && !(is_string($item) && ctype_digit($item))) {
                throw new ApiError(400, $label . ' enthaelt einen ungueltigen Eintrag.');
            }
            $id = (int) $item;
            if ($id > 0) {
                $ids[$id] = true;
            }
        }
        $ids = array_keys($ids);
        if (count($ids) > $max) {
            throw new ApiError(422, sprintf('Zu viele Eintraege bei %s (hoechstens %d).', $label, $max));
        }
        return $ids;
    }

    public static function email(array $src, string $key, int $max = 120): string
    {
        $value = self::text($src, $key, $max, false, 'E-Mail');
        if ($value !== '' && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
            throw new ApiError(422, 'Die E-Mail-Adresse ist ungueltig.');
        }
        return $value;
    }
}
