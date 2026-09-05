(async function () {
  const status = await fetch('/api/auth/status').then((r) => r.json());
  if (!status.hasUsers) {
    window.location.replace('/setup.html');
    return;
  }

  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    const body = { username: form.username.value, password: form.password.value };
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      errorBox.textContent = data.message || 'Anmeldung fehlgeschlagen.';
      errorBox.hidden = false;
      return;
    }
    window.location.replace('/');
  });
})();
