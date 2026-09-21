#!/usr/bin/env sh
# Startet einen Testserver mit eigener Konfiguration und frischer Datenbank,
# laesst die Tests laufen und raeumt danach auf.
# Die echte api/config.php und die echten Daten bleiben unberuehrt.
#
#   sh tests/run.sh           Schnittstelle und, falls vorhanden, Oberflaeche
#   sh tests/run.sh api       nur die Schnittstelle
#
# Der Oberflaechentest braucht Playwright:
#   npm install playwright && npx playwright install chromium
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
PORT=${PORT:-8910}
CODE='test-verwaltercode-0123456789abcdef'
ONLY=${1:-alle}
trap 'kill "${SERVER_PID:-}" 2>/dev/null || true; rm -rf "$WORK"' EXIT

start_server() {
    rm -f "$WORK/test.sqlite" "$WORK/test.sqlite-wal" "$WORK/test.sqlite-shm"
    cat > "$WORK/config.php" <<PHP
<?php
return [
    'admin_code'    => '$CODE',
    'db_path'       => '$WORK/test.sqlite',
    'require_https' => false,
];
PHP
    FB_CONFIG="$WORK/config.php" php -S "127.0.0.1:$PORT" -t "$ROOT" "$ROOT/tests/router.php" \
        > "$WORK/server.log" 2>&1 &
    SERVER_PID=$!

    # Auf den Server warten, statt blind zu schlafen.
    i=0
    while [ $i -lt 60 ]; do
        if curl -sf "http://127.0.0.1:$PORT/api/session" > /dev/null 2>&1; then return 0; fi
        i=$((i + 1)); sleep 0.1
    done
    echo "Testserver ist nicht gestartet:"; cat "$WORK/server.log"; return 1
}

stop_server() {
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
}

STATUS=0

echo "=== Schnittstelle ==="
start_server
BASE_URL="http://127.0.0.1:$PORT/api" python3 "$ROOT/tests/api_test.py" || STATUS=1
stop_server

if [ "$ONLY" != "api" ]; then
    if node -e "require.resolve('playwright')" > /dev/null 2>&1; then
        echo
        echo "=== Oberflaeche ==="
        start_server   # frische Datenbank, der Test legt eigene Daten an
        BASE_URL="http://127.0.0.1:$PORT/" ADMIN_CODE="$CODE" \
            node "$ROOT/tests/ui_test.mjs" || STATUS=1
        stop_server
    else
        echo
        echo "Oberflaechentest uebersprungen (Playwright nicht installiert)."
        echo "Zum Nachruesten:  npm install playwright && npx playwright install chromium"
    fi
fi

if grep -qiE "fatal error|uncaught" "$WORK/server.log" 2>/dev/null; then
    echo "PHP-Fehler im Serverprotokoll:"
    grep -iE "fatal error|uncaught" "$WORK/server.log"
    STATUS=1
fi

exit $STATUS
