<?php
declare(strict_types=1);

/**
 * Fachlicher Datenzugriff: Personen, Aerzte, Allergien, Krankheiten, Medikation.
 *
 * Leitgedanke ist die Wiederverwendung: Aerzte, Allergien und Krankheiten
 * liegen in gemeinsamen Listen und werden Personen nur zugeordnet. Ein bereits
 * vorhandener Eintrag wird beim erneuten Anlegen daher nicht als Fehler
 * behandelt, sondern schlicht zurueckgegeben.
 */
final class Repo
{
    public const MAX_DOCTORS_PER_PERSON = 50;
    public const MAX_TAGS_PER_PERSON = 100;   // Allergien und Krankheiten zusammen
    public const MAX_MEDICATIONS = 30;

    /** Farben fuer das Namenskuerzel-Symbol, der Reihe nach vergeben. */
    private const COLORS = [
        '#1f7a74', '#8a4f9e', '#b8562f', '#2f6ab8', '#7a8a2f',
        '#a83a5b', '#3f7a3f', '#8a6b2f', '#4b5bbf', '#2f7a8a'
    ];

    /* --- Schluessel und Sortierung ------------------------------------------ */

    /** Vergleichsschluessel: Gross-/Kleinschreibung und Leerraum egal. */
    public static function key(string $value): string
    {
        $value = preg_replace('/\s+/u', ' ', trim($value)) ?? $value;
        return mb_strtolower($value, 'UTF-8');
    }

    /**
     * Sortierschluessel nach deutscher Woerterbuchordnung (DIN 5007-1):
     * Umlaute zaehlen wie der Grundvokal, ß wie ss.
     */
    private static function sortKey(string $value): string
    {
        return strtr(self::key($value), [
            'ä' => 'a', 'ö' => 'o', 'ü' => 'u', 'ß' => 'ss',
            'á' => 'a', 'à' => 'a', 'é' => 'e', 'è' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u',
        ]);
    }

    private static function sortByName(array $rows, string $field = 'name', ?string $tie = null): array
    {
        usort($rows, static function (array $a, array $b) use ($field, $tie) {
            $cmp = strcmp(self::sortKey((string) $a[$field]), self::sortKey((string) $b[$field]));
            if ($cmp === 0 && $tie !== null) {
                $cmp = strcmp(self::sortKey((string) $a[$tie]), self::sortKey((string) $b[$tie]));
            }
            return $cmp;
        });
        return $rows;
    }

    /* --- Gesamtbestand ------------------------------------------------------- */

    /**
     * Kompletter Datenbestand in einer Antwort. Bei einer Handvoll Personen ist
     * das schneller und einfacher als viele Einzelabfragen – die Oberflaeche
     * bekommt alles, was sie fuer Uebersicht, Leseansicht und Formular braucht.
     */
    public static function snapshot(): array
    {
        $pdo = Db::conn();

        $doctors = array_map(self::mapDoctor(...), $pdo->query('SELECT * FROM doctor')->fetchAll());
        $doctors = self::sortByName($doctors, 'name', 'kind');

        $allergies = array_map(self::mapLabel(...), $pdo->query('SELECT * FROM allergy')->fetchAll());
        $allergies = self::sortByName($allergies, 'label');

        $illnesses = array_map(self::mapLabel(...), $pdo->query('SELECT * FROM illness')->fetchAll());
        $illnesses = self::sortByName($illnesses, 'label');

        // Personen in der Reihenfolge ihrer Anlage.
        $persons = $pdo->query('SELECT * FROM person ORDER BY id')->fetchAll();

        $links = [
            'doctorIds'  => self::groupLinks('person_doctor', 'doctor_id'),
            'allergyIds' => self::groupLinks('person_allergy', 'allergy_id'),
            'illnessIds' => self::groupLinks('person_illness', 'illness_id'),
        ];
        $meds = self::groupMedications();

        $persons = array_map(static function (array $row) use ($links, $meds) {
            $id = (int) $row['id'];
            return [
                'id'         => $id,
                'name'       => $row['name'],
                'birthdate'  => $row['birthdate'] ?? '',
                'color'      => $row['color'],
                'sizes'      => [
                    'shoe'     => $row['shoe_size'],
                    'clothing' => $row['clothing_size'],
                    'trousers' => $row['trouser_size'],
                ],
                'doctorIds'  => $links['doctorIds'][$id] ?? [],
                'allergyIds' => $links['allergyIds'][$id] ?? [],
                'illnessIds' => $links['illnessIds'][$id] ?? [],
                'medications' => $meds[$id] ?? [],
                'updatedAt'  => $row['updated_at'],
            ];
        }, $persons);

        return [
            'persons'   => $persons,
            'doctors'   => $doctors,
            'allergies' => $allergies,
            'illnesses' => $illnesses,
            // Vorschlaege fuer das Medikamentenfeld.
            'medicationNames' => array_values(array_map(
                static fn(array $r) => $r['name'],
                $pdo->query('SELECT DISTINCT name FROM medication ORDER BY name')->fetchAll()
            )),
        ];
    }

    private static function groupLinks(string $table, string $column): array
    {
        $out = [];
        foreach (Db::conn()->query("SELECT person_id, {$column} AS ref FROM {$table}")->fetchAll() as $row) {
            $out[(int) $row['person_id']][] = (int) $row['ref'];
        }
        return $out;
    }

    private static function groupMedications(): array
    {
        $out = [];
        $rows = Db::conn()->query('SELECT * FROM medication ORDER BY person_id, position, id')->fetchAll();
        foreach ($rows as $row) {
            $out[(int) $row['person_id']][] = [
                'name'     => $row['name'],
                'strength' => $row['strength'],
                'morning'  => $row['morning'],
                'noon'     => $row['noon'],
                'evening'  => $row['evening'],
            ];
        }
        return $out;
    }

    private static function mapDoctor(array $r): array
    {
        return [
            'id'     => (int) $r['id'],
            'kind'   => $r['kind'],
            'name'   => $r['name'],
            'street' => $r['street'],
            'zip'    => $r['zip'],
            'city'   => $r['city'],
            'phone'  => $r['phone'],
            'email'  => $r['email'],
        ];
    }

    private static function mapLabel(array $r): array
    {
        return ['id' => (int) $r['id'], 'label' => $r['label']];
    }

    /* --- Personen ------------------------------------------------------------ */

    public static function savePerson(?int $id, array $body): int
    {
        $name = Input::text($body, 'name', 120, true, 'Name');
        $birthdate = Input::date($body, 'birthdate');
        $shoe = Input::text($body, 'shoeSize', 20, false, 'Schuhgroesse');
        $clothing = Input::text($body, 'clothingSize', 20, false, 'Kleidergroesse');
        $trousers = Input::text($body, 'trouserSize', 30, false, 'Hosengroesse');

        $doctorIds = Input::ids($body, 'doctorIds', self::MAX_DOCTORS_PER_PERSON, 'Aerzte');
        $allergyIds = Input::ids($body, 'allergyIds', self::MAX_TAGS_PER_PERSON, 'Allergien');
        $illnessIds = Input::ids($body, 'illnessIds', self::MAX_TAGS_PER_PERSON, 'Krankheiten');

        if (count($allergyIds) + count($illnessIds) > self::MAX_TAGS_PER_PERSON) {
            throw new ApiError(422, sprintf(
                'Allergien und Krankheiten zusammen duerfen hoechstens %d Eintraege umfassen.',
                self::MAX_TAGS_PER_PERSON
            ));
        }

        $medications = self::readMedications($body);

        return Db::transaction(static function (PDO $pdo) use (
            $id, $name, $birthdate, $shoe, $clothing, $trousers,
            $doctorIds, $allergyIds, $illnessIds, $medications
        ) {
            $now = Db::now();

            if ($id === null) {
                $count = (int) $pdo->query('SELECT COUNT(*) FROM person')->fetchColumn();
                $color = self::COLORS[$count % count(self::COLORS)];
                $pdo->prepare(
                    'INSERT INTO person (name, birthdate, shoe_size, clothing_size, trouser_size, color, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                )->execute([$name, $birthdate, $shoe, $clothing, $trousers, $color, $now, $now]);
                $id = (int) $pdo->lastInsertId();
            } else {
                $stmt = $pdo->prepare(
                    'UPDATE person SET name = ?, birthdate = ?, shoe_size = ?, clothing_size = ?,
                            trouser_size = ?, updated_at = ? WHERE id = ?'
                );
                $stmt->execute([$name, $birthdate, $shoe, $clothing, $trousers, $now, $id]);
                if ($stmt->rowCount() === 0) {
                    $exists = $pdo->prepare('SELECT 1 FROM person WHERE id = ?');
                    $exists->execute([$id]);
                    if (!$exists->fetchColumn()) {
                        throw new ApiError(404, 'Diese Person gibt es nicht (mehr).');
                    }
                }
            }

            self::replaceLinks($pdo, 'person_doctor', 'doctor_id', 'doctor', $id, $doctorIds, 'Arzt');
            self::replaceLinks($pdo, 'person_allergy', 'allergy_id', 'allergy', $id, $allergyIds, 'Allergie');
            self::replaceLinks($pdo, 'person_illness', 'illness_id', 'illness', $id, $illnessIds, 'Krankheit');

            $pdo->prepare('DELETE FROM medication WHERE person_id = ?')->execute([$id]);
            $insert = $pdo->prepare(
                'INSERT INTO medication (person_id, name, strength, morning, noon, evening, position)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($medications as $position => $med) {
                $insert->execute([
                    $id, $med['name'], $med['strength'],
                    $med['morning'], $med['noon'], $med['evening'], $position,
                ]);
            }

            return $id;
        });
    }

    /** Zuordnungen vollstaendig ersetzen; unbekannte Kennungen werden abgewiesen. */
    private static function replaceLinks(
        PDO $pdo, string $table, string $column, string $target, int $personId, array $ids, string $label
    ): void {
        $pdo->prepare("DELETE FROM {$table} WHERE person_id = ?")->execute([$personId]);
        if (!$ids) {
            return;
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $check = $pdo->prepare("SELECT COUNT(*) FROM {$target} WHERE id IN ({$placeholders})");
        $check->execute($ids);
        if ((int) $check->fetchColumn() !== count($ids)) {
            throw new ApiError(422, sprintf('Mindestens ein ausgewaehlter Eintrag (%s) existiert nicht.', $label));
        }

        $insert = $pdo->prepare("INSERT INTO {$table} (person_id, {$column}) VALUES (?, ?)");
        foreach ($ids as $id) {
            $insert->execute([$personId, $id]);
        }
    }

    private static function readMedications(array $body): array
    {
        $rows = $body['medications'] ?? [];
        if (!is_array($rows)) {
            throw new ApiError(400, 'Die Medikation muss eine Liste sein.');
        }
        if (count($rows) > self::MAX_MEDICATIONS) {
            throw new ApiError(422, sprintf('Hoechstens %d Medikamentenzeilen je Person.', self::MAX_MEDICATIONS));
        }

        $out = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                throw new ApiError(400, 'Eine Medikamentenzeile ist fehlerhaft aufgebaut.');
            }
            $name = Input::text($row, 'name', 120, false, 'Medikament');
            if ($name === '') {
                continue;   // leere Zeilen aus dem Formular still verwerfen
            }
            $out[] = [
                'name'     => $name,
                'strength' => Input::text($row, 'strength', 60, false, 'Dosierung'),
                'morning'  => Input::text($row, 'morning', 40, false, 'Menge morgens'),
                'noon'     => Input::text($row, 'noon', 40, false, 'Menge mittags'),
                'evening'  => Input::text($row, 'evening', 40, false, 'Menge abends'),
            ];
        }
        return $out;
    }

    public static function deletePerson(int $id): void
    {
        // Aerzte, Allergien und Krankheiten bleiben in den gemeinsamen Listen;
        // ON DELETE CASCADE raeumt nur die Zuordnungen und die Medikation weg.
        $stmt = Db::conn()->prepare('DELETE FROM person WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            throw new ApiError(404, 'Diese Person gibt es nicht (mehr).');
        }
    }

    /* --- Aerzte --------------------------------------------------------------- */

    private static function readDoctor(array $body): array
    {
        return [
            'kind'   => Input::text($body, 'kind', 60, true, 'Art'),
            'name'   => Input::text($body, 'name', 120, true, 'Name der Praxis'),
            'street' => Input::text($body, 'street', 120, false, 'Strasse'),
            'zip'    => Input::text($body, 'zip', 10, false, 'PLZ'),
            'city'   => Input::text($body, 'city', 80, false, 'Ort'),
            'phone'  => Input::text($body, 'phone', 40, false, 'Telefon'),
            'email'  => Input::email($body, 'email'),
        ];
    }

    /**
     * Arzt anlegen – oder den vorhandenen zurueckgeben, wenn es ihn mit
     * derselben Art bereits gibt. Bewusst kein Fehler (siehe Klassenkommentar).
     */
    public static function createDoctor(array $body): array
    {
        $d = self::readDoctor($body);
        $nameKey = self::key($d['name']);
        $kindKey = self::key($d['kind']);

        $stmt = Db::conn()->prepare('SELECT * FROM doctor WHERE name_key = ? AND kind_key = ?');
        $stmt->execute([$nameKey, $kindKey]);
        if ($existing = $stmt->fetch()) {
            return ['doctor' => self::mapDoctor($existing), 'created' => false];
        }

        $now = Db::now();
        Db::conn()->prepare(
            'INSERT INTO doctor (kind, kind_key, name, name_key, street, zip, city, phone, email, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $d['kind'], $kindKey, $d['name'], $nameKey,
            $d['street'], $d['zip'], $d['city'], $d['phone'], $d['email'], $now, $now,
        ]);

        $id = (int) Db::conn()->lastInsertId();
        return ['doctor' => self::mapDoctor($d + ['id' => $id]), 'created' => true];
    }

    public static function updateDoctor(int $id, array $body): array
    {
        $d = self::readDoctor($body);
        $nameKey = self::key($d['name']);
        $kindKey = self::key($d['kind']);

        $clash = Db::conn()->prepare('SELECT id FROM doctor WHERE name_key = ? AND kind_key = ? AND id <> ?');
        $clash->execute([$nameKey, $kindKey, $id]);
        if ($clash->fetchColumn()) {
            throw new ApiError(409, 'Diesen Eintrag gibt es mit derselben Art bereits.');
        }

        $stmt = Db::conn()->prepare(
            'UPDATE doctor SET kind = ?, kind_key = ?, name = ?, name_key = ?, street = ?, zip = ?,
                    city = ?, phone = ?, email = ?, updated_at = ? WHERE id = ?'
        );
        $stmt->execute([
            $d['kind'], $kindKey, $d['name'], $nameKey,
            $d['street'], $d['zip'], $d['city'], $d['phone'], $d['email'], Db::now(), $id,
        ]);

        $check = Db::conn()->prepare('SELECT * FROM doctor WHERE id = ?');
        $check->execute([$id]);
        $row = $check->fetch();
        if (!$row) {
            throw new ApiError(404, 'Diesen Arzt gibt es nicht (mehr).');
        }
        return self::mapDoctor($row);
    }

    /* --- Allergien und Krankheiten -------------------------------------------- */

    /** @param 'allergy'|'illness' $table */
    public static function createLabel(string $table, array $body): array
    {
        $label = Input::text($body, 'label', 100, true, 'Bezeichnung');
        $key = self::key($label);

        $stmt = Db::conn()->prepare("SELECT * FROM {$table} WHERE label_key = ?");
        $stmt->execute([$key]);
        if ($existing = $stmt->fetch()) {
            return ['entry' => self::mapLabel($existing), 'created' => false];
        }

        Db::conn()->prepare("INSERT INTO {$table} (label, label_key, created_at) VALUES (?, ?, ?)")
            ->execute([$label, $key, Db::now()]);

        return [
            'entry'   => ['id' => (int) Db::conn()->lastInsertId(), 'label' => $label],
            'created' => true,
        ];
    }

    /** @param 'allergy'|'illness' $table */
    public static function updateLabel(string $table, int $id, array $body): array
    {
        $label = Input::text($body, 'label', 100, true, 'Bezeichnung');
        $key = self::key($label);

        $clash = Db::conn()->prepare("SELECT id FROM {$table} WHERE label_key = ? AND id <> ?");
        $clash->execute([$key, $id]);
        if ($clash->fetchColumn()) {
            throw new ApiError(409, 'Diese Bezeichnung gibt es bereits.');
        }

        $stmt = Db::conn()->prepare("UPDATE {$table} SET label = ?, label_key = ? WHERE id = ?");
        $stmt->execute([$label, $key, $id]);

        $check = Db::conn()->prepare("SELECT * FROM {$table} WHERE id = ?");
        $check->execute([$id]);
        $row = $check->fetch();
        if (!$row) {
            throw new ApiError(404, 'Diesen Eintrag gibt es nicht (mehr).');
        }
        return self::mapLabel($row);
    }
}
