// Where the sign-up and password emails land. The email link checks the
// person's address at Supabase and then opens this page; it says plainly
// whether that worked and hands the sign-in on to the app. The sign-in
// details travel in the address after "#", which never reaches our server;
// only the script in the person's browser reads it, to pass it to the app.

import { MARK } from './home';

export const AUTH_CONFIRM_PATH = '/cuenta/confirmada';
export const AUTH_CONFIRM_SCRIPT_PATH = '/cuenta/confirmada.js';

export const AUTH_CONFIRM_PAGE = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Vorian</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
      font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; color: #e8eef7;
      background: radial-gradient(900px 520px at 50% -10%, #1d3b66 0%, transparent 62%), linear-gradient(180deg, #121821, #0d1119 60%, #0a0d13); }
    main { width: min(100%, 420px); text-align: center; padding: 34px 26px 28px; border-radius: 26px;
      background: linear-gradient(180deg, rgba(211,216,224,0.14), rgba(211,216,224,0.04));
      border: 1px solid rgba(200,215,235,0.18); border-top-color: rgba(230,240,255,0.38);
      box-shadow: 0 24px 60px rgba(0,0,0,0.35); }
    .mark { display: block; margin: 0 auto 6px; }
    .word { letter-spacing: 9px; font-weight: 700; font-size: 18px; margin: 0 0 22px; padding-left: 9px; color: #e8eef7; }
    .icon { width: 58px; height: 58px; border-radius: 50%; margin: 0 auto 14px; display: grid; place-items: center; font-size: 28px; }
    .ok { background: rgba(74,222,128,0.16); color: #4ADE80; }
    .bad { background: rgba(242,115,95,0.16); color: #F2735F; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    p { margin: 0 0 18px; line-height: 1.55; color: #c5d0e0; }
    a.button { display: block; padding: 15px 18px; border-radius: 999px; color: #fff; font-weight: 600; text-decoration: none;
      background: linear-gradient(135deg, #5B9BFF, #2563EB); }
    .hint { margin: 16px 0 0; font-size: 13px; color: #93a3ba; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
<main>
  ${MARK.replace('width="88" height="94"', 'class="mark" width="56" height="60"')}
  <p class="word">VORIAN</p>

  <section id="ok" hidden>
    <div class="icon ok" aria-hidden="true">&#10003;</div>
    <h1 id="ok-title">Tu correo está confirmado</h1>
    <p id="ok-text">Tu cuenta de Vorian ya está activa.</p>
    <a class="button" id="open" href="ping://auth/callback">Abrir Vorian</a>
    <p class="hint" id="ok-hint">¿Estás en el computador? Abre Vorian en tu teléfono y entra con tu correo y contraseña.</p>
  </section>

  <section id="bad" hidden>
    <div class="icon bad" aria-hidden="true">!</div>
    <h1>Este enlace ya no sirve</h1>
    <p>Puede que haya vencido o que ya lo hayas usado. Si ya confirmaste tu correo, entra a Vorian con tu correo y contraseña. Si no, pide otro correo desde la app.</p>
    <a class="button" href="ping://auth/callback">Abrir Vorian</a>
  </section>

  <noscript><h1>Tu correo está confirmado</h1><p>Ya puedes entrar a Vorian con tu correo y contraseña.</p></noscript>
</main>
<script src="${AUTH_CONFIRM_SCRIPT_PATH}"></script>
</body>
</html>`;

// Kept in its own file so the page's security rules can keep blocking inline scripts.
export const AUTH_CONFIRM_SCRIPT = `(function () {
  var hash = window.location.hash || '';
  var search = window.location.search || '';
  var params = new URLSearchParams(hash.slice(1) + '&' + search.slice(1));
  var failed = params.get('error') || params.get('error_code');
  var recovery = params.get('type') === 'recovery';
  document.getElementById(failed ? 'bad' : 'ok').hidden = false;
  if (failed) return;
  if (recovery) {
    document.getElementById('ok-title').textContent = 'Elige tu nueva contraseña';
    document.getElementById('ok-text').textContent = 'Abre Vorian en este teléfono para escribir tu nueva contraseña.';
    document.getElementById('ok-hint').textContent = 'Abre este enlace desde el correo en tu teléfono, donde tienes Vorian.';
  }
  var appLink = 'ping://auth/callback' + search + hash;
  document.getElementById('open').href = appLink;
  // On a phone with Vorian installed, go straight into the app, already signed in.
  if (/Android|iPhone|iPad/i.test(navigator.userAgent)) window.location.href = appLink;
  // Keep the sign-in details out of the browser history.
  if (hash || search) history.replaceState(null, '', window.location.pathname);
})();
`;
