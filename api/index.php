<?php
declare(strict_types=1);

/**
 * Familienbuch – Einstiegspunkt der Schnittstelle.
 *
 * Alle Aufrufe unterhalb von /api/ landen hier (siehe .htaccess im Wurzel-
 * verzeichnis). Die Antwort ist immer JSON.
 */

require __DIR__ . '/lib/config.php';
require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/repo.php';

Http::sendHeaders();

try {
    Config::load();

    if (Config::get('require_https') && !Http::isSecure()) {
        throw new ApiError(403, 'Diese Anwendung ist nur ueber HTTPS erreichbar.');
    }

    $method = Http::method();
    $path = Http::path();

    if ($method === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    // Schreibende Zugriffe zusaetzlich gegen fremde Herkunft absichern.
    if (!in_array($method, ['GET', 'HEAD'], true)) {
        Http::assertSameOrigin();
    }

    $body = in_array($method, ['GET', 'HEAD', 'DELETE'], true) ? [] : Http::body();

    /** Zahl aus einem Pfad wie /persons/12 holen. */
    $idFrom = static function (string $pattern, string $path): ?int {
        if (preg_match('#^' . $pattern . '/(\d+)$#', $path, $m) === 1) {
            return (int) $m[1];
        }
        return null;
    };

    /* --- Zugang ----------------------------------------------------------- */

    if ($path === '/session' && $method === 'GET') {
        $device = Auth::currentDevice();
        Http::json([
            'authenticated' => $device !== null,
            'setupNeeded'   => Auth::deviceCount() === 0,
            'device'        => $device ? [
                'id'      => (int) $device['id'],
                'label'   => $device['label'],
                'isAdmin' => (int) $device['is_admin'] === 1,
            ] : null,
            'limits' => [
                'doctorsPerPerson' => Repo::MAX_DOCTORS_PER_PERSON,
                'tagsPerPerson'    => Repo::MAX_TAGS_PER_PERSON,
                'medications'      => Repo::MAX_MEDICATIONS,
            ],
        ]);
    }

    if ($path === '/auth/redeem' && $method === 'POST') {
        $token = Input::text($body, 'token', 200, true, 'Einladungscode');
        Http::json(['device' => Auth::redeem($token)]);
    }

    if ($path === '/auth/admin' && $method === 'POST') {
        $code = Input::text($body, 'code', 200, true, 'Verwaltercode');
        $label = Input::text($body, 'label', 80, false, 'Bezeichnung');
        Http::json(['device' => Auth::adminLogin($code, $label)]);
    }

    if ($path === '/auth/logout' && $method === 'POST') {
        Auth::logout();
        Http::json(['ok' => true]);
    }

    /* --- Einladungen und Geraete (nur Verwaltung) -------------------------- */

    if ($path === '/invites') {
        if ($method === 'GET') {
            Auth::requireAdmin();
            Http::json(['invites' => Auth::listInvites()]);
        }
        if ($method === 'POST') {
            Auth::requireAdmin();
            $label = Input::text($body, 'label', 80, true, 'Bezeichnung');
            $makeAdmin = !empty($body['makeAdmin']);
            Http::json(['invite' => Auth::createInvite($label, $makeAdmin)], 201);
        }
    }

    if (($id = $idFrom('/invites', $path)) !== null && $method === 'DELETE') {
        Auth::requireAdmin();
        Auth::deleteInvite($id);
        Http::json(['ok' => true]);
    }

    if ($path === '/devices' && $method === 'GET') {
        Auth::requireAdmin();
        Http::json(['devices' => Auth::listDevices()]);
    }

    if (($id = $idFrom('/devices', $path)) !== null) {
        if ($method === 'DELETE') {
            Auth::requireAdmin();
            Auth::revokeDevice($id);
            Http::json(['ok' => true]);
        }
        if ($method === 'PATCH') {
            Auth::requireAdmin();
            if (!array_key_exists('isAdmin', $body)) {
                throw new ApiError(400, 'Es wurde nichts zum Aendern uebergeben.');
            }
            Auth::setAdmin($id, (bool) $body['isAdmin']);
            Http::json(['ok' => true]);
        }
    }

    /* --- Daten -------------------------------------------------------------- */

    if ($path === '/data' && $method === 'GET') {
        Auth::require();
        Http::json(Repo::snapshot());
    }

    if ($path === '/persons' && $method === 'POST') {
        Auth::require();
        $id = Repo::savePerson(null, $body);
        Http::json(['id' => $id] + Repo::snapshot(), 201);
    }

    if (($id = $idFrom('/persons', $path)) !== null) {
        if ($method === 'PUT') {
            Auth::require();
            Repo::savePerson($id, $body);
            Http::json(['id' => $id] + Repo::snapshot());
        }
        if ($method === 'DELETE') {
            Auth::require();
            Repo::deletePerson($id);
            Http::json(Repo::snapshot());
        }
    }

    if ($path === '/doctors' && $method === 'POST') {
        Auth::require();
        $result = Repo::createDoctor($body);
        Http::json($result, $result['created'] ? 201 : 200);
    }

    if (($id = $idFrom('/doctors', $path)) !== null && $method === 'PUT') {
        Auth::require();
        Http::json(['doctor' => Repo::updateDoctor($id, $body)]);
    }

    foreach (['allergies' => 'allergy', 'illnesses' => 'illness'] as $route => $table) {
        if ($path === '/' . $route && $method === 'POST') {
            Auth::require();
            $result = Repo::createLabel($table, $body);
            Http::json($result, $result['created'] ? 201 : 200);
        }
        if (($id = $idFrom('/' . $route, $path)) !== null && $method === 'PUT') {
            Auth::require();
            Http::json(['entry' => Repo::updateLabel($table, $id, $body)]);
        }
    }

    throw new ApiError(404, 'Diese Adresse gibt es nicht.');
} catch (ApiError $e) {
    Http::fail($e->status, $e->getMessage(), $e->extra);
} catch (Throwable $e) {
    // Einzelheiten nur ins Fehlerprotokoll, nie an den Browser.
    error_log('[familienbuch] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    Http::fail(500, 'Auf dem Server ist ein Fehler aufgetreten.');
}
