# Ping — Capacidad transversal de Inteligencia Artificial

Este documento define oficialmente el papel conceptual y funcional de la Inteligencia Artificial dentro de Ping para el MVP.

La IA no constituye un dominio de negocio independiente. Ayuda a Conversation, Commitment, People y Memory sin sustituir sus responsabilidades ni las decisiones del usuario.

## 1. Propósito

El propósito de la IA en Ping es ayudar al usuario a transformar capturas naturales e información autorizada en propuestas comprensibles que faciliten recordar, seguir y resolver asuntos importantes.

La IA puede reducir el esfuerzo necesario para:

- interpretar lo que el usuario escribió o dijo;
- reconocer un posible compromiso;
- extraer información disponible;
- comprender contexto;
- resumir información autorizada;
- sugerir relaciones;
- sugerir seguimientos;
- explicar información recuperada.

Su valor depende de mantener al usuario en control. La IA ayuda a comprender y decidir; no decide por el usuario.

## 2. Rol de la IA en Ping

La IA es una capacidad transversal.

Su rol es colaborar con:

- Conversation, interpretando capturas autorizadas sin modificar su fuente;
- Commitment, proponiendo posibles compromisos y datos para revisión;
- People, sugiriendo posibles relaciones o coincidencias sin confirmar identidad;
- Memory, ayudando a resumir, relacionar y explicar información recuperada con autorización.

La IA no posee:

- conversaciones;
- compromisos;
- personas;
- recuerdos;
- estados;
- permisos;
- decisiones del usuario.

Cada dominio conserva su responsabilidad. La IA entrega propuestas derivadas para que el producto y el usuario las validen.

## 3. Qué puede hacer

La IA puede:

- interpretar lenguaje natural;
- ayudar a transformar una captura de audio en información útil;
- detectar posibles compromisos;
- proponer una descripción;
- extraer fechas o plazos expresados;
- extraer posibles responsables;
- identificar personas mencionadas;
- extraer contexto relevante;
- resumir contexto autorizado;
- sugerir seguimientos;
- proponer relaciones entre información autorizada;
- proponer posibles coincidencias entre referencias de personas;
- explicar información recuperada;
- responder preguntas sobre información que el usuario puede consultar;
- reconocer que falta información;
- expresar incertidumbre;
- ayudar al usuario a corregir una propuesta.

Estas capacidades producen ayudas o propuestas. No producen por sí solas decisiones confirmadas.

## 4. Qué nunca debe hacer

La IA nunca debe:

- crear un compromiso automáticamente;
- confirmar un compromiso;
- ejecutar una acción importante sin confirmación;
- decidir por el usuario;
- modificar Conversation por iniciativa propia;
- modificar Commitment por iniciativa propia;
- modificar People por iniciativa propia;
- modificar Memory por iniciativa propia;
- cambiar mensajes originales;
- cambiar estados o responsables sin decisión del usuario;
- resolver compromisos;
- confirmar identidades;
- fusionar personas;
- fusionar recuerdos ambiguos;
- inventar hechos;
- inventar compromisos;
- inventar fechas, responsables, personas, contexto o resultados;
- ocultar incertidumbre;
- presentar una inferencia como información confirmada;
- tratar un resumen como verdad primaria;
- sustituir una fuente original;
- guardar hechos permanentes sin procedencia;
- ampliar permisos;
- acceder a información no autorizada;
- tomar decisiones financieras, legales, personales o de negocio por el usuario;
- actuar como agente autónomo;
- convertirse en fuente de verdad;
- operar como motor de automatización sin control.

La imposibilidad de completar una interpretación es preferible a presentar una invención como certeza.

## 5. Principios de funcionamiento

**La IA ayuda; el usuario decide**

Toda acción relevante permanece bajo control del usuario.

**Propuesta antes que confirmación**

Una interpretación se presenta como sugerencia hasta que el usuario la confirme.

**Contexto antes que conclusión**

La salida debe permitir comprender qué información la sustenta.

**Procedencia siempre**

Toda información derivada mantiene relación con fuentes identificables.

**Incertidumbre visible**

Las dudas sobre intención, fecha, responsable, persona o contexto no deben ocultarse.

**Autorización constante**

La IA sólo utiliza información que el usuario puede consultar para el propósito autorizado.

**Fuente antes que resumen**

La información original y confirmada no puede ser reemplazada por una síntesis.

**Corrección normal**

El usuario debe poder corregir, completar o rechazar lo interpretado.

**Límites entre dominios**

La IA no asume las responsabilidades de Conversation, Commitment, People o Memory.

**Ayuda antes que automatización**

El objetivo es reducir esfuerzo y mejorar comprensión, no actuar autónomamente.

## 6. Interpretación del lenguaje natural

La IA puede interpretar información expresada naturalmente por texto o mediante una captura de audio.

La interpretación puede intentar reconocer:

- una intención;
- una posible acción;
- una solicitud;
- una promesa;
- una decisión pendiente;
- una respuesta esperada;
- una fecha o plazo;
- una persona;
- un responsable;
- un asunto;
- contexto relacionado.

Interpretar no significa confirmar.

La salida debe distinguir:

- el contenido original;
- la interpretación derivada;
- los elementos inciertos;
- la información que falta;
- la procedencia utilizada.

Si una captura admite varias interpretaciones, la IA debe conservar la ambigüedad o solicitar decisión del usuario mediante el flujo aprobado. No debe elegir silenciosamente la opción más conveniente.

La interpretación de audio no reemplaza el audio de origen ni convierte una interpretación incompleta en contenido original.

## 7. Detección de compromisos

La IA puede detectar que una captura podría contener un compromiso.

La detección puede reconocer algo que una persona:

- prometió hacer;
- solicitó a otra persona;
- aceptó realizar;
- necesita recordar;
- debe revisar;
- debe decidir;
- debe confirmar;
- espera recibir.

Toda detección debe presentarse como una propuesta equivalente a:

> “Esto parece un compromiso. ¿Quieres guardarlo?”

La propuesta puede incluir información disponible sobre:

- descripción;
- propietario;
- posible responsable;
- personas relacionadas;
- fecha o plazo;
- prioridad cuando corresponda;
- origen;
- contexto.

La detección no crea un Commitment.

El usuario puede:

- confirmar;
- corregir;
- completar;
- rechazar.

Si no existe información suficiente, la IA no debe inventar un compromiso ni forzar una sugerencia.

## 8. Extracción de contexto

La IA puede ayudar a identificar información necesaria para comprender por qué existe un asunto.

Puede extraer, cuando esté presente y autorizada:

- conversación de origen;
- mensaje o captura relevante;
- fecha de origen;
- asunto mencionado;
- persona relacionada;
- posible responsable;
- fecha o plazo;
- mensajes relacionados;
- acciones posteriores;
- relación con un compromiso existente cuando corresponda como sugerencia.

La extracción:

- no modifica la fuente;
- no convierte una mención en identidad confirmada;
- no convierte una fecha en decisión confirmada;
- no convierte un posible responsable en asignación;
- no convierte una relación en permiso;
- no inventa el contexto que falta.

La información extraída debe permanecer vinculada con su procedencia y su nivel de certeza.

## 9. Resúmenes

La IA puede resumir contexto autorizado para ayudar al usuario a comprender un asunto.

Un resumen puede:

- condensar información relevante;
- orientar al usuario hacia el origen;
- explicar la evolución de un asunto;
- reunir contexto autorizado de Conversation, Commitment, People y Memory.

Un resumen nunca:

- sustituye una conversación;
- sustituye un mensaje;
- sustituye un compromiso;
- sustituye la identidad confirmada de una persona;
- constituye por sí solo una verdad permanente;
- oculta las fuentes;
- amplía el acceso;
- corrige información histórica.

El resumen debe identificarse como información derivada.

Si contradice una fuente o información confirmada, la fuente prevalece y la contradicción debe permanecer visible.

Los resúmenes de contexto son una funcionalidad opcional del MVP. Su existencia no puede bloquear el flujo principal.

## 10. Relaciones sugeridas

La IA puede sugerir relaciones posibles entre información autorizada.

Puede proponer que:

- una captura se relaciona con un compromiso abierto;
- un mensaje aporta contexto posterior;
- una persona mencionada podría ser responsable;
- dos referencias podrían representar a la misma persona;
- un seguimiento se relaciona con un asunto;
- una conversación aporta origen o contexto;
- un recuerdo puede resultar útil para comprender otro.

Toda relación sugerida:

- permanece como propuesta;
- conserva procedencia;
- expresa incertidumbre;
- requiere confirmación cuando produzca un cambio relevante;
- no fusiona identidades;
- no fusiona recuerdos;
- no cambia responsabilidades;
- no amplía permisos.

La semejanza no es confirmación. La IA no debe consolidar información ambigua por iniciativa propia.

## 11. Manejo de incertidumbre

La IA debe reconocer incertidumbre cuando:

- la intención no está clara;
- no puede determinar si existe un compromiso;
- la fecha admite varias interpretaciones;
- el responsable no está identificado;
- una persona es ambigua;
- el contexto es insuficiente;
- el audio no puede interpretarse completamente;
- dos referencias podrían o no coincidir;
- una fuente contradice otra;
- el resultado de un asunto no está claro.

Ante incertidumbre, la IA debe:

- evitar afirmar certeza;
- señalar qué parte es ambigua;
- conservar las alternativas relevantes cuando corresponda;
- permitir que el usuario corrija o complete;
- abstenerse de crear o modificar información confirmada;
- conservar la relación con la fuente.

La IA no debe completar vacíos con hechos plausibles.

No producir una propuesta puede ser el resultado correcto cuando no existe sustento suficiente.

## 12. Confirmación del usuario

La confirmación es una decisión del usuario, no una capacidad de la IA.

Requieren confirmación:

- crear un compromiso sugerido;
- corregir información relevante propuesta;
- asignar un responsable sugerido;
- confirmar una persona ambigua;
- confirmar una posible coincidencia;
- fusionar identidades, si esa capacidad llegara a aprobarse;
- convertir una relación inferida en información permanente;
- ejecutar una acción importante.

Antes de confirmar, el usuario debe poder comprender:

- qué propone la IA;
- qué información se utilizará;
- qué fuente la sustenta;
- qué partes son inciertas;
- qué cambio ocurriría.

El usuario debe poder:

- confirmar;
- corregir;
- completar;
- rechazar.

El rechazo no debe ejecutar la acción propuesta ni crear el concepto sugerido.

## 13. Información derivada

Es información derivada toda interpretación, extracción, resumen, explicación o relación producida por la IA a partir de fuentes autorizadas.

La información derivada debe:

- identificarse claramente;
- conservar procedencia;
- indicar incertidumbre cuando exista;
- permanecer distinguible de las fuentes;
- permanecer distinguible de decisiones confirmadas;
- respetar la autorización de cada fuente;
- permitir revisión cuando tenga consecuencias relevantes.

La información derivada no debe:

- reemplazar contenido original;
- presentarse como hecho confirmado;
- convertirse automáticamente en memoria permanente;
- reescribir la historia;
- ocultar información contradictoria;
- modificar dominios por sí sola.

Cuando el usuario confirma una propuesta, el dominio correspondiente registra la decisión confirmada. La salida original de IA continúa siendo derivada.

## 14. Procedencia

Toda salida de IA debe conservar procedencia identificable.

La procedencia puede incluir referencias autorizadas a:

- conversación;
- mensaje;
- captura de texto;
- captura de audio;
- compromiso;
- seguimiento;
- avance;
- resultado;
- persona relacionada;
- recuerdo recuperado.

La procedencia debe permitir comprender:

- de dónde salió la interpretación;
- qué información fue utilizada;
- qué dominio conserva la fuente;
- qué autorización se aplicó;
- qué parte fue derivada;
- qué parte confirmó el usuario.

La IA no puede guardar hechos permanentes sin fuente.

Una salida producida desde varias fuentes debe mantener relaciones comprensibles con ellas y no ocultar contradicciones.

## 15. Privacidad y autorización

La IA utiliza únicamente información que el usuario ya está autorizado a consultar.

No puede acceder a:

- conversaciones no autorizadas;
- mensajes privados fuera del alcance del usuario;
- compromisos ajenos;
- personas o relaciones no autorizadas;
- recuerdos de otros usuarios;
- archivos o audios sin permiso.

La IA nunca amplía permisos.

Una consulta por persona no autoriza toda la información de esa persona.

Una conversación compartida no convierte todos los asuntos relacionados en públicos.

Las fuentes conservan sus protecciones:

- Conversation controla el acceso a conversaciones y mensajes;
- Commitment conserva el acceso a compromisos;
- People conserva los límites de identidad y relaciones;
- Memory recupera sólo información autorizada.

La IA debe usar la información únicamente para ayudar a capturar, comprender, recordar, seguir o resolver asuntos.

## 16. Relación con Conversation

Conversation aporta a la IA:

- capturas autorizadas;
- mensajes de origen;
- contexto conversacional permitido;
- participantes autorizados;
- archivos o audios asociados cuando corresponda;
- referencias de procedencia.

La IA puede devolver a Conversation:

- una interpretación derivada;
- una posible detección de compromiso;
- datos extraídos;
- un resumen opcional;
- relaciones sugeridas;
- incertidumbres identificadas.

La IA no:

- crea mensajes originales;
- modifica capturas;
- altera participantes;
- cambia autorizaciones;
- convierte una conversación en compromiso;
- reemplaza mensajes por resúmenes;
- decide qué conversación puede consultar el usuario.

Conversation conserva la fuente. La IA sólo la interpreta dentro del permiso aplicable.

## 17. Relación con Commitment

Commitment puede solicitar ayuda para:

- interpretar una posible obligación;
- proponer una descripción;
- extraer fecha o plazo;
- proponer un responsable;
- identificar personas relacionadas;
- resumir contexto;
- sugerir un seguimiento;
- explicar información autorizada.

La IA puede devolver propuestas, pero Commitment conserva:

- creación;
- confirmación;
- propietario;
- responsable;
- estado;
- prioridad;
- seguimiento;
- avances;
- resolución;
- resultado;
- historial relevante.

La IA no:

- crea Commitment;
- confirma propuestas;
- asigna responsables;
- cambia estados;
- determina que un asunto está resuelto;
- registra resultados como hechos;
- ejecuta seguimientos por iniciativa propia.

El usuario decide y Commitment registra la decisión confirmada.

## 18. Relación con People

People puede solicitar ayuda para:

- identificar que una captura menciona a alguien;
- proponer una representación comprensible;
- sugerir una relación contextual;
- sugerir una posible coincidencia entre referencias;
- reconocer que una identidad está incompleta.

La IA puede devolver:

- una referencia propuesta;
- una posible función dentro de un asunto;
- una coincidencia posible;
- incertidumbre sobre identidad.

La IA no:

- confirma identidades;
- fusiona personas;
- inventa datos de contacto;
- exige que una persona esté registrada;
- crea perfiles enriquecidos;
- infiere reputación;
- transforma una relación en acceso;
- mueve compromisos entre personas.

People administra identidad y relaciones. El usuario controla cualquier confirmación relevante.

## 19. Relación con Memory

Memory puede solicitar ayuda para:

- resumir contexto autorizado;
- explicar un asunto recuperado;
- sugerir relaciones entre recuerdos;
- responder preguntas sobre información autorizada;
- identificar información relevante dentro de fuentes permitidas.

La IA puede devolver:

- una ayuda derivada;
- una explicación;
- un resumen;
- una posible relación;
- una indicación de incertidumbre;
- referencias a fuentes.

La IA no:

- decide qué es verdad;
- inventa recuerdos;
- convierte inferencias en hechos permanentes;
- fusiona recuerdos ambiguos;
- corrige historia;
- reemplaza fuentes;
- amplía permisos;
- determina por sí sola la permanencia.

Memory conserva relevancia, procedencia y recuperación. La IA ayuda a interpretar lo autorizado.

## 20. Casos de uso del MVP

**Interpretar una captura de texto**

La IA identifica información posible sin modificar el contenido original.

**Ayudar a interpretar una captura de audio**

La IA transforma el audio en información útil manteniendo la diferencia con la fuente.

**Detectar un posible compromiso**

La IA presenta una sugerencia, no un compromiso creado.

**Extraer una descripción**

La IA propone qué debe ocurrir a partir del contenido autorizado.

**Extraer una fecha o plazo**

La IA propone la información expresada y señala ambigüedad cuando exista.

**Extraer un posible responsable**

La IA identifica una posibilidad sin realizar la asignación.

**Extraer personas y contexto**

La IA propone referencias y relaciones sin confirmar identidad.

**Permitir revisión**

El usuario puede confirmar, corregir, completar o rechazar la propuesta.

**Conservar procedencia**

La sugerencia permite volver a la captura, mensaje o conversación que la sustenta.

**Sugerir seguimiento**

Cuando esta capacidad esté habilitada, la IA puede proponer una acción que ayude a avanzar sin ejecutarla.

**Resumir contexto**

Cuando la capacidad opcional esté habilitada, la IA presenta una síntesis derivada sin sustituir la fuente.

**Explicar información autorizada**

La IA puede ayudar a responder consultas por persona, fecha o conversación usando únicamente información permitida.

Las capacidades opcionales no son necesarias para completar el flujo principal de detección y confirmación.

## 21. Reglas e invariantes

1. La IA no es un dominio de negocio.
2. La IA es una capacidad transversal.
3. La IA no posee datos de Conversation, Commitment, People o Memory.
4. La IA nunca crea compromisos automáticamente.
5. La IA nunca confirma decisiones importantes.
6. La IA nunca modifica un dominio por iniciativa propia.
7. La IA nunca ejecuta acciones importantes sin confirmación.
8. Toda detección es una propuesta.
9. Toda propuesta puede confirmarse, corregirse, completarse o rechazarse.
10. El rechazo no ejecuta la acción propuesta.
11. Toda salida se distingue de la información confirmada.
12. Toda información derivada conserva procedencia.
13. La información derivada no reemplaza la fuente.
14. Un resumen no es verdad primaria.
15. La IA no inventa hechos.
16. La IA no inventa compromisos.
17. La IA no inventa fechas, responsables, personas, contexto o resultados.
18. La IA reconoce incertidumbre.
19. La falta de certeza no se oculta.
20. La IA nunca amplía permisos.
21. Sólo usa información autorizada.
22. El uso de IA no cambia la protección de la fuente.
23. La IA no confirma identidad.
24. La IA no fusiona personas.
25. La IA no fusiona recuerdos ambiguos.
26. La IA no convierte inferencias en hechos permanentes.
27. La IA no corrige automáticamente información histórica.
28. La IA no decide estados ni resolución.
29. La IA no sustituye el juicio del usuario.
30. La IA no toma decisiones financieras, legales o personales.
31. La IA puede proponer, resumir, relacionar, explicar y ayudar.
32. Las funciones críticas conservan validación fuera de la interpretación de IA.
33. Conversation conserva la conversación.
34. Commitment conserva el compromiso.
35. People conserva identidad y relaciones.
36. Memory conserva recuerdos relevantes y autorizados.
37. La IA no se convierte en agente autónomo.
38. La IA no se convierte en fuente de verdad.
39. La IA no se convierte en motor de automatización sin control.

## 22. Errores y situaciones ambiguas

**No se detecta un compromiso**

No se crea una sugerencia forzada ni un Commitment.

**La captura admite varias interpretaciones**

La IA expresa ambigüedad y permite revisión.

**La fecha no está clara**

No inventa un plazo ni elige silenciosamente una interpretación.

**El responsable no está claro**

No asigna a una persona. Presenta la duda para corrección.

**La persona no puede identificarse**

Mantiene una referencia incompleta y no fusiona identidades.

**El audio no puede interpretarse completamente**

Conserva la diferencia entre fuente e interpretación y no inventa contenido.

**El contexto es insuficiente**

Reconoce la falta de información y no fabrica una explicación.

**Una fuente no está autorizada**

No utiliza ni expone su contenido.

**Las fuentes se contradicen**

No decide cuál es verdadera sin confirmación suficiente. Conserva procedencia y contradicción.

**Un resumen contradice la fuente**

La fuente prevalece y el resumen permanece derivado.

**Una relación parece probable**

Continúa siendo sugerencia y no produce fusión ni cambio.

**El usuario rechaza una propuesta**

No se crea el concepto sugerido ni se ejecuta la acción.

**Una salida parece correcta pero carece de procedencia**

No puede convertirse en información permanente.

**La IA no puede responder con información autorizada**

Debe reconocer el límite en lugar de obtener datos fuera del permiso o inventar una respuesta.

## 23. API conceptual

La API conceptual describe solicitudes y resultados de ayuda. No define endpoints, estructuras físicas, proveedores, tecnologías ni instrucciones internas.

**Interpretar una captura autorizada**

Resultado esperado: interpretación derivada con procedencia, elementos propuestos e incertidumbre.

**Detectar un posible compromiso**

Resultado esperado: sugerencia pendiente de confirmación, no un Commitment.

**Extraer información disponible**

Resultado esperado: descripción, fecha, responsable, persona o contexto propuestos sólo cuando exista sustento.

**Interpretar una captura de audio**

Resultado esperado: información útil distinguida del audio original y de cualquier parte incierta.

**Resumir contexto autorizado**

Resultado esperado: síntesis derivada, vinculada con sus fuentes y sin sustituirlas.

**Sugerir una relación**

Resultado esperado: relación posible pendiente de decisión, sin fusión ni cambio automático.

**Sugerir seguimiento**

Resultado esperado: propuesta contextual que el usuario puede aceptar, corregir o rechazar.

**Explicar un asunto autorizado**

Resultado esperado: explicación derivada con referencias suficientes para comprender el origen.

**Responder una pregunta autorizada**

Resultado esperado: ayuda basada únicamente en información que el usuario puede consultar.

**Expresar incertidumbre**

Resultado esperado: se distinguen dudas, información faltante y alternativas relevantes.

**Entregar procedencia**

Resultado esperado: cada parte derivada puede relacionarse con sus fuentes autorizadas.

**Registrar la decisión fuera de la IA**

Resultado esperado: el dominio responsable recibe la decisión explícita del usuario; la IA no la confirma ni la ejecuta.

## 24. Criterios de aceptación

El papel de la IA se considera definido correctamente para el MVP cuando:

1. Se establece como capacidad transversal y no como dominio de negocio.
2. Puede interpretar texto y ayudar con capturas de audio.
3. Puede detectar posibles compromisos.
4. Toda detección permanece como propuesta.
5. Ningún compromiso se crea sin confirmación.
6. El usuario puede confirmar, corregir, completar o rechazar.
7. Puede extraer descripción, fecha, responsable, persona y contexto cuando existe sustento.
8. No inventa información faltante.
9. Reconoce incertidumbre.
10. Toda salida se distingue de información confirmada.
11. Toda información derivada conserva procedencia.
12. Los resúmenes permanecen derivados y opcionales.
13. Una relación sugerida no produce fusión.
14. La IA no confirma identidad.
15. La IA no modifica Conversation.
16. La IA no administra Commitment.
17. La IA no redefine People.
18. La IA no decide Memory.
19. Sólo utiliza información autorizada.
20. Nunca amplía permisos.
21. No ejecuta acciones importantes sin confirmación.
22. No toma decisiones por el usuario.
23. Puede sugerir, resumir, relacionar, explicar y ayudar.
24. No actúa como agente autónomo.
25. No es fuente de verdad.
26. No es motor de automatización sin control.

## 25. Decisiones pendientes

1. Definir qué capacidades opcionales de IA estarán habilitadas en la primera beta.
2. Definir si los resúmenes de contexto estarán visibles en la primera beta.
3. Definir si las sugerencias adicionales de seguimiento estarán visibles en la primera beta.
4. Definir el alcance inicial de las respuestas a preguntas sobre información autorizada.
5. Definir cuánto contexto autorizado es suficiente para interpretar una captura.
6. Definir cómo se comunica la incertidumbre al usuario.
7. Definir qué información mínima debe mostrar una propuesta antes de confirmarse.
8. Definir cómo se distingue la captura de audio original de su interpretación.
9. Definir cómo se presenta una contradicción entre fuentes.
10. Definir cómo se presenta una contradicción entre un resumen y su fuente.
11. Definir qué relaciones sugeridas requieren confirmación explícita.
12. Definir cómo el usuario corrige o rechaza una relación propuesta.
13. Definir si las posibles coincidencias de personas se mostrarán durante el MVP.
14. Definir qué información derivada, si alguna, puede conservarse después de ser rechazada.
15. Definir cómo se mide la utilidad de una detección o sugerencia.
16. Definir los umbrales de calidad necesarios para habilitar cada capacidad opcional.
17. Definir el comportamiento cuando no existe información autorizada suficiente para responder.

Hasta resolver estas decisiones, la IA debe limitarse a propuestas con procedencia, incertidumbre, autorización y control explícito del usuario.

## 26. Resumen

La Inteligencia Artificial es una capacidad transversal de Ping.

Puede interpretar, detectar, extraer, resumir, relacionar, explicar y sugerir. Su función es ayudar al usuario y a Conversation, Commitment, People y Memory.

La regla de acción es:

> La IA propone; el usuario decide.

La regla de verdad es:

> Una salida derivada nunca sustituye la fuente ni la información confirmada.

La regla de confianza es:

> Toda ayuda conserva procedencia, expresa incertidumbre y respeta autorización.

Conversation conserva mensajes y capturas. Commitment conserva compromisos y su ciclo de vida. People conserva identidad y relaciones. Memory conserva información relevante y recuperable. La IA no modifica ninguno de ellos por iniciativa propia.

La IA no es un agente autónomo, un reemplazo del usuario, una fuente de verdad, un motor de automatización sin control ni un dominio de negocio.

Su valor consiste en reducir el esfuerzo de comprender información natural sin quitar al usuario el control sobre lo que Ping confirma, recuerda, relaciona o ejecuta.
