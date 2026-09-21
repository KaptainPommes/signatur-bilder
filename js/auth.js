/* ==========================================================================
   auth.js – Magic-Link / Token-Handling (Client-Seite)
   --------------------------------------------------------------------------
   ACHTUNG, Stand dieses Schrittes:
   Es gibt noch KEINEN Server, der Tokens prueft. Dieser Baustein legt nur
   die Client-Haelfte, damit der Rest der App bereits dagegen entwickelt ist:

     1. Einladungslink der Form  https://…/#token=<zufall>  wird geoeffnet
     2. Token wandert nach localStorage, die URL wird sofort bereinigt
        (damit er nicht im Verlauf, in Screenshots oder im Teilen-Dialog landet)
     3. Bei jedem Start wird er – sobald ENDPOINT gesetzt ist – serverseitig
        geprueft; erst dann ist es echter Zugriffsschutz.

   Solange ENDPOINT null ist, laeuft die App im Offline-/Einzelgeraet-Modus.
   ========================================================================== */

const Auth = (() => {
  const TOKEN_KEY = 'familienakte.token';
  const DEVICE_KEY = 'familienakte.device';
  const CHECKED_KEY = 'familienakte.lastCheck';

  /** Sobald das Backend steht, hier die Pruef-URL eintragen, z. B. '/api/session'. */
  const ENDPOINT = null;

  /** Wie lange eine erfolgreiche Serverpruefung gilt, bevor erneut geprueft wird. */
  const RECHECK_AFTER_MS = 12 * 60 * 60 * 1000;

  function read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function write(key, value) {
    try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* Privatmodus */ }
  }

  /** Stabile, zufaellige Geraetekennung – erlaubt spaeter gezielten Entzug. */
  function deviceId() {
    let id = read(DEVICE_KEY);
    if (!id) {
      id = (self.crypto && self.crypto.randomUUID)
        ? self.crypto.randomUUID()
        : 'd-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      write(DEVICE_KEY, id);
    }
    return id;
  }

  /**
   * Token aus der URL uebernehmen. Unterstuetzt `#token=…` (bevorzugt, da
   * Fragmente nicht an den Server gehen und nicht in Zugriffslogs auftauchen)
   * sowie `?token=…` als Rueckfallebene fuer Mailprogramme, die Fragmente
   * beim Verlinken verschlucken.
   */
  function claimFromUrl() {
    const url = new URL(location.href);
    const fromHash = new URLSearchParams(url.hash.replace(/^#/, '')).get('token');
    const fromQuery = url.searchParams.get('token');
    const token = (fromHash || fromQuery || '').trim();
    if (!token) return null;

    write(TOKEN_KEY, token);
    write(CHECKED_KEY, null);

    // URL bereinigen, ohne einen neuen Verlaufseintrag anzulegen.
    url.searchParams.delete('token');
    url.hash = '';
    history.replaceState(null, '', url.pathname + url.search);
    return token;
  }

  const api = {
    get endpoint() { return ENDPOINT; },

    /** true, sobald ueberhaupt ein Token vorliegt (ohne Serverpruefung). */
    hasToken() { return Boolean(read(TOKEN_KEY)); },

    token() { return read(TOKEN_KEY); },

    deviceId,

    /** Token verwerfen – „von diesem Geraet abmelden“. */
    forget() {
      write(TOKEN_KEY, null);
      write(CHECKED_KEY, null);
    },

    /**
     * Beim App-Start aufrufen.
     * @returns {Promise<{state:'open'|'ok'|'missing'|'rejected'|'offline'}>}
     *   open      – kein Backend konfiguriert, App laeuft ungeschuetzt lokal
     *   ok        – Token vom Server bestaetigt
     *   missing   – kein Token vorhanden, Einladungslink noetig
     *   rejected  – Server hat das Token abgelehnt (abgelaufen/entzogen)
     *   offline   – Server nicht erreichbar, zuletzt bestaetigtes Token gilt weiter
     */
    async start() {
      claimFromUrl();

      if (!ENDPOINT) return { state: 'open' };
      if (!api.hasToken()) return { state: 'missing' };

      const last = Number(read(CHECKED_KEY) || 0);
      if (Date.now() - last < RECHECK_AFTER_MS) return { state: 'ok' };

      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: api.token(), device: deviceId() })
        });
        if (res.status === 401 || res.status === 403) {
          api.forget();
          return { state: 'rejected' };
        }
        if (!res.ok) return { state: 'offline' };
        write(CHECKED_KEY, String(Date.now()));
        return { state: 'ok' };
      } catch {
        // Netzwerkfehler: eine einmal bestaetigte Installation darf offline weiterlaufen.
        return { state: last ? 'ok' : 'offline' };
      }
    }
  };

  return api;
})();
