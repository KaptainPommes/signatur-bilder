/* ==========================================================================
   api.js – Zugriff auf die Schnittstelle unter /api
   --------------------------------------------------------------------------
   Die Anmeldung steckt in einem httpOnly-Cookie, das der Browser von selbst
   mitschickt. Hier gibt es daher bewusst keinerlei Umgang mit Token – ausser
   beim einmaligen Einloesen eines Einladungslinks.
   ========================================================================== */

class AuthError extends Error {}
class OfflineError extends Error {}

const Api = (() => {

  /** Basisadresse, relativ zur aufrufenden Seite – funktioniert auch im Unterordner. */
  const base = location.pathname.replace(/\/[^/]*$/, '') + '/api';

  async function call(method, path, body) {
    let response;
    try {
      response = await fetch(base + path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new OfflineError('Keine Verbindung zum Server.');
    }

    if (response.status === 204) return {};

    let data = {};
    try {
      data = await response.json();
    } catch {
      if (response.ok) return {};
      throw new Error('Unerwartete Antwort vom Server.');
    }

    if (response.status === 401) {
      throw new AuthError(data.error || 'Nicht angemeldet.');
    }
    if (!response.ok) {
      throw new Error(data.error || 'Die Anfrage ist fehlgeschlagen.');
    }

    // Wurde die Antwort vom Service Worker aus dem Zwischenspeicher bedient?
    if (response.headers.get('X-Aus-Zwischenspeicher') === '1') {
      data.fromCache = true;
    }
    return data;
  }

  return {
    session:       ()            => call('GET', '/session'),
    redeem:        token         => call('POST', '/auth/redeem', { token }),
    adminLogin:    (code, label) => call('POST', '/auth/admin', { code, label }),
    logout:        ()            => call('POST', '/auth/logout', {}),

    data:          ()            => call('GET', '/data'),
    createPerson:  person        => call('POST', '/persons', person),
    updatePerson:  (id, person)  => call('PUT', `/persons/${id}`, person),
    deletePerson:  id            => call('DELETE', `/persons/${id}`),

    createDoctor:  doctor        => call('POST', '/doctors', doctor),
    updateDoctor:  (id, doctor)  => call('PUT', `/doctors/${id}`, doctor),
    createAllergy: label         => call('POST', '/allergies', { label }),
    createIllness: label         => call('POST', '/illnesses', { label }),

    invites:       ()            => call('GET', '/invites'),
    createInvite:  (label, makeAdmin) => call('POST', '/invites', { label, makeAdmin }),
    deleteInvite:  id            => call('DELETE', `/invites/${id}`),
    devices:       ()            => call('GET', '/devices'),
    revokeDevice:  id            => call('DELETE', `/devices/${id}`),
  };
})();
