# Fase 3 — Auditoría de superficie del Ping Core

## Estado

Esta auditoría describe la implementación real de la navegación móvil en la rama de integración. No introduce cambios masivos de UX ni elimina rutas legacy.

## Evidencia actual

- La navegación principal tiene cuatro superficies: Chats, Hoy, Compromisos y Perfil.
- El acceso público a Ping está en el encabezado de la lista de conversaciones y navega a `PingAI`, que usa `AgentPreviewScreen` como superficie del Ping Core.
- `AgentPreviewScreen` usa `/agent/turn` y mantiene el límite correcto: una interpretación o propuesta no ejecuta un cambio de dominio; las acciones requieren plan, autorización y confirmación.
- `PingAIScreen` y la ruta `PingAIClassic` son compatibilidad legacy y sólo aparecen en el menú de desarrollo. No son una segunda superficie pública en builds de producción.
- Chat conserva funciones de mensajería, audio, sugerencias de compromiso y confirmación. No debe convertirse en un chat de asistente que reemplace el producto.
- Hoy y Compromisos son proyecciones distintas del mismo dominio de compromisos y ya comparten invalidaciones y operaciones canónicas.
- Captura rápida persiste una captura desde una pantalla modal separada; su copy la presenta como “Mis Recordatorios”, por lo que todavía existe una diferencia de lenguaje frente a la promesa “Ping recuerda lo importante”.

## Diagnóstico

### Lo que está bien

1. El Ping Core moderno es la entrada pública única en producción.
2. El control de confirmación está separado de la interpretación.
3. Chat sigue siendo una app de mensajería y no fue reemplazado por el agente.
4. Hoy y Compromisos consumen el mismo núcleo canónico, aunque tengan presentaciones distintas.

### Contradicciones o fricción pendiente

1. El usuario debe entender que “Ping”, “Captura rápida” y “Compromisos” forman un único flujo, no tres productos.
2. La captura rápida y las sugerencias inline de Chat tienen contratos de UX distintos al flujo explícito de `/agent/turn`.
3. Existen alias y rutas legacy que son útiles para compatibilidad, pero deben permanecer fuera de la navegación de producción y no recibir nuevas capacidades.
4. La navegación no expresa todavía de forma uniforme el ciclo:
   `captura natural -> propuesta -> confirmación -> compromiso -> seguimiento -> resolución`.

## Decisión recomendada para Fase 3

### 3A — Unificar lenguaje y contratos, sin rediseño masivo

- Mantener Chat, Hoy y Compromisos como superficies especializadas.
- Mantener Ping Core como la única superficie de interpretación y acción asistida.
- Definir un contrato de captura común para texto y voz que preserve:
  - captura original;
  - propuesta derivada;
  - estado de confirmación;
  - referencia al compromiso resultante;
  - procedencia y conversación de origen.
- Mantener `PingAIScreen` sólo como compatibilidad de desarrollo hasta confirmar que no existe consumidor productivo.
- No agregar otra pantalla “asistente”, “IA” o “voz” paralela.

### 3B — Integrar por eventos de dominio

La convergencia debe ocurrir en el núcleo y los adapters, no duplicando lógica en cada pantalla:

1. Chat produce una captura con contexto de conversación.
2. Captura rápida produce la misma clase de captura sin conversación.
3. Ping Core interpreta y devuelve propuesta/lectura.
4. La UI muestra propuesta y pide confirmación cuando corresponde.
5. Commitment Core materializa o transiciona el compromiso.
6. Hoy, Compromisos y Chat se invalidan/reconcilian mediante las mismas referencias canónicas.

### 3C — Criterios para cambios UX posteriores

Un cambio de superficie sólo se acepta si:

- no reescribe ni pierde el mensaje/captura original;
- no transforma una propuesta IA en compromiso sin confirmación;
- no crea un segundo writer directo de compromisos;
- conserva idempotencia en reintentos móviles;
- mantiene compatibilidad con datos y deep links existentes;
- añade pruebas de navegación y de contrato de dominio.

## Próximo bloque implementable

El primer cambio de código de Fase 3 debe ser pequeño y medible: extraer/normalizar el contrato de captura compartido entre Chat y Captura rápida, sin cambiar todavía el layout de las pantallas. Después se podrá conectar ese contrato al adapter del Ping Core y medir qué UI duplicada puede retirarse de forma segura.
