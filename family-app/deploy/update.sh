#!/usr/bin/env bash
#
# Familienbuch auf die neueste Version aktualisieren.
# Aufruf auf dem Server:  sudo bash /opt/familienbuch/family-app/deploy/update.sh
#
set -euo pipefail

BASE_DIR="/opt/familienbuch"
APP_DIR="${BASE_DIR}/family-app"
APP_USER="familienbuch"
BRANCH="claude/family-data-app-4uk4un"

[ "${EUID}" -eq 0 ] || { echo "Bitte als root ausführen: sudo bash update.sh"; exit 1; }

# Das Verzeichnis gehoert dem Benutzer familienbuch, git laeuft hier aber als
# root. Ohne diese Ausnahme verweigert git den Zugriff ("dubious ownership").
# Bewusst nur fuer diesen Aufruf, nicht dauerhaft in der globalen Konfiguration.
GIT=(git -c "safe.directory=${BASE_DIR}")

echo "==> Sicherheitskopie der Datenbank"
if [ -f "${APP_DIR}/data/family.db" ]; then
  mkdir -p /var/backups/familienbuch
  sqlite3 "${APP_DIR}/data/family.db" ".backup '/var/backups/familienbuch/family-vor-update-$(date +%Y-%m-%d_%H%M).db'"
fi

echo "==> Neue Version laden"
"${GIT[@]}" -C "${BASE_DIR}" fetch --depth 1 origin "${BRANCH}"
"${GIT[@]}" -C "${BASE_DIR}" checkout -B "${BRANCH}" "origin/${BRANCH}"

echo "==> Abhängigkeiten aktualisieren"
cd "${APP_DIR}"
npm install --omit=dev --no-audit --no-fund

chown -R "${APP_USER}:${APP_USER}" "${BASE_DIR}"

echo "==> App neu starten"
systemctl restart familienbuch
sleep 2
systemctl is-active --quiet familienbuch && echo "Fertig – die App läuft." || {
  echo "Die App startet nicht. Logs: journalctl -u familienbuch -n 50"
  exit 1
}
