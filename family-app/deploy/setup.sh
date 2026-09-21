#!/usr/bin/env bash
#
# Familienbuch – Ersteinrichtung auf einem frischen Ubuntu-/Debian-Server.
#
# Aufruf auf dem Server (als root):
#   bash setup.sh familie.meine-domain.de
#
# Das Skript richtet ein:
#   - Node.js 22
#   - die App unter /opt/familienbuch, laufend als eigener Benutzer
#   - automatischen Start beim Booten (systemd)
#   - Caddy als Webserver mit automatischem HTTPS
#   - Firewall (nur SSH, 80, 443 offen)
#   - tägliches Backup der Datenbank
#
set -euo pipefail

REPO_URL="https://github.com/KaptainPommes/signatur-bilder.git"
BRANCH="claude/family-data-app-4uk4un"
BASE_DIR="/opt/familienbuch"
APP_DIR="${BASE_DIR}/family-app"
APP_USER="familienbuch"
APP_PORT="3000"

info() { echo -e "\n\033[1;32m==>\033[0m $*"; }
warn() { echo -e "\n\033[1;33m!!\033[0m $*"; }
fail() { echo -e "\n\033[1;31mFehler:\033[0m $*" >&2; exit 1; }

# --- Vorprüfungen -----------------------------------------------------------

[ "${EUID}" -eq 0 ] || fail "Bitte als root ausführen:  sudo bash setup.sh <domain>"
command -v apt-get >/dev/null || fail "Dieses Skript ist für Ubuntu oder Debian gemacht."

# Zwei Betriebsarten:
#   setup.sh familie.example.de   -> Server im Internet, Caddy holt ein
#                                    HTTPS-Zertifikat, Firewall wird gesetzt
#   setup.sh --lokal              -> Heimserver: nur im Heimnetz bzw. über
#                                    WireGuard erreichbar, kein Caddy,
#                                    Firewall bleibt unangetastet
LOCAL=0
DOMAIN="${1:-}"
if [ "${DOMAIN}" = "--lokal" ] || [ "${DOMAIN}" = "--local" ]; then
  LOCAL=1
  DOMAIN=""
fi

# Beim Aufruf über "curl ... | bash" ist stdin das Skript selbst, deshalb
# wird die Eingabe direkt vom Terminal gelesen.
if [ "${LOCAL}" -eq 0 ] && [ -z "${DOMAIN}" ] && [ -r /dev/tty ]; then
  echo "Unter welcher Adresse soll das Familienbuch erreichbar sein?"
  echo "Beispiel: familie.meine-domain.de"
  echo "Für einen Heimserver stattdessen abbrechen (Strg+C) und neu starten mit:"
  echo "    bash setup.sh --lokal"
  read -rp "Adresse: " DOMAIN < /dev/tty
fi

# --- Pakete -----------------------------------------------------------------

info "System aktualisieren und Grundpakete installieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg sqlite3 ufw debian-keyring debian-archive-keyring apt-transport-https

info "Node.js installieren"
# Die App nutzt das eingebaute SQLite von Node (ab 22.5). Statt nur die
# Hauptversion zu vergleichen, wird direkt geprüft, ob das Modul lädt –
# Node 22.0 bis 22.4 hat es noch nicht.
node_ok() { node -e 'require("node:sqlite")' >/dev/null 2>&1; }

# Zuerst das Paket der Distribution versuchen: aktuelle Ubuntu-Versionen
# liefern Node 22+ selbst mit, und ein Fremd-Repository kennt brandneue
# Releases oft noch nicht.
if ! node_ok; then
  apt-get install -y -qq nodejs npm >/dev/null 2>&1 || true
fi

if ! node_ok; then
  info "Node aus der Distribution passt nicht – Version 22 von NodeSource holen"
  apt-get purge -y -qq nodejs npm >/dev/null 2>&1 || true
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

node_ok || fail "Es konnte kein Node.js mit eingebautem SQLite (ab 22.5) installiert werden. Gefunden: $(node --version 2>/dev/null || echo 'keines')"
command -v npm >/dev/null || apt-get install -y -qq npm
node --version

# --- Benutzer und Code ------------------------------------------------------

info "Systembenutzer '${APP_USER}' anlegen"
id -u "${APP_USER}" >/dev/null 2>&1 || useradd --system --home "${BASE_DIR}" --shell /usr/sbin/nologin "${APP_USER}"

info "Code nach ${BASE_DIR} holen"
# Bei einem erneuten Lauf gehoert das Verzeichnis bereits dem Benutzer
# familienbuch; git als root braucht dann diese Ausnahme.
if [ -d "${BASE_DIR}/.git" ]; then
  git -c "safe.directory=${BASE_DIR}" -C "${BASE_DIR}" fetch --depth 1 origin "${BRANCH}"
  git -c "safe.directory=${BASE_DIR}" -C "${BASE_DIR}" checkout -B "${BRANCH}" "origin/${BRANCH}"
else
  git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${BASE_DIR}"
fi

info "Abhängigkeiten installieren"
cd "${APP_DIR}"
npm install --omit=dev --no-audit --no-fund

# --- Konfiguration ----------------------------------------------------------

if [ ! -f "${APP_DIR}/.env" ]; then
  info "Konfiguration (.env) mit zufälligem Sicherheitsschlüssel anlegen"
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  COOKIE_SECURE="true"
  [ -z "${DOMAIN}" ] && COOKIE_SECURE="false"
  cat > "${APP_DIR}/.env" <<EOF
PORT=${APP_PORT}
SESSION_SECRET=${SECRET}
COOKIE_SECURE=${COOKIE_SECURE}
EOF
  chmod 600 "${APP_DIR}/.env"
else
  info "Vorhandene .env bleibt unverändert"
fi

mkdir -p "${APP_DIR}/data"
chown -R "${APP_USER}:${APP_USER}" "${BASE_DIR}"

# --- Dienst (systemd) -------------------------------------------------------

info "Dienst einrichten, damit die App dauerhaft läuft"
cat > /etc/systemd/system/familienbuch.service <<EOF
[Unit]
Description=Familienbuch
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}/data

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now familienbuch
sleep 2
systemctl is-active --quiet familienbuch || fail "Die App startet nicht. Logs ansehen mit: journalctl -u familienbuch -n 50"

# --- Webserver (Caddy) ------------------------------------------------------

if [ "${LOCAL}" -eq 1 ]; then
  info "Heimserver-Modus: kein Caddy, kein Zertifikat, Firewall bleibt unverändert"
else

info "Caddy installieren (Webserver mit automatischem HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi

[ -f /etc/caddy/Caddyfile ] && [ ! -f /etc/caddy/Caddyfile.bak ] && cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak

if [ -n "${DOMAIN}" ]; then
  cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
	encode gzip
	reverse_proxy 127.0.0.1:${APP_PORT}
}
EOF
else
  warn "Ohne Adresse läuft die App nur über unverschlüsseltes HTTP."
  cat > /etc/caddy/Caddyfile <<EOF
:80 {
	encode gzip
	reverse_proxy 127.0.0.1:${APP_PORT}
}
EOF
fi

systemctl reload caddy || systemctl restart caddy

# --- Firewall ---------------------------------------------------------------
# Nur im Internet-Modus. Auf einem Heimserver wird an einer bestehenden
# Firewall-Konfiguration nichts verändert.

info "Firewall einrichten"
SSH_PORT="$(grep -oP '^\s*Port\s+\K[0-9]+' /etc/ssh/sshd_config 2>/dev/null | head -1 || true)"
SSH_PORT="${SSH_PORT:-22}"
ufw allow "${SSH_PORT}/tcp" >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
echo "Offen: SSH (${SSH_PORT}), 80, 443"

fi  # Ende Internet-Modus

# --- Backup -----------------------------------------------------------------

info "Tägliches Backup der Datenbank einrichten"
mkdir -p /var/backups/familienbuch
cat > /etc/cron.daily/familienbuch-backup <<EOF
#!/bin/sh
# Sichert die Familienbuch-Datenbank und behält die letzten 14 Tage.
[ -f "${APP_DIR}/data/family.db" ] || exit 0
sqlite3 "${APP_DIR}/data/family.db" ".backup '/var/backups/familienbuch/family-\$(date +%Y-%m-%d).db'"
find /var/backups/familienbuch -name 'family-*.db' -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/familienbuch-backup

# --- Fertig -----------------------------------------------------------------

if [ -n "${DOMAIN}" ]; then
  URL="https://${DOMAIN}"
elif [ "${LOCAL}" -eq 1 ]; then
  # Ohne Caddy spricht man die App direkt auf ihrem Port an.
  URL="http://$(hostname -I | awk '{print $1}'):${APP_PORT}"
else
  URL="http://$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
fi

cat <<EOF

============================================================
  Fertig!

  Euer Familienbuch läuft jetzt unter:
      ${URL}

  Ruft die Adresse im Browser auf und legt dort euer erstes
  Konto an. Das zweite Konto für deine Frau könnt ihr danach
  direkt in der App anlegen (Button oben rechts).

  Nützliche Befehle:
    systemctl status familienbuch     Läuft die App?
    systemctl restart familienbuch    App neu starten
    journalctl -u familienbuch -n 50  Letzte Meldungen
    bash ${APP_DIR}/deploy/update.sh  Auf neue Version aktualisieren

  Backups liegen unter /var/backups/familienbuch
============================================================

EOF

if [ -n "${DOMAIN}" ]; then
  echo "Hinweis: Das HTTPS-Zertifikat holt Caddy automatisch. Das klappt nur,"
  echo "wenn ${DOMAIN} tatsächlich auf diesen Server zeigt. Falls die Seite"
  echo "nicht lädt, ein bis zwei Minuten warten und erneut probieren."
  echo
fi

if [ "${LOCAL}" -eq 1 ]; then
  cat <<EOF
WICHTIG – Backup:
Ein vorhandenes restic-Backup, das nur /etc und /home sichert, erfasst
${APP_DIR}/data NICHT. Entweder in /usr/local/bin/backup.sh den Pfad
ergänzen:

    restic backup /etc /home ${APP_DIR}/data --exclude-caches

oder die tägliche Kopie unter /var/backups/familienbuch mitsichern
(die legt dieses Skript automatisch an).

Von unterwegs erreichbar ist die App über WireGuard – dieselbe Adresse,
sobald der Tunnel aktiv ist.

EOF
fi
