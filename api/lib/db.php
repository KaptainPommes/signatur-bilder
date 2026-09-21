<?php
declare(strict_types=1);

/**
 * Datenbankzugriff (SQLite via PDO) inklusive Schema-Verwaltung.
 *
 * Die Schemastaende werden ueber SQLite's `user_version` gefuehrt. Beim ersten
 * Zugriff nach einem Upload laeuft migrate() automatisch durch – es ist also
 * kein separater Installationsschritt noetig.
 */
final class Db
{
    private static ?PDO $pdo = null;

    public static function conn(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $path = Config::get('db_path');
        $dir = dirname($path);
        if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
            throw new RuntimeException('Datenverzeichnis kann nicht angelegt werden: ' . $dir);
        }

        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);

        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        // WAL beschleunigt parallele Zugriffe. Auf manchen Netzlaufwerken von
        // Shared-Hosting schlaegt es fehl – dann bleibt es beim Standardjournal.
        try {
            $pdo->exec('PRAGMA journal_mode = WAL');
        } catch (PDOException) {
            // bewusst ignoriert
        }

        self::$pdo = $pdo;
        self::migrate($pdo);

        return $pdo;
    }

    /** Aktuelle Schemaversion; bei Aenderungen hochzaehlen und Block ergaenzen. */
    private const SCHEMA_VERSION = 1;

    private static function migrate(PDO $pdo): void
    {
        $current = (int) $pdo->query('PRAGMA user_version')->fetchColumn();
        if ($current >= self::SCHEMA_VERSION) {
            return;
        }

        if ($current < 1) {
            $pdo->exec(<<<'SQL'
                CREATE TABLE person (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    name          TEXT NOT NULL,
                    birthdate     TEXT,
                    shoe_size     TEXT NOT NULL DEFAULT '',
                    clothing_size TEXT NOT NULL DEFAULT '',
                    trouser_size  TEXT NOT NULL DEFAULT '',
                    color         TEXT NOT NULL DEFAULT '',
                    created_at    TEXT NOT NULL,
                    updated_at    TEXT NOT NULL
                );

                -- Gemeinsame Liste: derselbe Name darf mehrfach vorkommen,
                -- solange die Art sich unterscheidet (Hausarzt UND Zahnarzt).
                CREATE TABLE doctor (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    kind       TEXT NOT NULL,
                    kind_key   TEXT NOT NULL,
                    name       TEXT NOT NULL,
                    name_key   TEXT NOT NULL,
                    street     TEXT NOT NULL DEFAULT '',
                    zip        TEXT NOT NULL DEFAULT '',
                    city       TEXT NOT NULL DEFAULT '',
                    phone      TEXT NOT NULL DEFAULT '',
                    email      TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX doctor_unique ON doctor (name_key, kind_key);

                CREATE TABLE allergy (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    label      TEXT NOT NULL,
                    label_key  TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE illness (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    label      TEXT NOT NULL,
                    label_key  TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL
                );

                -- Zuordnungen. ON DELETE CASCADE loescht beim Entfernen einer
                -- Person nur die Verknuepfung, nicht den gemeinsamen Eintrag.
                CREATE TABLE person_doctor (
                    person_id INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
                    doctor_id INTEGER NOT NULL REFERENCES doctor(id) ON DELETE CASCADE,
                    PRIMARY KEY (person_id, doctor_id)
                );
                CREATE TABLE person_allergy (
                    person_id  INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
                    allergy_id INTEGER NOT NULL REFERENCES allergy(id) ON DELETE CASCADE,
                    PRIMARY KEY (person_id, allergy_id)
                );
                CREATE TABLE person_illness (
                    person_id  INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
                    illness_id INTEGER NOT NULL REFERENCES illness(id) ON DELETE CASCADE,
                    PRIMARY KEY (person_id, illness_id)
                );

                CREATE TABLE medication (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    person_id INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
                    name      TEXT NOT NULL,
                    strength  TEXT NOT NULL DEFAULT '',
                    morning   TEXT NOT NULL DEFAULT '',
                    noon      TEXT NOT NULL DEFAULT '',
                    evening   TEXT NOT NULL DEFAULT '',
                    position  INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX medication_person ON medication (person_id, position);

                -- Zugang: Einladungslinks und die daraus entstandenen Geraete.
                CREATE TABLE invite (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    token_hash  TEXT NOT NULL UNIQUE,
                    label       TEXT NOT NULL,
                    make_admin  INTEGER NOT NULL DEFAULT 0,
                    created_at  TEXT NOT NULL,
                    expires_at  TEXT NOT NULL,
                    redeemed_at TEXT,
                    device_id   INTEGER
                );

                CREATE TABLE device (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    label        TEXT NOT NULL,
                    session_hash TEXT NOT NULL UNIQUE,
                    is_admin     INTEGER NOT NULL DEFAULT 0,
                    user_agent   TEXT NOT NULL DEFAULT '',
                    created_at   TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    expires_at   TEXT NOT NULL
                );

                -- Fehlversuche fuer die Sperre nach zu vielen Anlaeufen.
                CREATE TABLE auth_attempt (
                    id      INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip_hash TEXT NOT NULL,
                    at      TEXT NOT NULL
                );
                CREATE INDEX auth_attempt_lookup ON auth_attempt (ip_hash, at);
            SQL);
        }

        $pdo->exec('PRAGMA user_version = ' . self::SCHEMA_VERSION);
    }

    /** Fuehrt einen Schreibvorgang geschlossen aus – bei Fehlern bleibt nichts halb erledigt. */
    public static function transaction(callable $work): mixed
    {
        $pdo = self::conn();
        $pdo->beginTransaction();
        try {
            $result = $work($pdo);
            $pdo->commit();
            return $result;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    public static function now(): string
    {
        return gmdate('Y-m-d\TH:i:s\Z');
    }
}
