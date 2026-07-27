# Ping — Índice de ADR y Principios de Arquitectura

## 1. Propósito

Este documento cierra la etapa conceptual inicial de Ping y prepara el paso a arquitectura técnica.

Cumple dos funciones:

1. consolidar los principios de arquitectura que toda implementación futura debe respetar;
2. organizar las decisiones que requieren Architecture Decision Records.

Los documentos 00 al 19 definen el significado del producto, sus dominios, capacidades transversales, lenguaje y reglas de negocio.

La arquitectura técnica debe implementar ese significado. No puede redefinirlo por conveniencia.

Este documento no selecciona tecnologías nuevas ni redacta los ADR completos.

---

## 2. Alcance

Este documento establece:

- principios de arquitectura;
- decisiones conceptuales ya aprobadas;
- decisiones técnicas existentes que deben formalizarse;
- índice inicial de ADR futuros;
- estados y gobierno de ADR;
- criterios de revisión y sustitución;
- relación con Business Rules y Ubiquitous Language;
- decisiones que deben postergarse;
- riesgos de desviación;
- criterios de aceptación.

No define:

- nuevos frameworks;
- nuevas bases de datos;
- proveedores nuevos;
- protocolos;
- infraestructura detallada;
- esquemas de persistencia;
- algoritmos;
- contratos técnicos;
- topologías definitivas.

Las tecnologías mencionadas como existentes provienen de la visión o del repositorio y no constituyen una nueva elección de este documento.

---

## 3. Tipos de decisión

### Principio de arquitectura

Regla estable que orienta múltiples decisiones técnicas.

Ejemplo:

> La modularidad no implica distribución.

Un principio no especifica una herramienta.

### Decisión conceptual aprobada

Definición de producto o negocio que la arquitectura debe respetar.

Ejemplo:

> Una propuesta no crea un compromiso sin confirmación.

No necesita reabrirse mediante un ADR técnico.

### ADR futuro

Registro formal que documentará una decisión arquitectónica concreta, sus alternativas, consecuencias y condiciones de revisión.

Ejemplo:

> Elegir cómo se implementa la persistencia respetando propiedad de dominio y trazabilidad.

### Decisión de producto

Elección sobre alcance, experiencia o comportamiento visible.

Ejemplo:

> Habilitar o no colaboración básica en la primera beta.

No debe resolverse silenciosamente mediante arquitectura.

### Política configurable

Valor o criterio que puede variar dentro de invariantes aprobadas.

Ejemplo:

> Frecuencia de una notificación.

Un ADR puede definir dónde vive la política, pero no inventar su valor de negocio.

### Mecanismo técnico

Forma concreta de implementar una regla o decisión.

Ejemplo:

> Tecnología utilizada para persistir acciones pendientes.

El mecanismo requiere ADR cuando tiene consecuencias arquitectónicas relevantes.

---

## 4. Jerarquía de autoridad

Las decisiones futuras deben respetar esta jerarquía:

1. visión y alcance del producto;
2. principios de diseño;
3. modelo mental del usuario;
4. responsabilidades y límites de dominios;
5. Authorization y Privacy;
6. lenguaje ubicuo;
7. reglas de negocio;
8. principios de arquitectura;
9. ADR aceptados;
10. políticas configurables;
11. mecanismos de implementación.

Un nivel inferior no puede modificar silenciosamente uno superior.

Un ADR no puede:

- crear una funcionalidad fuera del MVP;
- ampliar permisos;
- reducir privacidad;
- cambiar el significado de un estado;
- convertir una propuesta en hecho;
- atribuir autoridad a la IA;
- eliminar procedencia;
- reescribir historia;
- sustituir el lenguaje ubicuo con términos técnicos.

Si una decisión técnica necesita cambiar un concepto superior, primero debe actualizarse y aprobarse el documento conceptual correspondiente.

---

## 5. Principios de arquitectura

### AP-001 — Arquitectura al servicio del producto

La arquitectura debe optimizar el flujo de capturar, confirmar, seguir y resolver, no la exhibición de complejidad técnica.

### AP-002 — Separación clara de dominios

Conversation, Commitment, People y Memory mantienen responsabilidades explícitas.

Una implementación no debe mezclar sus reglas hasta volver imposible distinguir propiedad, cambios o fuentes.

### AP-003 — Propiedad conceptual de la información

Cada recurso tiene un propietario conceptual.

Una referencia, índice, resumen, evento, recuerdo o traza no se convierte en propietario de la fuente.

### AP-004 — Control explícito del usuario

Las decisiones importantes requieren confirmación cuando las reglas de negocio lo establecen.

La arquitectura no debe introducir rutas alternativas que eviten ese control.

### AP-005 — IA como apoyo

La IA interpreta, propone, resume, relaciona y explica.

No es autoridad, fuente de verdad ni actor autónomo con capacidad para modificar dominios.

### AP-006 — Authorization transversal

Toda consulta y acción protegida debe respetar autorización.

El control no puede depender únicamente de una interfaz o cliente.

### AP-007 — Privacy transversal

Tener acceso no autoriza cualquier propósito.

La arquitectura debe permitir minimización, separación de contextos, corrección, revocación y eliminación.

### AP-008 — Mínimo privilegio

Componentes, actores y capacidades deben acceder sólo a la información y acciones necesarias para su responsabilidad.

### AP-009 — Minimización de información

No debe duplicarse, propagarse o conservarse información sólo porque sea técnicamente posible.

### AP-010 — Procedencia obligatoria

La información relevante, confirmada o derivada debe poder relacionarse con su origen.

### AP-011 — Trazabilidad proporcional

La arquitectura debe permitir reconstruir acciones, decisiones y resultados relevantes sin registrar indiscriminadamente todo detalle técnico.

### AP-012 — Events representa hechos de negocio

Los eventos de negocio describen hechos ocurridos.

No deben confundirse con señales internas, órdenes, propuestas o respuestas de IA.

### AP-013 — Lenguaje ubicuo consistente

Los límites, contratos y nombres conceptuales deben derivarse del glosario aprobado.

Un nombre técnico no debe borrar diferencias como propuesta/compromiso o File/Attachment.

### AP-014 — Offline First con estados honestos

La experiencia debe conservar utilidad e intención sin afirmar confirmaciones inexistentes.

### AP-015 — Synchronization conserva significado

La reconciliación debe distinguir intención, presentación, recepción, aceptación, rechazo y resultado desconocido.

### AP-016 — Incertidumbre explícita

Los modelos y contratos deben poder representar información incompleta, ambigua, pendiente, desactualizada o desconocida.

No se debe usar un valor aparentemente definitivo para ocultar incertidumbre.

### AP-017 — Historia no reescrita

Correcciones, revocaciones y eliminaciones producen cambios posteriores sin falsificar lo ocurrido.

Esto no implica conservación infinita ni acceso permanente.

### AP-018 — Modularidad antes que distribución

La separación de responsabilidades no exige servicios independientes.

La distribución requiere evidencia.

### AP-019 — Núcleo coherente, periferia separable

Las capacidades opcionales, integraciones y clientes futuros no deben dominar ni bloquear Ping Core.

### AP-020 — Evolución sin romper significado

Una migración, refactorización o cambio de proveedor debe preservar reglas, procedencia, estados y lenguaje.

### AP-021 — Independencia frente a proveedores

Las reglas de negocio no deben expresarse como capacidades exclusivas de un proveedor.

La sustitución puede tener costo, pero no debe exigir redefinir el producto.

### AP-022 — Complejidad respaldada por evidencia

Las decisiones irreversibles, distribuidas o especializadas deben justificarse mediante necesidades observadas.

### AP-023 — Decisión técnica postergada responsablemente

No elegir todavía es una decisión válida cuando faltan datos.

La postergación debe registrar qué evidencia falta y qué condición permite revisar.

### AP-024 — Observabilidad sin redefinir Audit

La operación técnica necesita visibilidad, pero sus señales no se convierten automáticamente en Events o evidencia de negocio.

### AP-025 — Cambios reversibles cuando sea posible

Antes de validar el producto, deben preferirse decisiones que puedan evolucionar sin migraciones conceptuales innecesarias.

### AP-026 — Reglas críticas verificables

Las funciones críticas deben preservar reglas determinísticas y validación estructurada, incluso cuando utilicen IA.

---

## 6. Decisiones conceptuales ya aprobadas

Estas decisiones están fijadas por los documentos 00 al 19 y no deben reabrirse como preferencias técnicas:

| ID | Decisión conceptual | Consecuencia arquitectónica |
|---|---|---|
| DC-001 | Conversation conserva conversaciones, mensajes y procedencia | Otros módulos sólo referencian o recuperan su información autorizadamente |
| DC-002 | Commitment administra compromisos confirmados | Ninguna detección crea Commitment sin confirmación |
| DC-003 | People administra identidad y relaciones | No se fusionan identidades por semejanza |
| DC-004 | Memory conserva relevancia, no todo | No se modela como copia exhaustiva de dominios |
| DC-005 | IA es capacidad transversal | No posee autoridad de escritura autónoma |
| DC-006 | Authorization limita toda consulta y acción | Todos los puntos de acceso deben respetar alcance |
| DC-007 | Privacy limita propósito y uso | Acceso y uso permitido se modelan como conceptos distintos |
| DC-008 | Events representa hechos | Intentos y señales técnicas no se mezclan con eventos del negocio |
| DC-009 | Notification sólo comunica | No ejecuta acciones ni reemplaza Events |
| DC-010 | Search localiza y Retrieval contextualiza | Ninguno se convierte en propietario ni amplía permisos |
| DC-011 | File necesita recurso propietario mediante Attachment | El contenido no existe conceptualmente aislado |
| DC-012 | Offline First protege intención y utilidad | El modelo debe representar estados locales y pendientes |
| DC-013 | Synchronization relaciona cambios | Recepción y aceptación deben permanecer distintas |
| DC-014 | Audit conserva evidencia proporcional | No se registra toda actividad como negocio |
| DC-015 | Traceability relaciona origen y resultado | Una traza no reemplaza fuentes |
| DC-016 | Corrección no borra historia silenciosamente | El estado vigente puede relacionarse con estados anteriores |
| DC-017 | Eliminación no significa inexistencia histórica | Contenido y hecho histórico deben poder distinguirse |
| DC-018 | Resultado desconocido es un estado real | No se fuerza éxito o rechazo |
| DC-019 | Conflictos relevantes son visibles | La arquitectura no los resuelve silenciosamente |
| DC-020 | Lenguaje ubicuo gobierna nombres conceptuales | Contratos técnicos deben preservar diferencias aprobadas |

Un ADR puede decidir cómo implementar estas consecuencias, pero no cambiar la decisión conceptual.

---

## 7. Decisiones estratégicas existentes que requieren formalización

Los documentos y el repositorio ya registran una dirección técnica actual.

No se elige nuevamente aquí; se identifica para formalización y revisión.

### Monolito modular

La visión establece que Ping se mantendrá inicialmente como monolito modular durante la etapa de validación.

**Gobierno:** debe formalizarse el alcance, límites y condición de revisión mediante ADR.

### Producto móvil inicial

La validación inicial favorece la experiencia móvil.

**Gobierno:** clientes futuros no deben condicionar prematuramente Ping Core.

### Memory como capacidad interna

Memory Foundation se define inicialmente como capacidad interna, no microservicio ni base vectorial.

**Gobierno:** cualquier extracción requiere evidencia y ADR.

### API versionable, autenticación y adaptadores

La arquitectura estratégica ya menciona estas responsabilidades.

**Gobierno:** sus mecanismos y límites requieren ADR; su mera mención no fija tecnología futura adicional.

### Supabase/PostgreSQL y Storage privado

La visión y el repositorio registran estas tecnologías dentro del estado actual.

**Gobierno:** deben documentarse como decisiones existentes, con contexto, consecuencias, dependencia y condiciones de revisión.

### Complejidad explícitamente no justificada

Los documentos excluyen sin evidencia:

- microservicios;
- Kubernetes;
- Kafka;
- base vectorial;
- Redis;
- framework general de plugins.

**Gobierno:** no deben introducirse mediante una tarea incidental. Requieren evidencia, ADR y revisión del impacto conceptual.

---

## 8. Qué es un ADR en Ping

Un Architecture Decision Record documenta una decisión arquitectónica relevante.

Debe explicar:

- el problema;
- el contexto;
- las restricciones conceptuales;
- las alternativas consideradas;
- la decisión;
- las consecuencias;
- los riesgos;
- la evidencia;
- las condiciones de revisión.

Un ADR no debe:

- reescribir documentos de producto;
- inventar reglas de negocio;
- ocultar una decisión de producto;
- presentar una herramienta como objetivo;
- convertirse en manual de implementación;
- aprobarse sólo porque el código actual ya la usa;
- sustituir evidencia por preferencia.

---

## 9. Cuándo se requiere un ADR

Debe crearse un ADR cuando una decisión:

- afecta varios módulos;
- define propiedad o límites;
- introduce dependencia relevante;
- condiciona datos o migraciones;
- afecta Authorization o Privacy;
- define consistencia o sincronización;
- introduce un proveedor;
- es costosa de revertir;
- cambia operación o despliegue;
- establece un patrón repetido;
- altera observabilidad o trazabilidad;
- decide una tensión entre atributos de calidad;
- reemplaza una decisión anterior.

No se requiere ADR para:

- cambios locales reversibles;
- correcciones sin impacto arquitectónico;
- decisiones de estilo;
- implementación directa de una regla ya delimitada;
- experimentos descartables que no condicionen datos ni contratos.

Si un experimento se convierte en dependencia, debe formalizarse antes de consolidarse.

---

## 10. Estructura de un ADR

Cada ADR debe incluir:

1. **Identificador:** número estable.
2. **Título:** decisión expresada con precisión.
3. **Estado:** posición en el ciclo de vida.
4. **Fecha:** momento de la decisión o revisión.
5. **Responsables:** personas que proponen y aprueban.
6. **Contexto:** problema, evidencia y restricciones.
7. **Decisión:** elección concreta.
8. **Alternativas consideradas:** opciones reales y razón de descarte.
9. **Consecuencias positivas:** beneficios esperados.
10. **Consecuencias negativas:** costos y limitaciones.
11. **Riesgos:** fallos o desviaciones posibles.
12. **Documentos de origen:** visión, dominios, reglas y glosario aplicables.
13. **Decisiones relacionadas:** ADR anteriores o dependientes.
14. **Validación:** cómo saber si cumple su propósito.
15. **Condiciones de revisión:** evidencia o cambio que obliga a reconsiderar.
16. **Plan de transición:** sólo cuando reemplaza una decisión existente.

El ADR debe ser comprensible sin conocer detalles implícitos de una conversación externa.

---

## 11. Estados de ADR

### Borrador

La decisión se está documentando y todavía no debe gobernar implementación.

### Propuesto

Existe una alternativa recomendada lista para revisión.

### Aceptado

La decisión fue aprobada y gobierna cambios futuros.

### Rechazado

La propuesta no fue aceptada. Se conserva para evitar repetir razonamiento.

### Postergado

Falta evidencia o depende de una decisión previa.

Debe indicar condición de reactivación.

### Sustituido

Otro ADR reemplazó la decisión.

Debe conservar referencia al sucesor.

### Retirado

La decisión dejó de aplicar sin ser reemplazada por una alternativa equivalente.

### En revisión

Una condición de revisión se cumplió y la decisión aceptada está siendo reevaluada.

El estado del índice `ADR pendiente` significa que todavía no existe un ADR completo; no es un estado del ADR.

---

## 12. Identificación y organización

Los ADR futuros deben usar identificadores estables:

`ADR-NNN`

Reglas:

- el identificador no se reutiliza;
- el título expresa la decisión, no sólo el tema;
- un ADR trata una decisión principal;
- las dependencias se enlazan explícitamente;
- un ADR sustituido permanece consultable;
- el índice refleja el estado vigente;
- los archivos futuros pueden utilizar `docs/adr/ADR-NNN-TITULO.md`, sujeto a aprobación al crear el primer ADR.

Este documento no crea todavía el directorio ni los ADR individuales.

---

## 13. Índice inicial de ADR

El índice propone decisiones que probablemente necesitarán ADR formal.

`Restringido conceptualmente` significa que los documentos ya fijan límites, pero todavía falta elegir o formalizar el mecanismo.

`Decisión existente por formalizar` significa que la dirección actual está registrada en visión o repositorio y requiere conservar su razonamiento.

`Postergado` significa que no debe decidirse hasta obtener la evidencia indicada.

| ID | Título provisional | Estado del índice | Contexto o decisión requerida | Origen | Condición de revisión |
|---|---|---|---|---|---|
| ADR-001 | Arquitectura general de Ping Core | Decisión existente por formalizar | Formalizar monolito modular, alcance y responsabilidades | 00, 02 | Evidencia de límites del monolito o fin del período de validación |
| ADR-002 | Límites de módulos de negocio | Restringido conceptualmente; ADR pendiente | Traducir Conversation, Commitment, People y Memory a límites técnicos | 04–07, 19 | Acoplamiento que impida evolución independiente |
| ADR-003 | Dirección de dependencias entre módulos | ADR pendiente | Evitar ciclos y preservar propiedad conceptual | 02, 04–07, 19 | Nuevo flujo entre tres o más módulos |
| ADR-004 | Integración entre dominios | ADR pendiente | Elegir cómo colaboran módulos sin compartir propiedad | 04–10, 19 | Primer flujo transversal técnico |
| ADR-005 | Modelo de propiedad de datos | Restringido conceptualmente; ADR pendiente | Asignar responsabilidad técnica por recurso y fuente | 04–07, 13, 19 | Diseño de persistencia |
| ADR-006 | Estrategia general de datos | ADR pendiente | Definir consistencia, separación y acceso a información | 04–17 | Antes de reestructurar persistencia |
| ADR-007 | Persistencia primaria | Decisión existente por formalizar | Documentar uso actual de Supabase/PostgreSQL y alternativas | 00, repositorio | Límites funcionales, costo o dependencia |
| ADR-008 | Evolución de esquema y migraciones | ADR pendiente | Preservar significado, trazabilidad y reversibilidad | 15–19 | Primer cambio estructural posterior al baseline |
| ADR-009 | Consistencia y límites de cambio | ADR pendiente | Definir qué cambios deben confirmarse juntos | 05, 10, 15, 19 | Implementación de transiciones transversales |
| ADR-010 | Conservación, corrección y eliminación de datos | Postergado | Depende de políticas de Privacy todavía pendientes | 07, 16, 17, 19 | Aprobación de criterios de conservación |
| ADR-011 | Representación técnica de identidad | ADR pendiente | Preservar persona, usuario y referencia incompleta | 06, 18, 19 | Diseño de identidad o importación |
| ADR-012 | Mecanismo de autenticación | Decisión existente por formalizar | Documentar mecanismo actual y sus límites | 00, repositorio | Nuevos clientes o requisitos de identidad |
| ADR-013 | Aplicación de Authorization | Restringido conceptualmente; ADR pendiente | Garantizar control transversal y mínimo privilegio | 09, 17, 19 | Diseño de puntos de acceso |
| ADR-014 | Aplicación de Privacy y minimización | Restringido conceptualmente; ADR pendiente | Llevar propósito y minimización a componentes técnicos | 17, 19 | Aprobación de políticas de Privacy |
| ADR-015 | Representación de Events de negocio | ADR pendiente | Distinguir hechos de señales internas | 10, 16, 19 | Primer consumidor transversal de Events |
| ADR-016 | Integridad y consulta de Audit | ADR pendiente | Conservar evidencia proporcional y autorizada | 16, 17, 19 | Definición de evidencia auditable |
| ADR-017 | Correlación y Traceability | ADR pendiente | Relacionar intención, decisión, fuente y resultado | 10, 15, 16 | Primer flujo histórico transversal |
| ADR-018 | Observabilidad técnica | ADR pendiente | Separar diagnóstico técnico de Audit y Events | 00, 16, 20 | Necesidades operativas medibles |
| ADR-019 | Datos locales para Offline First | Postergado | Definir qué recursos y acciones estarán disponibles localmente | 14, 17, 19 | Decisión de capacidades offline de beta |
| ADR-020 | Acciones pendientes y resultado desconocido | Restringido conceptualmente; ADR pendiente | Representar intención, estados y recuperación | 14, 15, 19 | Implementación del primer flujo offline |
| ADR-021 | Estrategia de Synchronization | Postergado | Relacionar cambios sin elegir prematuramente mecanismo | 15, 19 | Evidencia de beta offline y varios dispositivos |
| ADR-022 | Duplicados, orden y conflictos | Postergado | Depende de políticas de reconciliación no aprobadas | 15, 19 | Casos reales de conflicto |
| ADR-023 | Estrategia para múltiples dispositivos | Postergado | Alcance de producto todavía pendiente | 14, 15, 17 | Habilitación aprobada de varios dispositivos |
| ADR-024 | Almacenamiento y entrega de Files | Decisión existente por formalizar | Documentar Storage privado actual y límites | 00, 13, repositorio | Habilitación de Files en beta |
| ADR-025 | Ciclo de vida y versiones de Files | Postergado | Versiones, eliminación y múltiples relaciones no aprobadas | 13, 17, 19 | Decisión de producto sobre versiones |
| ADR-026 | Orquestación de IA | ADR pendiente | Mantener IA como apoyo, con procedencia y validación | 08, 16–19 | Primer flujo de IA productivo revisado |
| ADR-027 | Independencia de proveedor de IA | ADR pendiente | Evitar que reglas dependan de un proveedor | 08, 20 | Incorporación o cambio de proveedor |
| ADR-028 | Evaluación, incertidumbre y fallos de IA | ADR pendiente | Verificar límites y degradación sin autoridad autónoma | 08, 14, 17, 19 | Métricas reales de calidad |
| ADR-029 | Estrategia de Search | Postergado | Criterios y alcance de beta todavía pendientes | 12, 17, 19 | Aprobación de casos de búsqueda |
| ADR-030 | Estrategia de Retrieval | Postergado | Cantidad de contexto y fuentes todavía pendiente | 07, 12, 17 | Aprobación de casos de recuperación |
| ADR-031 | Relación técnica entre Memory, Search y Retrieval | ADR pendiente | Preservar responsabilidades y evitar duplicación | 07, 12, 18, 19 | Diseño de recuperación contextual |
| ADR-032 | Entrega de Notifications | Postergado | Canales, prioridad y repetición no definidos | 11, 17, 19 | Aprobación de experiencia de notificación |
| ADR-033 | Integraciones y adaptadores externos | ADR pendiente | Aislar proveedores y capacidades periféricas | 00, 02, 20 | Primera integración externa |
| ADR-034 | Versionamiento de interfaces técnicas | Decisión existente por formalizar | Documentar API versionable mencionada en visión | 00 | Primer cambio incompatible |
| ADR-035 | Estrategia de despliegue | Decisión existente por formalizar | Documentar despliegue actual, entornos y límites | repositorio | Cambio de topología o escala |
| ADR-036 | Configuración y secretos | ADR pendiente | Separar configuración de decisiones de negocio | repositorio, 20 | Incorporación de nuevo entorno o proveedor |
| ADR-037 | Respaldo y recuperación operativa | ADR pendiente | Proteger continuidad sin confundir backup con Memory | 07, repositorio | Objetivos operativos aprobados |
| ADR-038 | Criterios de extracción de módulos | Postergado | Definir evidencia para abandonar monolito modular | 00, 02, 20 | Problemas medidos de escala o autonomía |
| ADR-039 | Estrategia de evolución de proveedores | ADR pendiente | Permitir sustitución sin romper significado | 20 | Dependencia material o cambio contractual |
| ADR-040 | Gobierno de contratos y lenguaje técnico | ADR pendiente | Mantener consistencia con lenguaje ubicuo | 18, 19, 20 | Primer contrato compartido entre módulos |

Los títulos son provisionales. Cada ADR debe formular una decisión concreta cuando exista contexto suficiente.

---

## 14. Decisiones que no deben tomarse todavía

### Distribución en microservicios

No existe evidencia aprobada que justifique abandonar el monolito modular.

**Revisar cuando:** existan límites medidos de despliegue, escala, autonomía o aislamiento que no puedan resolverse modularmente.

### Orquestación distribuida especializada

No deben introducirse brokers o plataformas distribuidas sólo por anticipación.

**Revisar cuando:** exista una necesidad observada y un modelo de Events estable.

### Base vectorial o estrategia especializada de recuperación

Memory no es una tecnología y Search no es Memory.

**Revisar cuando:** los casos de recuperación aprobados y sus métricas demuestren una necesidad.

### Estrategia definitiva de Synchronization

Faltan decisiones de producto sobre múltiples dispositivos, conflictos, reintentos y duplicados.

**Revisar cuando:** se apruebe el alcance offline de la beta y existan escenarios observados.

### Persistencia local definitiva

No se han aprobado recursos, períodos ni capacidades exactas sin conexión.

**Revisar cuando:** producto defina el alcance Offline First inicial.

### Políticas de conservación y eliminación

Privacy mantiene pendientes los criterios y períodos.

**Revisar cuando:** se aprueben políticas conceptuales y necesidades operativas.

### Canales y estrategia de Notifications

Los documentos definen significado, no canales.

**Revisar cuando:** producto apruebe destinatarios, prioridad, vigencia y frecuencia.

### Versiones y múltiples relaciones de Files

La capacidad no está aprobada para la beta.

**Revisar cuando:** exista un caso de uso validado.

### Arquitectura de colaboración avanzada

Propiedad compartida, historia anterior, delegación y acciones de participantes siguen pendientes.

**Revisar cuando:** el fundador habilite colaboración y defina sus reglas.

### Plataforma general de plugins

Está explícitamente fuera de la primera etapa.

**Revisar cuando:** Ping Core esté validado y existan integraciones repetidas con necesidades comunes.

---

## 15. Relación con Business Rules

Business Rules define qué comportamiento debe cumplirse.

Los ADR definen cómo una arquitectura concreta preservará esas reglas.

Cada ADR debe:

- citar reglas `BR-*` afectadas;
- explicar cómo se verifican;
- identificar riesgos de incumplimiento;
- evitar duplicar el texto completo;
- registrar cualquier tensión.

Si un ADR parece necesitar una excepción a una regla:

1. no debe aprobarse todavía;
2. debe identificarse la causa;
3. debe revisarse la regla con producto y negocio;
4. sólo después puede actualizarse la decisión arquitectónica.

Un ADR no crea excepciones de negocio.

---

## 16. Relación con Ubiquitous Language

El glosario define el significado de los términos.

Los ADR deben utilizarlo para:

- nombrar módulos;
- describir recursos;
- distinguir estados;
- documentar contratos;
- explicar consecuencias;
- evitar ambigüedad.

Reglas:

- `Conversation` no se reduce a una tabla de mensajes;
- `Commitment Proposal` no se llama `Commitment`;
- `Person` no se llama `User` si puede no usar Ping;
- `File` y `Attachment` permanecen distintos;
- `Event` se reserva para hecho de negocio;
- `Audit` no se llama Event;
- `Received` no se llama Accepted;
- `Synchronized` no se llama Confirmed;
- `Deleted` no se interpreta como Never Existed.

Si una restricción técnica obliga a nombres diferentes, el ADR debe mantener un mapeo explícito y justificarlo.

---

## 17. Creación y aprobación de ADR

El proceso conceptual es:

1. identificar la decisión;
2. confirmar que es arquitectónica;
3. reunir evidencia y restricciones;
4. citar documentos de origen;
5. identificar Business Rules afectadas;
6. registrar alternativas reales;
7. analizar consecuencias y riesgos;
8. proponer una decisión;
9. revisar con responsables de producto y técnica;
10. aceptar, rechazar o postergar;
11. actualizar el índice;
12. verificar implementación.

No debe escribirse un ADR para legitimar retrospectivamente una decisión sin evaluar alternativas y consecuencias.

Las personas responsables de aprobación y la ubicación definitiva de los ADR son decisiones de gobierno pendientes.

---

## 18. Revisión de ADR

Un ADR aceptado debe revisarse cuando:

- cambia una decisión conceptual;
- una Business Rule se modifica;
- aparece evidencia que contradice sus supuestos;
- se incumple un objetivo declarado;
- cambia materialmente el alcance de producto;
- surge una dependencia no prevista;
- el costo de operación supera lo esperado;
- afecta privacidad o autorización de manera nueva;
- una migración requiere romper contratos;
- se cumple su fecha o condición de revisión.

Revisar no significa editar silenciosamente la decisión original.

Debe:

1. conservarse el ADR anterior;
2. cambiarse su estado a En revisión o Sustituido;
3. crearse un ADR sucesor cuando exista nueva decisión;
4. relacionarse ambos;
5. definir transición;
6. actualizar el índice.

---

## 19. Sustitución y retiro

Un ADR puede sustituirse cuando otra decisión resuelve el mismo problema con nuevo contexto.

El ADR sucesor debe explicar:

- qué cambió;
- qué evidencia apareció;
- por qué la decisión anterior ya no es adecuada;
- qué consecuencias se mantienen;
- cómo se preservan datos y significado;
- cómo se realiza la transición;
- cómo puede revertirse si corresponde.

Un ADR retirado:

- deja de gobernar;
- permanece como parte de la historia;
- no debe eliminarse para aparentar continuidad;
- debe indicar por qué dejó de aplicar.

La gobernanza de ADR sigue la misma regla conceptual de Ping:

> Una corrección o sustitución no reescribe silenciosamente la historia.

---

## 20. Criterios de revisión arquitectónica

Toda propuesta debe evaluarse mediante:

### Coherencia de producto

- ¿protege el flujo principal?;
- ¿evita ampliar el MVP?;
- ¿mantiene control del usuario?

### Coherencia de dominio

- ¿respeta propiedad?;
- ¿mantiene límites?;
- ¿evita duplicar fuentes?;

### Authorization y Privacy

- ¿aplica mínimo privilegio?;
- ¿minimiza información?;
- ¿permite revocación, corrección y eliminación?;

### Procedencia e historia

- ¿conserva origen?;
- ¿distingue hechos y derivados?;
- ¿evita reescritura silenciosa?;

### Offline First y Synchronization

- ¿representa pendientes e incertidumbre?;
- ¿distingue recepción y aceptación?;
- ¿evita duplicados y conflictos silenciosos?;

### Operación y evolución

- ¿puede observarse sin contaminar Events?;
- ¿puede migrarse?;
- ¿puede reemplazarse el proveedor?;
- ¿qué evidencia permitiría revisarla?

### Complejidad

- ¿la necesidad existe hoy?;
- ¿hay una alternativa más simple?;
- ¿la decisión puede postergarse?;

---

## 21. Riesgos de desviación

### Monolito sin modularidad real

Riesgo: compartir modelos y datos hasta borrar responsabilidades.

Mitigación conceptual: propiedad explícita, dependencias revisadas y ADR de límites.

### Microservicios prematuros

Riesgo: distribuir complejidad antes de estabilizar dominios.

Mitigación conceptual: exigir evidencia y criterios de extracción.

### Proveedor convertido en dominio

Riesgo: expresar reglas mediante nombres o límites de una herramienta.

Mitigación conceptual: adaptadores, lenguaje ubicuo y ADR de dependencia.

### IA con autoridad implícita

Riesgo: una ruta técnica permite escrituras sin confirmación.

Mitigación conceptual: reglas determinísticas y control de dominio.

### Authorization sólo en la interfaz

Riesgo: otros puntos de acceso evitan permisos.

Mitigación conceptual: Authorization transversal y verificable.

### Privacy tratada como retención total

Riesgo: Audit o Memory justifica conservar todo.

Mitigación conceptual: minimización y separación de contenido/evidencia.

### Events convertidos en señales técnicas

Riesgo: la historia del negocio se llena de ruido operativo.

Mitigación conceptual: vocabulario y propiedad de Events.

### Synchronization que oculta conflictos

Riesgo: se pierde intención o se duplican hechos.

Mitigación conceptual: estados explícitos, trazabilidad y revisión humana.

### Abstracción anticipada

Riesgo: crear plataformas generales sin casos reales.

Mitigación conceptual: núcleo antes que periferia.

### ADR como aprobación burocrática

Riesgo: documentar después de decidir sin evaluar alternativas.

Mitigación conceptual: evidencia, consecuencias y revisión previa.

---

## 22. Indicadores de que una decisión debe revisarse

Una decisión puede necesitar revisión si:

- una regla sólo puede implementarse mediante excepciones repetidas;
- dos módulos modifican la misma fuente;
- Authorization se duplica con resultados distintos;
- Privacy depende de disciplina manual;
- una migración pierde procedencia;
- la IA produce efectos sin decisión trazable;
- Offline First no puede representar resultado desconocido;
- Synchronization crea duplicados;
- Search revela existencia no autorizada;
- Audit conserva contenido innecesario;
- los nombres técnicos contradicen el glosario;
- un proveedor impide cumplir reglas;
- la operación no permite explicar fallos;
- el costo de cambio crece sin valor validado.

Un indicador no ordena una solución específica. Activa análisis y, cuando corresponda, un ADR.

---

## 23. Decisiones de gobierno pendientes

Antes de iniciar la serie formal de ADR debe definirse:

1. quién puede proponer un ADR;
2. quién debe revisarlo;
3. quién lo acepta;
4. qué decisiones requieren participación del fundador;
5. dónde vivirán los archivos ADR;
6. cómo se nombrarán definitivamente;
7. cómo se enlazará el índice;
8. qué evidencia mínima debe incluirse;
9. qué plazo de revisión aplica a decisiones temporales;
10. cómo se registra una prueba experimental;
11. cuándo una decisión actual debe formalizarse antes de continuar;
12. cómo se verifica cumplimiento en cambios futuros;
13. cómo se relacionan ADR con tareas y revisiones de código;
14. cómo se aprueban excepciones temporales;
15. cómo se retira una excepción.
16. cuál será el nombre arquitectónico definitivo de `Memory Foundation` frente a `Memory Domain`;
17. cómo se determina el inicio y término del horizonte aprobado de 6 a 12 meses para el monolito modular;
18. qué evidencia distingue una tecnología presente en el repositorio de una decisión arquitectónica formalmente aceptada.

Hasta resolver estas decisiones, el índice sirve como mapa y no como autorización para ejecutar las decisiones pendientes.

---

## 24. Criterios de aceptación

Este documento se considera correcto cuando:

1. consolida principios que protegen el significado de Ping;
2. separa principios, decisiones conceptuales, ADR, producto, políticas y mecanismos;
3. reconoce decisiones técnicas existentes sin elegir tecnologías nuevas;
4. conserva el monolito modular como dirección inicial aprobada;
5. mantiene dominios y propiedad conceptual;
6. preserva control explícito del usuario;
7. mantiene IA como apoyo;
8. trata Authorization y Privacy como límites transversales;
9. exige procedencia y trazabilidad proporcional;
10. distingue Events de señales técnicas;
11. protege lenguaje ubicuo y Business Rules;
12. incorpora Offline First y Synchronization;
13. representa incertidumbre sin estados falsos;
14. impide reescritura silenciosa de historia;
15. favorece modularidad y mínimo privilegio;
16. exige minimización de información;
17. permite evolución sin romper significado;
18. reconoce dependencia de proveedores como decisión revisable;
19. posterga decisiones sin evidencia;
20. define estructura y estados de ADR;
21. propone un índice ordenado de decisiones futuras;
22. identifica decisiones que no deben tomarse todavía;
23. establece criterios de creación, revisión y sustitución;
24. identifica riesgos de desviación;
25. no define nuevos frameworks, proveedores, protocolos o infraestructura.

---

## 25. Resumen

La etapa conceptual de Ping establece qué debe significar el producto.

La arquitectura futura debe preservar:

- dominios separados;
- propiedad conceptual;
- confirmación del usuario;
- IA sin autoridad;
- Authorization y Privacy transversales;
- procedencia;
- trazabilidad;
- Events como hechos;
- lenguaje ubicuo;
- Offline First;
- Synchronization;
- incertidumbre explícita;
- historia no reescrita.

La dirección inicial ya aprobada es un monolito modular orientado al producto móvil y al núcleo del MVP. Las tecnologías actuales deben formalizarse con contexto y condiciones de revisión, no convertirse en dogma.

El índice identifica 40 ADR probables. Algunos formalizarán decisiones existentes; otros están restringidos por conceptos aprobados; varios deben postergarse hasta obtener evidencia de la beta.

La regla de gobierno arquitectónico es:

> Ninguna decisión técnica puede simplificar la implementación a costa de cambiar silenciosamente el significado del producto.
