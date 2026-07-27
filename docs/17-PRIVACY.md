# Ping — Privacy

## 1. Propósito

Este documento define el significado conceptual y funcional de Privacy dentro de Ping.

Privacy protege la información de las personas mediante límites sobre:

- qué información se obtiene;
- para qué propósito se utiliza;
- quién puede verla;
- qué relaciones pueden establecerse;
- qué información puede derivarse;
- cuánto contexto se conserva;
- qué puede compartirse;
- qué usos deben cesar;
- qué puede corregirse o eliminarse;
- qué evidencia histórica puede permanecer.

El propósito de Ping es ayudar al usuario a capturar, recordar, seguir y resolver asuntos con contexto. Ese propósito no autoriza a recopilar, relacionar, inferir o conservar toda la información técnicamente disponible.

Privacy debe aplicarse a:

- información original;
- copias locales;
- referencias;
- resúmenes;
- clasificaciones;
- inferencias;
- relaciones sugeridas;
- memoria;
- resultados de búsqueda;
- evidencia auditable;
- archivos;
- notificaciones.

La privacidad es una responsabilidad transversal. Ningún dominio puede ampliar silenciosamente el propósito o el uso de la información.

---

## 2. Alcance y frontera técnica

Este documento define:

- principios de minimización;
- límites de propósito;
- consentimiento cuando corresponda;
- visibilidad;
- uso permitido;
- tratamiento de terceros;
- sensibilidad;
- corrección;
- revocación;
- eliminación;
- conservación;
- exportación;
- explicabilidad;
- relación con la historia.

No define:

- cifrado;
- infraestructura;
- proveedores;
- almacenamiento;
- controles técnicos;
- formatos;
- protocolos;
- plazos regulatorios;
- jurisdicciones;
- políticas legales específicas;
- mecanismos de cumplimiento.

La arquitectura futura deberá implementar estas reglas sin alterar su significado.

---

## 3. Qué es Privacy

Privacy es la capacidad de mantener la información dentro de límites comprensibles y legítimos para la persona y el propósito del producto.

Privacy permite responder:

- ¿por qué necesita Ping esta información?;
- ¿para qué puede usarla?;
- ¿quién puede verla?;
- ¿qué parte es necesaria?;
- ¿qué información se deriva?;
- ¿qué incertidumbre existe?;
- ¿qué puede corregirse?;
- ¿qué puede dejar de usarse?;
- ¿qué puede eliminarse?;
- ¿qué evidencia mínima debe conservarse?;
- ¿qué ocurre cuando cambia una autorización?;

Privacy no consiste únicamente en ocultar contenido. También limita recolección, relación, derivación, conservación y reutilización.

---

## 4. Qué no es Privacy

Privacy no es:

- sinónimo de Authorization;
- una configuración técnica;
- una casilla genérica de consentimiento;
- una promesa de secreto absoluto;
- una justificación para eliminar la historia;
- una forma de impedir toda trazabilidad;
- una autorización para conservar todo por seguridad;
- una regla idéntica para toda información;
- una política legal concreta;
- una característica opcional posterior.

Privacy nunca debe utilizarse para:

- ocultar al usuario qué información usa Ping;
- justificar inferencias no confirmadas;
- conservar perfiles exhaustivos;
- impedir correcciones legítimas;
- ampliar el uso más allá del propósito;
- presentar como anónimo algo que sigue siendo relacionable con una persona;
- falsificar hechos históricos.

---

## 5. Privacy y Authorization

Authorization y Privacy se relacionan, pero no son lo mismo.

### Authorization

Authorization determina quién puede realizar una acción sobre un recurso dentro de un alcance.

Responde preguntas como:

- ¿puede consultar?;
- ¿puede modificar?;
- ¿puede confirmar?;
- ¿puede compartir?;
- ¿puede eliminar?;

### Privacy

Privacy limita:

- qué información debería existir;
- para qué puede utilizarse;
- cuánto contexto es proporcional;
- qué puede derivarse;
- cuánto tiempo conserva relevancia;
- qué usos deben cesar;
- qué puede mostrarse incluso a una persona autorizada.

Tener acceso no permite usar la información para cualquier propósito.

Una persona puede estar autorizada a leer una conversación para participar en ella, pero no por eso puede:

- construir un perfil exhaustivo de los participantes;
- reutilizarla para otro asunto;
- incorporar todo su contenido a Memory;
- inferir información sensible;
- compartirla fuera del alcance;
- conservarla indefinidamente.

Authorization es necesaria, pero no suficiente para proteger privacidad.

---

## 6. Principios de privacidad

Ping debe respetar los siguientes principios:

### Propósito comprensible

Toda información debe tener una razón vinculada con capturar, recordar, seguir o resolver asuntos.

### Minimización

Ping utiliza únicamente la información necesaria para el propósito autorizado.

### Proporcionalidad

El nivel de detalle, relación y conservación debe guardar relación con el valor y sensibilidad del asunto.

### Separación de contextos

La información obtenida para un asunto no se traslada automáticamente a otro.

### Control del usuario

El usuario debe poder comprender, corregir y tomar decisiones cuando corresponda.

### Incertidumbre visible

Ping no completa datos personales ni sensibles mediante inferencia silenciosa.

### Procedencia

La información y sus derivados deben conservar origen comprensible.

### Privacidad de terceros

La información sobre personas que no usan Ping requiere límites especiales.

### Uso limitado

Una capacidad autorizada para un propósito no habilita usos ajenos.

### Historia proporcional

La trazabilidad conserva evidencia necesaria sin justificar conservación ilimitada de contenido.

---

## 7. Propósito

El propósito define por qué una información puede utilizarse.

Los propósitos centrales de Ping son:

- capturar algo que el usuario no quiere perder;
- conservar contexto relevante;
- confirmar compromisos;
- ayudar al seguimiento;
- registrar avances;
- comprender relaciones necesarias;
- recuperar información autorizada;
- registrar resultados;
- reconstruir la evolución relevante.

Un propósito debe ser:

- específico;
- comprensible;
- relacionado con una necesidad del usuario;
- compatible con la fuente y el contexto;
- limitado por autorización;
- revisable cuando cambia el asunto.

No son propósitos válidos por sí mismos:

- “por si acaso”;
- “porque puede ser útil algún día”;
- “porque está disponible”;
- “para mejorar todo”;
- “para conocer mejor a la persona”;
- “porque la IA puede inferirlo”.

Un nuevo propósito requiere una decisión explícita de producto y, cuando corresponda, control o consentimiento de la persona.

---

## 8. Limitación de propósito

La limitación de propósito impide que información obtenida para una función se reutilice silenciosamente en otra.

Ejemplos:

- una conversación compartida no alimenta toda la memoria personal de cada participante;
- un archivo asociado a un compromiso no construye un perfil de la persona mencionada;
- una búsqueda por persona no autoriza nuevas relaciones;
- una notificación no autoriza exponer todo el contexto;
- una evidencia de auditoría no se convierte en contenido promocional;
- un resumen de IA no se reutiliza como fuente de identidad;
- una ubicación mencionada no se transforma en seguimiento de movimientos;
- una responsabilidad en un compromiso no se convierte en evaluación de desempeño.

Cuando un uso nuevo no es claramente compatible:

- no debe asumirse;
- debe mantenerse separado;
- requiere una decisión pendiente;
- puede requerir confirmación o consentimiento;
- debe respetar a terceros y autorizaciones.

---

## 9. Minimización de información

Minimizar significa obtener, mostrar, relacionar, derivar y conservar sólo lo necesario.

La minimización aplica a:

- cantidad;
- detalle;
- alcance temporal;
- número de personas relacionadas;
- fuentes consultadas;
- contexto recuperado;
- fragmentos mostrados;
- derivados de IA;
- evidencia auditable;
- copias locales;
- notificaciones.

Ping debe preferir:

- una referencia suficiente antes que una copia completa;
- contexto relevante antes que historial exhaustivo;
- identidad comprensible antes que perfil enriquecido;
- resultado necesario antes que datos secundarios;
- evidencia mínima antes que duplicación de fuentes;
- incertidumbre antes que completar información.

Minimizar no significa eliminar contexto necesario para comprender un compromiso o resultado. Significa conservar lo suficiente sin expandirse innecesariamente.

---

## 10. Categorías conceptuales de información

La privacidad depende de qué representa la información.

### Información del propio usuario

Datos, decisiones, conversaciones, compromisos y preferencias vinculados directamente al usuario.

### Información compartida

Contenido disponible para más de una persona dentro de un recurso y alcance específicos.

### Información sobre terceros

Datos o referencias sobre personas que pueden no usar Ping ni haber participado directamente.

### Información sensible

Información cuyo uso, exposición o inferencia puede causar un impacto especialmente significativo.

### Información derivada

Resúmenes, clasificaciones, relaciones, explicaciones o inferencias producidas desde fuentes.

### Información local

Contenido disponible en un dispositivo, confirmado o pendiente.

### Evidencia histórica

Información mínima necesaria para explicar hechos, decisiones y cambios relevantes.

Una misma información puede pertenecer a varias categorías y requerir límites más estrictos según su contexto.

---

## 11. Información sensible

La sensibilidad no depende únicamente del tipo de dato. También depende de:

- contexto;
- persona;
- relación;
- propósito;
- combinación con otras fuentes;
- alcance de visibilidad;
- consecuencias posibles;
- momento.

Puede ser sensible información relacionada con:

- salud;
- situación financiera;
- asuntos legales;
- relaciones personales;
- identidad;
- ubicación;
- credenciales;
- menores;
- conflictos laborales;
- decisiones privadas;
- contenido íntimo;
- inferencias de alto impacto.

Ping no debe:

- inferir información sensible para completar perfiles;
- ampliar el contexto para buscar señales sensibles;
- presentar una inferencia como hecho;
- usar sensibilidad para fines ajenos al asunto;
- mostrar fragmentos sensibles sin necesidad;
- incluir contenido sensible en notificaciones innecesarias.

La definición operativa de categorías sensibles permanece pendiente y no constituye una clasificación legal en este documento.

---

## 12. Información sobre terceros

People debe poder representar personas mencionadas en conversaciones o compromisos aunque no usen Ping.

Esa necesidad no autoriza a construir perfiles exhaustivos.

La información sobre terceros debe:

- limitarse al asunto relevante;
- conservar procedencia;
- distinguir mención de identidad confirmada;
- evitar completar datos faltantes;
- evitar relaciones no confirmadas;
- mantenerse dentro del propósito;
- respetar visibilidad y autorización;
- poder corregirse cuando corresponda.

Ping no debe asumir que una persona:

- consintió todo uso por haber sido mencionada;
- es usuaria registrada;
- posee un identificador completo;
- corresponde a otra referencia parecida;
- mantiene una relación permanente;
- puede ser perfilada con información de distintos asuntos.

Cuando exista incertidumbre, debe conservarse como referencia incompleta.

---

## 13. Consentimiento

El consentimiento puede ser necesario cuando una decisión de producto o el contexto requiera una elección informada de la persona.

Cuando corresponda, debe ser:

- comprensible;
- específico;
- relacionado con un propósito;
- diferenciado de otros permisos;
- libre de consecuencias engañosas;
- revocable para usos futuros;
- trazable sin conservar contenido innecesario.

El consentimiento no debe:

- obtenerse de forma genérica para cualquier uso;
- confundirse con aceptación de un compromiso;
- presumirse por usar Ping;
- inferirse por silencio;
- autorizar usos incompatibles;
- convertir información de terceros en pública;
- sustituir Authorization.

No toda función de Ping depende necesariamente de consentimiento. La base conceptual aplicable a cada uso y las experiencias concretas permanecen pendientes.

---

## 14. Visibilidad, acceso y uso

Privacy distingue tres conceptos:

### Visibilidad

Qué información puede presentarse a una persona en un contexto.

### Acceso

Qué recurso y acciones permite Authorization.

### Uso

Para qué propósito puede procesarse o relacionarse la información.

Una persona puede tener acceso a un recurso y aun así:

- no necesitar todo su contenido visible;
- no poder reutilizarlo en otro contexto;
- no poder exportarlo completo;
- no poder derivar información sensible;
- no poder compartirlo;
- no poder incorporarlo a memoria permanente.

Ping debe limitar:

- fragmentos;
- vistas previas;
- nombres;
- relaciones;
- conteos;
- resultados;
- contexto adicional;
- información derivada.

Ocultar el contenido principal no basta si metadatos, coincidencias o relaciones revelan información protegida.

---

## 15. Conversation y conversaciones compartidas

Conversation conserva mensajes, participantes y procedencia.

Privacy debe asegurar que:

- una conversación pertenece a un contexto;
- compartirla no comparte toda la memoria del usuario;
- un participante sólo conoce el alcance autorizado;
- incorporar una persona no expone automáticamente historia anterior;
- retirar acceso limita usos futuros;
- un mensaje no se reutiliza fuera de propósito;
- los archivos mantienen sus propios límites;
- los derivados de IA no amplían la conversación visible.

En conversaciones compartidas:

- cada participante puede tener distinto alcance;
- un mensaje puede mencionar terceros;
- un compromiso derivado puede necesitar contexto mínimo;
- una revocación puede limitar contenido futuro;
- la historia autorizada no implica acceso perpetuo.

Los detalles sobre propiedad, incorporación, retiro e historia anterior continúan como decisiones pendientes de colaboración.

---

## 16. Commitment

Commitment conserva compromisos con contexto, responsable, seguimiento y resolución.

Privacy debe limitar:

- quién conoce el compromiso;
- cuánto contexto de origen se muestra;
- qué información del responsable es necesaria;
- qué seguimientos se comparten;
- qué resultado puede verse;
- qué fuentes privadas permanecen ocultas;
- qué derivados se conservan.

Compartir un compromiso no implica compartir:

- toda la conversación de origen;
- otros compromisos de las personas;
- su memoria;
- archivos no relacionados;
- información sensible innecesaria.

El responsable debe ser comprensible, pero no necesita un perfil completo.

La trazabilidad del compromiso conserva evolución relevante sin justificar conservar indefinidamente todo contenido asociado.

---

## 17. People e identidad

People conserva identidad y relaciones desde la perspectiva del usuario.

Privacy exige:

- representación mínima;
- relaciones contextualizadas;
- referencias corregibles;
- separación entre asuntos;
- límites para personas no registradas;
- no fusionar identidades por inferencia;
- no enriquecer perfiles automáticamente;
- no crear reputación;
- no convertir relaciones en información pública.

La identidad debe distinguir:

- propio usuario;
- persona confirmada;
- contacto conocido;
- participante autorizado;
- responsable;
- referencia incompleta;
- posible coincidencia.

Una posible coincidencia permanece como propuesta.

People no debe reunir toda mención de una persona para producir una visión exhaustiva de su vida, conducta o relaciones.

---

## 18. Memory

Memory conserva únicamente aquello que debe poder recordarse y recuperarse con contexto.

Privacy impide que Memory se convierta en:

- perfil exhaustivo;
- historial completo;
- cronología infinita;
- recopilación de todo lo ocurrido;
- depósito de inferencias;
- copia permanente de conversaciones;
- mecanismo para evitar eliminaciones.

Un recuerdo debe:

- tener propósito;
- ser relevante;
- conservar procedencia;
- mantener contexto suficiente;
- respetar autorización;
- distinguir hechos de derivados;
- reconocer correcciones;
- dejar de utilizarse cuando corresponda.

Recordar no equivale a conservar todo.

La relevancia puede cambiar. Un recuerdo puede perder vigencia sin que los hechos históricos dejen de haber ocurrido.

---

## 19. IA e información derivada

La privacidad aplica tanto a las fuentes como a las salidas de IA.

La IA sólo puede utilizar:

- información autorizada;
- contexto necesario;
- fuentes compatibles con el propósito;
- relaciones confirmadas o claramente marcadas como propuestas.

La IA no debe:

- ampliar contexto por iniciativa propia;
- buscar datos personales ajenos al asunto;
- inferir información sensible sin autorización y propósito explícitos;
- completar identidades;
- crear perfiles;
- convertir patrones en hechos;
- conservar una inferencia como memoria permanente;
- usar una conversación privada para otro propósito;
- presentar una derivación como fuente.

Toda información derivada debe conservar:

- fuentes;
- propósito;
- tipo de derivación;
- incertidumbre;
- momento;
- decisión humana posterior cuando exista.

Corregir o eliminar una fuente puede afectar la vigencia y el uso futuro de sus derivados.

---

## 20. Files & Attachments

Un archivo representa evidencia, soporte o contenido asociado a un recurso.

Privacy debe limitar:

- quién puede acceder;
- para qué se utiliza;
- qué contenido se interpreta;
- qué fragmentos se muestran;
- qué derivados se producen;
- qué versiones se conservan;
- qué ocurre al eliminarlo;
- qué referencias permanecen.

Asociar un archivo no autoriza:

- usarlo para otros asuntos;
- interpretar todo su contenido;
- extraer información de terceros no necesaria;
- crear perfiles;
- compartirlo fuera del recurso;
- conservar sus derivados indefinidamente.

Si un archivo es eliminado:

- el contenido puede dejar de estar disponible;
- la historia puede reconocer que existió;
- la traza no debe reconstruirlo;
- los derivados deben revisarse según propósito y autorización;
- no se falsifican hechos anteriores.

---

## 21. Search y Retrieval

### Search

Search puede revelar información no sólo mediante el resultado completo, sino también mediante:

- coincidencias;
- ausencia o presencia;
- conteos;
- orden;
- nombres;
- fragmentos;
- filtros;
- relaciones sugeridas.

Search debe aplicar privacidad antes de presentar cualquier señal.

No debe:

- confirmar la existencia de un recurso no autorizado;
- mostrar fragmentos protegidos;
- permitir inferir relaciones sensibles;
- combinar asuntos para crear perfiles;
- ampliar el propósito de una consulta.

### Retrieval

Retrieval recupera información con contexto suficiente.

Debe evitar:

- exceso de contexto;
- fuentes no necesarias;
- contenido de terceros sin relación;
- conversaciones privadas completas para explicar un compromiso;
- derivados que revelen información restringida;
- reconstrucciones que evadan una revocación.

No encontrar algo no demuestra inexistencia. No poder mostrar algo no autoriza a describirlo indirectamente.

---

## 22. Notifications

Notifications debe comunicar sólo la información necesaria para llamar la atención del destinatario autorizado.

Privacy debe limitar:

- contenido visible;
- identidad mostrada;
- asunto;
- fragmentos;
- prioridad;
- referencias a personas;
- información sensible;
- contexto de conversaciones privadas.

Una notificación puede expresar:

- que existe algo pendiente;
- que una acción fue rechazada;
- que se requiere revisión;
- que cambió una autorización;

sin revelar el contenido completo.

El hecho de que una persona pueda recibir una notificación no implica que deba recibir todo el contexto.

Una notificación deja de ser apropiada cuando pierde vigencia, cambia autorización o su propósito ya no existe.

---

## 23. Audit & Traceability

Audit conserva evidencia proporcional. Traceability relaciona origen, contexto, transformación y resultado.

Privacy limita:

- qué evidencia se conserva;
- cuánto detalle contiene;
- quién puede consultarla;
- para qué propósito;
- durante cuánto tiempo conserva relevancia;
- qué contenido debe quedar fuera;
- cómo se presenta evidencia parcial.

Audit & Traceability no justifican:

- conservación ilimitada;
- duplicación de fuentes;
- acceso universal;
- registro de cada clic;
- retención de contenido eliminado;
- exposición de información sensible;
- reconstrucción de perfiles.

Puede conservarse evidencia mínima de que:

- una acción ocurrió;
- una acción fue rechazada;
- existió una autorización;
- se produjo una revocación;
- una fuente fue eliminada;
- una decisión cambió.

Esto no obliga a conservar el contenido completo.

---

## 24. Events

Events representa hechos relevantes del negocio.

Privacy no convierte un hecho ocurrido en inexistente, pero puede limitar:

- visibilidad;
- contenido;
- retención;
- detalle;
- relaciones expuestas;
- acceso futuro.

Un evento puede seguir siendo conceptualmente parte de la historia aunque:

- su fuente haya sido eliminada;
- parte del contenido ya no sea visible;
- una autorización haya sido revocada;
- la persona solicitante no pueda consultarlo.

La inmutabilidad conceptual no significa conservación infinita ni acceso permanente.

Una corrección produce un hecho posterior sin reescribir el anterior.

---

## 25. Offline First e información local

La información local está sujeta a los mismos límites de privacidad.

Disponible localmente no significa:

- autorizado indefinidamente;
- vigente;
- reutilizable;
- exportable sin límites;
- apto para derivaciones;
- inmune a revocación;
- necesario de conservar.

Offline First debe:

- minimizar información local;
- distinguir contenido confirmado y pendiente;
- reconocer posible desactualización;
- aplicar revocaciones cuando puedan conocerse;
- limitar usos mientras exista incertidumbre;
- no usar copias locales para evadir Authorization;
- no consolidar derivados no confirmados.

La política exacta de disponibilidad y conservación local permanece pendiente.

---

## 26. Synchronization y múltiples dispositivos

Synchronization relaciona cambios realizados en distintos momentos y dispositivos.

Privacy debe asegurar que:

- cada dispositivo recibe sólo información necesaria y autorizada;
- un dispositivo anterior no conserva derechos futuros;
- una revocación limita usos posteriores;
- información eliminada no reaparece silenciosamente;
- derivados se revisan cuando cambian sus fuentes;
- conflictos no revelan contenido protegido;
- duplicados no multiplican innecesariamente información personal.

En múltiples dispositivos:

- puede existir distinta información local;
- la autorización puede conocerse en momentos diferentes;
- una acción pendiente puede ser rechazada;
- un contenido puede dejar de estar disponible;
- una exportación o copia anterior no amplía el propósito.

Synchronization no debe restablecer información sólo porque existió en otro dispositivo.

---

## 27. Revocación

Una revocación limita accesos y usos futuros dentro de su alcance.

Puede afectar:

- participación;
- consulta;
- modificación;
- compartición;
- uso de IA;
- Memory;
- Search;
- Retrieval;
- notificaciones;
- información local;
- archivos;
- derivados.

La revocación debe:

- aplicarse cuando Ping pueda conocerla;
- impedir nuevos usos no autorizados;
- detener derivaciones futuras;
- limitar recuperación;
- revisar acciones pendientes;
- evitar nuevas exposiciones;
- mantener una explicación mínima autorizada.

No necesariamente:

- borra hechos históricos;
- elimina decisiones ya ocurridas;
- obliga a fingir que nunca existió acceso;
- conserva el contenido completo.

El alcance exacto de revocación sobre copias, derivados y evidencia permanece pendiente.

---

## 28. Eliminación

Eliminar puede significar retirar contenido, una relación, un derivado o un recurso dentro de un alcance autorizado.

Privacy debe distinguir:

- contenido;
- referencia;
- relación;
- recuerdo;
- derivado;
- evidencia mínima;
- hecho histórico.

Eliminar contenido no siempre elimina el hecho de que:

- existió;
- fue compartido;
- originó una decisión;
- produjo un compromiso;
- fue corregido;
- fue eliminado posteriormente.

Pero reconocer el hecho no obliga a conservar:

- contenido completo;
- copia del archivo;
- conversación;
- resumen;
- inferencias;
- fragmentos;
- datos personales innecesarios.

La eliminación no debe:

- falsificar la historia;
- utilizarse para ocultar decisiones;
- quedar neutralizada por copias o derivados;
- crear conservación ilimitada bajo la etiqueta de auditoría.

---

## 29. Conservación

Conservar información requiere:

- propósito vigente;
- relevancia;
- proporcionalidad;
- autorización;
- consideración de sensibilidad;
- relación con fuentes;
- revisión ante corrección, revocación o eliminación.

Ping no debe conservar información:

- sólo porque puede;
- por utilidad hipotética indefinida;
- para construir perfiles;
- después de perder todo propósito;
- duplicada sin necesidad;
- derivada sin procedencia;
- localmente sin límites.

La conservación puede ser distinta para:

- fuente;
- referencia;
- compromiso;
- recuerdo;
- archivo;
- derivado;
- evidencia histórica.

Este documento no define plazos. Los criterios y períodos concretos permanecen pendientes.

---

## 30. Corrección

Las personas deben poder corregir información cuando corresponda a su relación, propiedad y autorización.

La corrección puede afectar:

- identidad;
- relación;
- contexto;
- responsable;
- fecha;
- estado;
- recuerdo;
- resumen;
- clasificación;
- inferencia;
- procedencia atribuida.

Corregir no significa reescribir silenciosamente la historia.

Ping debe:

- mostrar la información vigente;
- conservar relación con la corrección cuando sea relevante;
- revisar derivados;
- evitar que la información incorrecta siga utilizándose;
- distinguir declaración original de lectura actual;
- limitar visibilidad de la versión anterior según privacidad.

Si la corrección revela que una inferencia era falsa, Ping no debe seguir tratándola como posibilidad equivalente.

---

## 31. Exportación

Exportar significa permitir que una persona obtenga una representación autorizada de información relacionada con ella o bajo su propiedad.

Una exportación debe:

- tener alcance comprensible;
- respetar propósito;
- incluir sólo información autorizada;
- distinguir fuentes y derivados;
- indicar pendientes o incertidumbre;
- respetar terceros;
- excluir información protegida de otras personas;
- reconocer contenido eliminado o no disponible sin reconstruirlo.

Exportar no implica:

- acceso a toda evidencia;
- acceso a conversaciones privadas de terceros;
- propiedad sobre información compartida;
- derecho a perfiles inferidos;
- ampliación de permisos;
- exposición de mecanismos internos.

El alcance, experiencia y representación concreta de exportación permanecen pendientes.

---

## 32. Explicabilidad

La persona debe poder comprender, cuando corresponda:

- qué información utiliza Ping;
- de qué fuente proviene;
- para qué propósito;
- qué derivación produjo la IA;
- qué incertidumbre existe;
- quién puede verla;
- por qué aparece en Search o Memory;
- por qué una acción fue rechazada;
- qué cambió tras una revocación o eliminación;
- qué evidencia histórica permanece.

Explicar no debe:

- revelar información no autorizada;
- duplicar fuentes completas;
- exponer datos sensibles innecesarios;
- convertir una derivación en verdad;
- atribuir certeza inexistente;
- divulgar información de terceros.

La explicación puede ser parcial cuando la privacidad de otras personas limita el detalle. Esa limitación debe expresarse sin insinuar contenido protegido.

---

## 33. Privacidad y reconstrucción histórica

Privacy y reconstrucción histórica deben coexistir.

La reconstrucción histórica necesita evidencia suficiente para comprender:

- origen;
- actor;
- intención;
- decisión;
- cambio;
- rechazo;
- resultado;
- corrección;
- eliminación.

Privacy limita:

- contenido visible;
- detalle;
- identidades;
- período;
- fuentes recuperables;
- derivados;
- propósito de consulta.

Una reconstrucción puede afirmar:

- “Existió un archivo y fue eliminado”.
- “La acción fue rechazada”.
- “La autorización fue revocada”.
- “Una corrección cambió la información vigente”.

sin conservar o mostrar:

- archivo;
- conversación completa;
- motivo sensible;
- identidad no autorizada;
- derivado eliminado.

La historia no debe falsificarse, pero tampoco debe utilizarse como excusa para conservar todo.

---

## 34. Uso secundario y cambio de contexto

Existe uso secundario cuando la información se utiliza para un propósito distinto del que justificó su obtención.

Ejemplos de riesgo:

- usar compromisos para evaluar productividad personal;
- usar conversaciones para perfilar relaciones;
- usar archivos para inferir salud o finanzas;
- usar Search para descubrir información ajena;
- usar Audit para vigilar actividad;
- usar notificaciones para exponer hábitos;
- usar Memory para acumular toda mención;
- usar IA para clasificar personas.

Antes de cualquier uso secundario, Ping debe considerar:

- compatibilidad con el propósito original;
- necesidad;
- proporcionalidad;
- autorización;
- privacidad de terceros;
- sensibilidad;
- explicabilidad;
- control o consentimiento requerido.

Si no existe una decisión aprobada, el nuevo uso no debe realizarse.

---

## 35. Estados y comunicaciones de privacidad

Ping debe comunicar privacidad con lenguaje funcional y comprensible.

Puede expresar:

- “Visible sólo para ti”.
- “Compartido dentro de esta conversación”.
- “Este compromiso no incluye la conversación privada de origen”.
- “Esta información fue derivada por IA”.
- “La fuente ya no está disponible”.
- “El acceso fue revocado”.
- “Parte del contexto no puede mostrarse”.
- “Esta referencia de persona está incompleta”.
- “Esta información puede estar desactualizada”.
- “El contenido fue eliminado; se conserva sólo el hecho histórico necesario”.

Debe evitar:

- afirmaciones absolutas que no puede sostener;
- mensajes legales genéricos como única explicación;
- detalles técnicos;
- ocultar el propósito;
- presentar inferencias como datos personales confirmados;
- sugerir que estar autorizado elimina todos los límites.

---

## 36. Errores y situaciones ambiguas

### Propósito no determinado

La información no debe recopilarse ni reutilizarse hasta aclarar el propósito.

### Persona mencionada sin identidad completa

Ping conserva una referencia incompleta y no busca completar el perfil por inferencia.

### Información posiblemente sensible

Debe tratarse con cautela y no ampliarse ni derivarse silenciosamente.

### Fuente eliminada con derivados existentes

Los derivados deben revisarse según propósito, procedencia y autorización. No adquieren independencia automática.

### Revocación durante desconexión

El uso futuro se limita cuando Ping conoce la revocación. La copia local no conserva el derecho.

### Resultado de Search que revela existencia

No debe mostrarse si la mera coincidencia expone información no autorizada.

### Explicación que involucra a terceros

Ping limita detalle e identidad sin inventar una explicación alternativa.

### Solicitud de eliminación con historia relevante

Se distingue contenido de evidencia mínima. No se conserva todo ni se falsifica lo ocurrido.

### Información contradictoria

Ping muestra incertidumbre, procedencia y corrección. No fusiona datos personales silenciosamente.

### Uso nuevo aparentemente útil

La utilidad no sustituye propósito, autorización ni control.

---

## 37. Reglas e invariantes

1. Authorization y Privacy no son equivalentes.
2. Tener acceso no autoriza cualquier uso.
3. Toda información necesita un propósito comprensible.
4. Ping no recopila información sólo porque puede hacerlo.
5. La información se minimiza por cantidad, detalle, contexto y tiempo.
6. Un nuevo propósito no se asume silenciosamente.
7. La información de terceros requiere límites especiales.
8. Una mención no confirma identidad.
9. Una referencia incompleta permanece incompleta.
10. People no construye perfiles exhaustivos.
11. Memory no conserva todo.
12. Memory no se convierte en perfil permanente.
13. La IA no amplía contexto por iniciativa propia.
14. La IA no infiere información sensible sin propósito y autorización.
15. Una inferencia no es un hecho.
16. La información derivada conserva procedencia.
17. La privacidad aplica a fuentes y derivados.
18. Search no revela existencia mediante coincidencias no autorizadas.
19. Search no revela información mediante fragmentos, orden o conteos.
20. Retrieval recupera sólo contexto necesario y autorizado.
21. Una notificación minimiza contenido.
22. Audit no justifica conservación ilimitada.
23. Traceability no amplía visibilidad.
24. No toda evidencia es visible para todos.
25. Events no exige acceso permanente.
26. La información local no conserva permisos indefinidamente.
27. Un dispositivo no amplía el propósito.
28. Synchronization no restaura información eliminada sin una razón válida.
29. Una revocación limita usos futuros.
30. La revocación no falsifica hechos anteriores.
31. Eliminar contenido no siempre elimina el hecho histórico.
32. Conservar el hecho no obliga a conservar el contenido.
33. Una eliminación debe alcanzar derivados cuando corresponda.
34. Una corrección no reescribe silenciosamente la historia.
35. La información corregida no debe seguir utilizándose como vigente.
36. La conservación requiere propósito y relevancia.
37. La utilidad hipotética no justifica conservación indefinida.
38. Una exportación no amplía permisos.
39. Una exportación protege información de terceros.
40. La explicabilidad no revela contenido no autorizado.
41. La incertidumbre se reconoce en lugar de completar datos personales.
42. Un consentimiento genérico no autoriza cualquier uso.
43. El consentimiento no sustituye Authorization.
44. Compartir un recurso no comparte toda la memoria.
45. Compartir un compromiso no comparte toda la conversación de origen.
46. Un archivo no autoriza interpretar todo su contenido.
47. La reconstrucción histórica conserva evidencia proporcional.
48. La privacidad no falsifica la historia.
49. La historia no justifica conservar todo.
50. Privacy se aplica desde el diseño del comportamiento, no como corrección posterior.

---

## 38. Escenarios de validación

### Escenario 1: compromiso derivado de una conversación privada

- **Propósito:** seguir un asunto confirmado.
- **Información necesaria:** compromiso, responsable y contexto mínimo.
- **Información excluida:** mensajes privados no necesarios.
- **Visibilidad:** el participante autorizado ve el compromiso, no toda la conversación.
- **Resultado esperado:** existe contexto suficiente sin ampliar acceso.
- **Invariante:** compartir un compromiso no comparte toda su fuente.

### Escenario 2: persona no registrada mencionada

- **Propósito:** comprender quién está relacionado con un asunto.
- **Información disponible:** nombre parcial y contexto de una conversación.
- **Acción permitida:** crear una referencia incompleta.
- **Acción prohibida:** buscar o inferir identificadores adicionales.
- **Resultado esperado:** People conserva incertidumbre y procedencia.
- **Invariante:** una mención no crea un perfil.

### Escenario 3: IA sugiere información sensible

- **Fuente:** conversación autorizada.
- **Derivación:** la IA detecta un posible atributo sensible no necesario.
- **Propósito:** seguimiento de un compromiso que no requiere ese atributo.
- **Resultado esperado:** Ping no incorpora ni presenta la inferencia como contexto.
- **Invariante:** capacidad técnica no reemplaza propósito.

### Escenario 4: Search podría revelar un recurso privado

- **Consulta:** buscar por una persona.
- **Recurso existente:** conversación no autorizada.
- **Riesgo:** mostrar coincidencia, conteo o fragmento revelaría su existencia.
- **Resultado esperado:** Search no expone ninguna señal protegida.
- **Invariante:** la autorización se aplica antes de presentar resultados.

### Escenario 5: Retrieval necesita explicar un compromiso

- **Propósito:** comprender por qué existe.
- **Fuentes:** conversación extensa y archivo sensible.
- **Contexto necesario:** mensaje de origen y referencia mínima al archivo.
- **Resultado esperado:** Retrieval presenta sólo el contexto suficiente.
- **Invariante:** recuperar con contexto no significa recuperar todo.

### Escenario 6: revocación durante trabajo offline

- **Situación:** el dispositivo conserva una conversación compartida.
- **Cambio remoto:** se revoca acceso.
- **Acción local:** existe un mensaje pendiente.
- **Synchronization:** la acción es rechazada y el uso futuro se limita.
- **Resultado esperado:** la copia local no mantiene el derecho anterior.
- **Invariante:** disponibilidad local no equivale a autorización futura.

### Escenario 7: eliminación de un archivo usado como evidencia

- **Hecho anterior:** el archivo apoyó la resolución de un compromiso.
- **Decisión:** el contenido se elimina.
- **Historia necesaria:** reconocer que existió evidencia y luego fue eliminada.
- **Información no conservada:** contenido completo y derivados innecesarios.
- **Resultado esperado:** historia comprensible sin retención ilimitada.
- **Invariante:** eliminar no falsifica; auditar no conserva todo.

### Escenario 8: corrección de identidad

- **Situación:** una referencia fue asociada a la persona incorrecta.
- **Decisión:** el usuario corrige la relación.
- **Efecto:** People muestra la identidad vigente y los derivados se revisan.
- **Historia:** puede reconocerse que hubo una corrección.
- **Resultado esperado:** la atribución incorrecta deja de usarse.
- **Invariante:** corregir no significa ocultar ni perpetuar el error.

### Escenario 9: Memory pierde propósito

- **Situación:** un recuerdo dejó de ser relevante tras resolver y eliminar el asunto.
- **Revisión:** ya no existe propósito para recuperarlo como memoria activa.
- **Historia:** permanece evidencia mínima autorizada de la resolución.
- **Resultado esperado:** Memory deja de presentarlo sin borrar hechos necesarios.
- **Invariante:** relevancia no implica permanencia.

### Escenario 10: notificación de asunto sensible

- **Hecho:** un compromiso requiere atención.
- **Destinatario:** usuario autorizado.
- **Riesgo:** el texto completo revelaría información sensible.
- **Resultado esperado:** la notificación comunica atención requerida con contexto mínimo.
- **Invariante:** informar no exige exponer el asunto.

### Escenario 11: exportación con información de terceros

- **Solicitud:** el usuario exporta sus compromisos.
- **Contenido relacionado:** conversaciones y datos de otras personas.
- **Resultado esperado:** la exportación limita fuentes privadas y distingue relaciones necesarias.
- **Invariante:** exportar información propia no concede propiedad sobre toda información compartida.

### Escenario 12: auditoría de una búsqueda sensible

- **Propósito:** revisar un acceso relevante.
- **Evidencia necesaria:** actor, alcance, momento y resultado permitido.
- **Contenido innecesario:** copia de todos los resultados.
- **Resultado esperado:** Audit conserva evidencia proporcional.
- **Invariante:** trazabilidad no justifica duplicar contenido.

### Escenario 13: uso secundario de compromisos

- **Uso original:** seguimiento y resolución.
- **Uso propuesto:** evaluar productividad de una persona.
- **Problema:** el nuevo propósito no fue aprobado ni es necesario.
- **Resultado esperado:** Ping no realiza el uso secundario.
- **Invariante:** acceso y utilidad no autorizan un nuevo propósito.

### Escenario 14: explicación limitada por privacidad

- **Situación:** una acción fue rechazada por un cambio en un recurso privado.
- **Necesidad:** explicar el rechazo al actor.
- **Límite:** no revelar contenido ni identidad protegida.
- **Resultado esperado:** Ping explica que el contexto o autorización cambió.
- **Invariante:** explicabilidad y privacidad coexisten.

---

## 39. Criterios de aceptación

El modelo conceptual de Privacy se considera correctamente definido cuando:

1. Privacy se distingue claramente de Authorization.
2. Tener acceso no permite cualquier uso.
3. Todo uso se relaciona con un propósito comprensible.
4. La minimización aplica a recolección, visibilidad, derivación y conservación.
5. La información sensible recibe límites contextuales.
6. La información sobre terceros no produce perfiles exhaustivos.
7. El consentimiento se utiliza sólo cuando corresponde y no de forma genérica.
8. Conversation limita el contexto compartido.
9. Commitment no expone automáticamente su fuente privada.
10. People conserva identidad mínima y corregible.
11. Memory no se convierte en historial total.
12. La IA no amplía contexto ni confirma inferencias.
13. La información derivada queda sujeta a privacidad.
14. Files no autoriza uso completo o secundario.
15. Search no revela información mediante señales indirectas.
16. Retrieval limita el contexto a lo necesario.
17. Notifications minimiza contenido.
18. Audit & Traceability no justifica conservación ilimitada.
19. Events mantiene historia sin exigir acceso permanente.
20. Offline First respeta límites en información local.
21. Synchronization no restaura usos revocados.
22. Los múltiples dispositivos no amplían propósito.
23. La revocación limita usos futuros.
24. La eliminación distingue contenido de hecho histórico.
25. La conservación requiere propósito, relevancia y proporcionalidad.
26. Las correcciones afectan usos futuros y derivados.
27. La exportación respeta información de terceros.
28. La explicabilidad no revela contenido protegido.
29. La reconstrucción histórica conserva evidencia proporcional.
30. La incertidumbre evita completar datos personales por inferencia.
31. No se definen mecanismos técnicos, políticas legales ni plazos regulatorios.
32. Se mantiene coherencia con los documentos 00 al 16.

---

## 40. Decisiones pendientes

Las siguientes decisiones permanecen abiertas:

1. Definir los propósitos específicos habilitados durante la primera beta.
2. Definir cómo se comunican esos propósitos al usuario.
3. Definir qué usos requieren consentimiento.
4. Definir cómo se expresa y revoca el consentimiento cuando corresponda.
5. Definir categorías funcionales de información sensible.
6. Definir límites adicionales para información de terceros.
7. Definir qué información mínima representa una persona.
8. Definir cuándo una relación deja de ser relevante.
9. Definir qué información puede incorporar Memory.
10. Definir cuándo un recuerdo pierde propósito.
11. Definir qué fuentes puede utilizar la IA en cada caso.
12. Definir qué inferencias quedan prohibidas por sensibilidad.
13. Definir cómo se revisan derivados después de corregir una fuente.
14. Definir cómo se revisan derivados después de eliminar una fuente.
15. Definir qué contexto puede compartir un compromiso.
16. Definir el alcance de privacidad en colaboración básica.
17. Definir la visibilidad de historia anterior al incorporar participantes.
18. Definir el efecto de retirar participantes.
19. Definir qué información puede mostrarse en notificaciones.
20. Definir qué señales de Search pueden considerarse reveladoras.
21. Definir cuánto contexto puede recuperar Retrieval por tipo de recurso.
22. Definir qué búsquedas y recuperaciones son sensibles.
23. Definir qué evidencia puede conservar Audit.
24. Definir quién puede consultar evidencia y reconstrucciones.
25. Definir qué contenido histórico mínimo permanece tras eliminación.
26. Definir el efecto de revocaciones sobre copias locales.
27. Definir el efecto de revocaciones sobre derivados.
28. Definir el efecto de revocaciones sobre notificaciones previas.
29. Definir criterios conceptuales de conservación.
30. Definir períodos concretos de conservación en una fase autorizada posterior.
31. Definir criterios de eliminación.
32. Definir cómo se tratan copias y referencias.
33. Definir cómo se tratan conflictos entre eliminación e historia.
34. Definir el alcance de corrección por tipo de información.
35. Definir qué derivados deben volver a evaluarse tras una corrección.
36. Definir el alcance de exportación.
37. Definir cómo se protege información de terceros en una exportación.
38. Definir qué explicaciones deben estar disponibles.
39. Definir cómo se comunica una explicación parcial por privacidad.
40. Definir cómo se limita el uso secundario.
41. Definir qué usos nuevos requieren una decisión explícita del fundador.
42. Definir la relación entre Privacy, Business Rules y futuras decisiones arquitectónicas.
43. Definir en la arquitectura futura los mecanismos técnicos sin alterar estos límites conceptuales.

Hasta resolver estas decisiones, Ping no debe asumir silenciosamente propósito, consentimiento, sensibilidad, visibilidad, conservación, eliminación, exportación ni uso de información derivada.

---

## 41. Resumen

Privacy limita qué información utiliza Ping, para qué propósito, con qué alcance y durante cuánto tiempo conserva relevancia.

Authorization responde quién puede actuar. Privacy agrega una pregunta indispensable: incluso estando autorizado, ¿este uso es necesario, proporcional y compatible con el propósito?

Ping no recopila información sólo porque puede. Minimiza fuentes, contexto, derivados, memoria, evidencia y copias locales.

La información sobre terceros requiere límites especiales. People conserva identidad contextual, no perfiles exhaustivos. Memory recuerda lo relevante, no todo. La IA ayuda dentro de fuentes y propósitos autorizados, sin ampliar contexto ni inferir información sensible silenciosamente.

Search y Retrieval deben evitar revelaciones directas e indirectas. Notifications comunica con contexto mínimo. Files conserva evidencia asociada sin autorizar usos secundarios. Audit & Traceability conserva historia proporcional, no contenido ilimitado.

Una revocación limita usos futuros. Una eliminación puede retirar contenido sin falsificar que ocurrió un hecho. Reconocer historia no obliga a conservar la fuente.

La privacidad se aplica también a resúmenes, clasificaciones, inferencias y relaciones derivadas. La incertidumbre debe conservarse antes que completar datos personales.

La arquitectura futura decidirá los mecanismos. Toda implementación deberá respetar propósito, minimización, proporcionalidad, separación de contextos, control, procedencia y privacidad de terceros.
