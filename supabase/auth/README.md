# Auth de staging

Configuración objetivo para los correos de confirmación de `Ping Staging V2`
(`oonijgmddgyymhrlnvuu`).

## Redirección móvil

- Site URL: `ping-staging://auth/callback`
- Redirect URL permitida: `ping-staging://auth/callback`
- El cliente debe enviar el mismo valor mediante `emailRedirectTo`.

No deben utilizarse valores nulos, URLs de producción ni comodines amplios.

## Correo de confirmación

- Asunto: `Verifica tu cuenta de Ping`
- Plantilla: `confirmation-email.html`
- Variables utilizadas: `{{ .Email }}` y `{{ .ConfirmationURL }}`

La plantilla debe aplicarse exclusivamente al proyecto de staging y probarse con
una cuenta temporal antes de considerarla activa.

Los proyectos Free creados desde el 3 de junio de 2026 no permiten personalizar
las plantillas mientras utilicen el proveedor SMTP predeterminado de Supabase.
En ese caso se conserva la plantilla predeterminada hasta configurar un SMTP
propio; no se debe desactivar la verificación de correo para evitar esta
limitación.
