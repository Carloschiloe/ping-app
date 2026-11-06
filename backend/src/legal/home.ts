// Public home page at vorian.app. Google Play and anyone who types the
// address see what Vorian is, who is behind it and where the legal pages
// are. It holds no user data and needs no sign-in.

import { LEGAL_CONTACT, LEGAL_OWNER } from './pages';

const MARK = `<svg viewBox="250 270 524 560" width="88" height="94" aria-hidden="true">
  <defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.45" stop-color="#D9E2EE"/><stop offset="1" stop-color="#8FA3BF"/></linearGradient>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93C5FD"/><stop offset="0.5" stop-color="#3B82F6"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient>
    <radialGradient id="p" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.35" stop-color="#BFDBFE"/><stop offset="1" stop-color="#3B82F6" stop-opacity="0"/></radialGradient>
  </defs>
  <path d="M250 270 L370 270 L548 700 L488 812 Z" fill="url(#s)"/>
  <path d="M774 270 L654 270 L476 700 L536 812 Z" fill="url(#b)"/>
  <circle cx="512" cy="780" r="70" fill="url(#p)"/>
</svg>`;

export const HOME_PAGE = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vorian · Conversaciones que se convierten en compromisos cumplidos</title>
  <meta name="description" content="Vorian identifica los acuerdos de tus conversaciones, los registra como compromisos y te acompaña en su seguimiento hasta que se cumplan.">
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; color: #e8eef7;
      background: radial-gradient(1100px 620px at 50% -10%, #234a80 0%, transparent 60%), linear-gradient(180deg, #0e1a33, #0b1428 70%, #0a1226); min-height: 100vh; }
    main { max-width: 880px; margin: 0 auto; padding: 56px 18px 48px; text-align: center; }
    .word { font-size: 15px; letter-spacing: 9px; color: #b9c7da; margin: 18px 0 0; }
    h1 { font-size: clamp(30px, 5.4vw, 46px); line-height: 1.12; margin: 18px auto 14px; max-width: 720px; }
    .lead { font-size: 18px; line-height: 1.6; color: #c4cfdf; max-width: 620px; margin: 0 auto; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 44px 0 0; text-align: left; }
    .card { background: linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03)); border: 1px solid rgba(200,215,235,0.18);
      border-top-color: rgba(230,240,255,0.35); border-radius: 20px; padding: 20px; }
    .card h2 { font-size: 17px; color: #8fc2ff; margin: 0 0 6px; } .card p { margin: 0; line-height: 1.55; color: #d3dceb; font-size: 15px; }
    .soon { display: inline-block; margin-top: 36px; padding: 10px 18px; border-radius: 999px; border: 1px solid rgba(143,194,255,0.45); color: #cfe3ff; font-size: 15px; }
    footer { margin-top: 56px; color: #93a3ba; font-size: 14px; line-height: 1.8; }
    footer a { color: #8fc2ff; margin: 0 8px; }
  </style>
</head>
<body><main>
  ${MARK}
  <p class="word">VORIAN</p>
  <h1>Conversaciones que se convierten en compromisos cumplidos</h1>
  <p class="lead">Vorian es un asistente de mensajería que identifica los acuerdos de tus conversaciones, los registra como compromisos y te acompaña en su seguimiento hasta que se cumplan.</p>
  <div class="grid">
    <div class="card"><h2>Compromisos detectados</h2><p>Reconoce tareas, plazos y reuniones en tus mensajes. Tú decides si confirmarlos o descartarlos.</p></div>
    <div class="card"><h2>Seguimiento oportuno</h2><p>Te avisa antes de cada vencimiento y te resume el día para que nada quede pendiente.</p></div>
    <div class="card"><h2>Privacidad primero</h2><p>Sin publicidad ni venta de datos. Puedes descargar o eliminar tu información cuando quieras.</p></div>
  </div>
  <span class="soon">Próximamente en Google Play</span>
  <footer>
    <div>Vorian es un producto de ${LEGAL_OWNER} · <a href="mailto:${LEGAL_CONTACT}" style="margin:0">${LEGAL_CONTACT}</a></div>
    <div><a href="/privacidad">Privacidad</a><a href="/terminos">Términos</a><a href="/cuenta/eliminar">Eliminar cuenta</a></div>
  </footer>
</main></body>
</html>`;
