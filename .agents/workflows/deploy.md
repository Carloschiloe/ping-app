---
description: Desplegar cambios a Producción (Render)
---
// turbo-all
Este flujo es OBLIGATORIO cada vez que se realicen cambios en el código para evitar desincronización entre local y producción.

1. Verificar que el código compila (si es necesario):
   `cd backend`
   `npm run build`
   `cd ..`

2. Preparar los archivos para git:
   `git add .`

3. Realizar el commit con un mensaje descriptivo:
   `git commit -m "feat/fix: descripción del cambio"`

4. Empujar los cambios a la rama principal para disparar el build en Render:
   `git push origin main`

5. Esperar de 3 a 5 minutos y verificar en el log de Render o probando la app.
