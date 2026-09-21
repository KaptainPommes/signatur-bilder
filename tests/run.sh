#!/usr/bin/env sh
# Startet einen Testserver mit eigener Konfiguration und frischer Datenbank,
# laesst die Schnittstellentests laufen und raeumt danach auf.
# Die echte api/config.php und die echten Daten bleiben unberuehrt.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
PORT=${PORT:-8910}
trap 'kill "${SERVER_PID:-}" 2>/dev/null || true; rm -rf "$WORK"' EXIT

cat > "$WORK/config.php" <<PHP
<?php
return [
    'admin_code'    => 'test-verwaltercode-0123456789abcdef',
    'db_path'       => '$WORK/test.sqlite',
    'require_https' => false,
];
PHP

FB_CONFIG="$WORK/config.php" php -S "127.0.0.1:$PORT" -t "$ROOT" "$ROOT/tests/router.php" \
    > "$WORK/server.log" 2>&1 &
SERVER_PID=$!

# Auf den Server warten, statt blind zu schlafen.
i=0
while [ $i -lt 50 ]; do
    if curl -sf "http://127.0.0.1:$PORT/api/session" > /dev/null 2>&1; then break; fi
    i=$((i + 1)); sleep 0.1
done

BASE_URL="http://127.0.0.1:$PORT/api" python3 "$ROOT/tests/api_test.py"
STATUS=$?

if grep -qiE "fatal error|uncaught" "$WORK/server.log"; then
    echo "PHP-Fehler im Serverprotokoll:"; grep -iE "fatal error|uncaught" "$WORK/server.log"
    STATUS=1
fi
exit $STATUS
