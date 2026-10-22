# Auth de staging — evidencia histórica (no operativa)

> **Estado:** archivado. Este archivo conserva la configuración histórica de
> `Ping Staging V2` para auditoría. No lo uses para configurar, probar ni
> desplegar la autenticación de Ping producción.

La configuración operativa vigente pertenece exclusivamente al proyecto
Supabase de producción `wbigqhtuzfmpnxservlf` y debe verificarse en el panel de
Supabase antes de cualquier cambio. Los valores de staging que siguen se
conservan sólo como evidencia histórica y no deben copiarse a producción.

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

La plantilla descrita aquí sólo documenta el proyecto histórico de staging y
no debe aplicarse a ningún proyecto actual.

Los proyectos Free creados desde el 3 de junio de 2026 no permiten personalizar
las plantillas mientras utilicen el proveedor SMTP predeterminado de Supabase.
En ese caso se conserva la plantilla predeterminada hasta configurar un SMTP
propio; no se debe desactivar la verificación de correo para evitar esta
limitación.
