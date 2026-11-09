// The page an invitation link opens. WhatsApp shows its title and picture as
// the link preview; the button hands the invitation to the app, which then
// connects the person with whoever sent it. It shows the inviter's first name
// and nothing else about them.

import { MARK } from './home';

const ANDROID_PACKAGE = 'com.carloschiloe.ping';

const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function firstNameOf(fullName: string | null | undefined): string | null {
    const first = (fullName ?? '').trim().split(/\s+/)[0]?.slice(0, 40);
    return first ? first : null;
}

/** Where the button points: Android's intent form opens the app reliably from WhatsApp. */
export function appLinkFor(token: string | null, android: boolean): string {
    const path = token ? `invite?token=${token}` : 'invite';
    if (!android) return `ping:///${path}`;
    const fallback = encodeURIComponent(`https://vorian.app/invite${token ? `/${token}` : ''}`);
    return `intent://${path}#Intent;scheme=ping;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

export function invitePage(input: { firstName: string | null; token: string | null; android: boolean; expired?: boolean }): string {
    const name = input.firstName ? escapeHtml(input.firstName) : null;
    const title = name ? `${name} te invitó a Vorian` : 'Te invitaron a Vorian';
    const lead = name
        ? `Abre Vorian y quedarás conectado con ${name} para conversar.`
        : 'Vorian ayuda a conversar y a cumplir lo que acuerdas.';
    const url = `https://vorian.app/invite${input.token ? `/${input.token}` : ''}`;
    const body = input.expired
        ? `<h1>Esta invitación venció</h1>
  <p class="lead">Pide a quien te invitó que te envíe un enlace nuevo.</p>`
        : `<h1>${title}</h1>
  <p class="lead">${lead}</p>
  <a class="open" href="${escapeHtml(appLinkFor(input.token, input.android))}">Abrir Vorian</a>
  <p class="hint">Si todavía no tienes Vorian, instálala, crea tu cuenta y vuelve a tocar este enlace.</p>`;
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${title}</title>
  <meta name="description" content="${lead}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Vorian">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${lead}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="https://vorian.app/marca/vorian.png">
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; color: #e8eef7;
      background: radial-gradient(900px 520px at 50% -10%, #234a80 0%, transparent 60%), linear-gradient(180deg, #0e1a33, #0b1428 70%, #0a1226); }
    main { width: min(92vw, 420px); box-sizing: border-box; margin: 24px 0; padding: 32px 24px; text-align: center; border-radius: 26px;
      background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03)); border: 1px solid rgba(200,215,235,0.20); border-top-color: rgba(230,240,255,0.38); }
    .word { font-size: 13px; letter-spacing: 8px; color: #b9c7da; margin: 12px 0 0; }
    h1 { font-size: 27px; line-height: 1.2; margin: 18px 0 10px; }
    .lead { margin: 0 0 24px; color: #c4cfdf; line-height: 1.55; }
    .open { display: block; padding: 15px 18px; border-radius: 16px; color: #fff; font-weight: 700; text-decoration: none;
      background: linear-gradient(180deg, #4f93f7, #1d4ed8); box-shadow: 0 10px 26px rgba(29,78,216,0.35), inset 0 1px 0 rgba(255,255,255,0.35); }
    .hint { margin: 18px 0 0; font-size: 13px; color: #93a3ba; line-height: 1.5; }
  </style>
</head>
<body><main>
  ${MARK}
  <p class="word">VORIAN</p>
  ${body}
</main></body>
</html>`;
}
