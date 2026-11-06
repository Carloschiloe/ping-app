// Public legal pages: privacy policy, terms and how to delete an account.
// Google Play needs each one at a public HTTPS address, and Chile's Ley
// 21.719 asks for this information to be clear and always reachable. They
// hold no user data and need no sign-in.

export const LEGAL_OWNER = 'Marvex';
export const LEGAL_CONTACT = 'carlos@marvex.cl';
const UPDATED = '5 de noviembre de 2026';

function page(title: string, body: string): string {
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · Vorian</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; color: #e8eef7;
      background: radial-gradient(1200px 600px at 20% -10%, #1d3b66 0%, transparent 60%), linear-gradient(180deg, #0d1626, #101a2c 60%, #0f1828); min-height: 100vh; }
    main { max-width: 760px; margin: 0 auto; padding: 32px 18px 64px; }
    .card { background: linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03)); border: 1px solid rgba(200,215,235,0.18);
      border-top-color: rgba(230,240,255,0.35); border-radius: 20px; padding: 24px 22px; }
    h1 { font-size: 26px; margin: 0 0 4px; } h2 { font-size: 18px; color: #8fc2ff; margin: 28px 0 8px; }
    p, li { line-height: 1.6; color: #d3dceb; } ul { padding-left: 20px; }
    .muted { color: #93a3ba; font-size: 14px; } a { color: #8fc2ff; }
    nav { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 22px; font-size: 14px; }
  </style>
</head>
<body><main><div class="card">
<h1>${title}</h1>
<p class="muted">Vorian · ${LEGAL_OWNER} · Actualizada el ${UPDATED}</p>
${body}
<nav><a href="/privacidad">Privacidad</a><a href="/terminos">Términos</a><a href="/cuenta/eliminar">Eliminar cuenta</a></nav>
</div></main></body>
</html>`;
}

const mail = `<a href="mailto:${LEGAL_CONTACT}">${LEGAL_CONTACT}</a>`;

export const PRIVACY_PAGE = page('Política de privacidad', `
<p>Esta política explica qué datos personales trata la aplicación Vorian, para qué, con quién se comparten y cómo puedes ejercer tus derechos, conforme a la Ley N° 19.628 y su modificación por la Ley N° 21.719 sobre protección de datos personales de Chile.</p>

<h2>1. Quién es el responsable</h2>
<p>El responsable del tratamiento es ${LEGAL_OWNER}. Para cualquier consulta sobre tus datos escribe a ${mail}.</p>

<h2>2. Qué datos tratamos</h2>
<ul>
  <li><strong>Cuenta:</strong> número de teléfono o correo con que te registras, nombre, foto y portada de perfil.</li>
  <li><strong>Lo que compartes en los chats:</strong> mensajes, notas de voz, fotos, videos, archivos, ubicación cuando decides enviarla, reacciones y llamadas.</li>
  <li><strong>Compromisos y recordatorios</strong> que creas o que Vorian detecta en tus conversaciones, y lo que le pides a Vorian que recuerde.</li>
  <li><strong>Contactos del teléfono:</strong> solo si das permiso. Se usan para mostrarte qué contactos ya usan Vorian. No guardamos tu libreta de contactos.</li>
  <li><strong>Calendario:</strong> solo si conectas tu cuenta de Google Calendar.</li>
  <li><strong>Datos técnicos:</strong> identificador para enviarte avisos, versión de la app y registros de seguridad del servidor (por ejemplo, intentos fallidos de inicio de sesión).</li>
</ul>
<p>Vorian no muestra publicidad, no vende datos y no usa herramientas de seguimiento publicitario.</p>

<h2>3. Para qué los usamos y con qué base</h2>
<ul>
  <li>Prestarte el servicio de mensajería, llamadas, compromisos y asistente: es necesario para cumplir el contrato que aceptas al usar Vorian.</li>
  <li>Contactos, micrófono, cámara, ubicación y calendario: solo con tu consentimiento, que puedes retirar en cualquier momento desde los ajustes del teléfono o de la app.</li>
  <li>Proteger la cuenta, prevenir abusos y revisar denuncias: interés legítimo en mantener un servicio seguro.</li>
  <li>Cumplir obligaciones legales cuando una autoridad competente lo requiera.</li>
</ul>

<h2>4. Inteligencia artificial</h2>
<p>Vorian usa un servicio de inteligencia artificial (OpenAI) para resumir chats, detectar compromisos, transcribir notas de voz y responder lo que le preguntas. Solo se envía el contenido necesario para cada tarea. Según las condiciones de ese proveedor, estos datos no se usan para entrenar sus modelos. Las respuestas de Vorian pueden contener errores: revísalas antes de actuar. Vorian no toma por sí sola decisiones que produzcan efectos jurídicos sobre ti. Puedes denunciar cualquier respuesta inadecuada desde la propia app.</p>

<h2>5. Con quién se comparten</h2>
<p>Tus mensajes los ven las personas de cada chat. Además, usamos proveedores que tratan datos por encargo nuestro y solo para prestar el servicio:</p>
<ul>
  <li>Supabase (base de datos, archivos e inicio de sesión).</li>
  <li>Render (servidor de la aplicación).</li>
  <li>OpenAI (funciones de inteligencia artificial).</li>
  <li>Agora (llamadas de voz y video).</li>
  <li>Expo (envío de avisos al teléfono).</li>
  <li>Google, solo si conectas tu calendario.</li>
</ul>
<p>Algunos de estos proveedores están fuera de Chile, principalmente en Estados Unidos. Estas transferencias internacionales se hacen bajo contratos que exigen niveles de protección adecuados.</p>

<h2>6. Cuánto tiempo los guardamos</h2>
<ul>
  <li>Mientras tu cuenta esté activa.</li>
  <li>Si eliminas tu cuenta, tus datos personales se borran de inmediato del servicio y de las copias de respaldo en un plazo máximo de 30 días. Los mensajes que enviaste a otras personas siguen visibles para ellas, sin tu nombre ni tu foto, como «Cuenta eliminada».</li>
  <li>Las denuncias y los registros de seguridad se guardan hasta 12 meses, salvo que la ley exija un plazo mayor.</li>
</ul>

<h2>7. Tus derechos</h2>
<p>Puedes pedir en cualquier momento: <strong>acceso</strong> a tus datos, <strong>rectificación</strong> de datos inexactos, <strong>supresión</strong>, <strong>oposición</strong> a un tratamiento, <strong>portabilidad</strong> (una copia en formato de uso común) y <strong>bloqueo</strong> temporal de tus datos. También puedes oponerte a decisiones basadas únicamente en tratamiento automatizado.</p>
<p>Dentro de la app, en Perfil, puedes corregir tus datos, <strong>descargar una copia de tus datos</strong> y eliminar tu cuenta. Para lo demás escribe a ${mail} desde el correo o indicando el teléfono con que te registraste. Responderemos en un plazo máximo de 30 días corridos. Si no quedas conforme, puedes reclamar ante la Agencia de Protección de Datos Personales.</p>

<h2>8. Seguridad</h2>
<p>Las conexiones van cifradas, los archivos se guardan de forma privada y solo se abren con enlaces temporales, cada persona accede solo a sus propios chats y las claves del servidor nunca están en la app. Si ocurre un incidente que afecte tus datos, lo informaremos a la Agencia de Protección de Datos Personales y, cuando corresponda, a las personas afectadas.</p>

<h2>9. Menores de edad</h2>
<p>Vorian no está dirigida a menores de 14 años y no deben crear una cuenta. Si sabemos que un menor de 14 años se registró, eliminaremos su cuenta.</p>

<h2>10. Cambios</h2>
<p>Si cambiamos esta política te avisaremos dentro de la app antes de que los cambios rijan.</p>
`);

export const TERMS_PAGE = page('Términos de uso', `
<p>Al crear una cuenta o usar Vorian aceptas estos términos. Si no estás de acuerdo, no uses la aplicación.</p>

<h2>1. El servicio</h2>
<p>Vorian es una aplicación de mensajería con un asistente que ayuda a recordar compromisos y resumir conversaciones. La presta ${LEGAL_OWNER}. Podemos mejorar, cambiar o suspender funciones avisando con anticipación razonable.</p>

<h2>2. Tu cuenta</h2>
<ul>
  <li>Debes tener al menos 14 años.</li>
  <li>Eres responsable de lo que se haga desde tu cuenta y de mantener seguro tu teléfono.</li>
  <li>Puedes eliminar tu cuenta cuando quieras desde Perfil.</li>
</ul>

<h2>3. Uso aceptable</h2>
<p>No está permitido usar Vorian para:</p>
<ul>
  <li>Acosar, amenazar, discriminar o suplantar a otras personas.</li>
  <li>Enviar spam, estafas o contenido ilegal, sexual con menores o que incite a la violencia.</li>
  <li>Compartir datos personales de terceros sin su permiso.</li>
  <li>Intentar acceder a cuentas o sistemas ajenos, o interferir con el servicio.</li>
</ul>
<p>Puedes bloquear y denunciar a cualquier persona o mensaje. Revisamos las denuncias y podemos suspender o eliminar cuentas que incumplan estas reglas.</p>

<h2>4. Tu contenido</h2>
<p>Lo que envías sigue siendo tuyo. Nos das permiso solo para guardarlo, transmitirlo y procesarlo con el fin de prestarte el servicio, como se explica en la <a href="/privacidad">Política de privacidad</a>.</p>

<h2>5. El asistente Vorian</h2>
<p>Las respuestas, resúmenes y compromisos que propone Vorian se generan de forma automática y pueden contener errores. No reemplazan asesoría profesional. Revísalos antes de tomar decisiones importantes.</p>

<h2>6. Responsabilidad</h2>
<p>Hacemos lo posible por que Vorian funcione de forma continua y segura, pero no podemos garantizar que no haya interrupciones. En lo que la ley permita, no respondemos por daños indirectos derivados del uso del servicio. Nada de esto limita los derechos que te otorga la Ley N° 19.496 sobre protección de los derechos de los consumidores.</p>

<h2>7. Ley aplicable</h2>
<p>Estos términos se rigen por las leyes de Chile. Para consultas o reclamos escribe a ${mail}.</p>
`);

export const DELETE_ACCOUNT_PAGE = page('Eliminar tu cuenta de Vorian', `
<h2>Desde la app (inmediato)</h2>
<ul>
  <li>Abre Vorian y entra a <strong>Perfil</strong>.</li>
  <li>Toca <strong>Eliminar mi cuenta</strong> al final de la pantalla.</li>
  <li>Escribe <strong>ELIMINAR</strong> para confirmar.</li>
</ul>

<h2>Sin la app</h2>
<p>Escribe a ${mail} con el asunto «Eliminar mi cuenta». Indica el teléfono o correo con que te registraste. Para proteger tu cuenta te pediremos confirmar que eres tú. Eliminaremos tu cuenta en un plazo máximo de 30 días corridos.</p>

<h2>Qué se elimina</h2>
<ul>
  <li>Tu nombre, teléfono, correo, foto y portada.</li>
  <li>Tu conversación con Vorian, lo que le pediste recordar y tu calendario conectado.</li>
  <li>Tus contactos guardados, reacciones y avisos.</li>
  <li>Tu acceso: ya no podrás entrar con esa cuenta. Podrás crear una nueva con el mismo número cuando quieras.</li>
</ul>

<h2>Qué se mantiene</h2>
<p>Los mensajes y compromisos que compartiste con otras personas siguen visibles para ellas, porque también son parte de su historial. Aparecen como «Cuenta eliminada», sin tu nombre ni tu foto. Las denuncias se guardan hasta 12 meses por seguridad. Las copias de respaldo se borran en un máximo de 30 días.</p>
`);
