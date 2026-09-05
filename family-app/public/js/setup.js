(async function () {
  // Wenn schon ein Konto existiert, ist die Ersteinrichtung nicht mehr erreichbar.
  const status = await fetch('/api/auth/status').then((r) => r.json());
  if (status.hasUsers) {
    window.location.replace('/login.html');
    return;
  }

  const form = document.getElementById('setup-form');
  const errorBox = document.getElementById('error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    const body = {
      displayName: form.displayName.value,
      username: form.username.value,
      password: form.password.value,
    };
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      errorBox.textContent = data.message || 'Einrichtung fehlgeschlagen.';
      errorBox.hidden = false;
      return;
    }
    window.location.replace('/');
  });
})();
