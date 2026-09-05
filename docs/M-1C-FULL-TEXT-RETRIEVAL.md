# Full-text Retrieval Contract (M-1C)

Extiende `backend/src/services/retrieval.service.ts` (M-1B/M-1B.1) con relevancia textual real (Postgres tsvector/GIN) sobre `messages.content`, `commitments` (título/narrativa/resultado, pesado), y `audio_transcriptions.transcript_text`. No reemplaza el scope estructurado — lo complementa. Sin embeddings, sin vector, sin LLM, sin tocar Ping AI legacy.

## Contrato final — qué SÍ y qué NO ofrece M-1C

**SÍ ofrece:**
- FTS canónico sobre `messages.content`, `commitments` (pesado A/B/C), `audio_transcriptions.transcript_text` (sólo `completed`).
- Token/lexeme matching completo, AND/OR/exclusión vía `websearch_to_tsquery`.
- Phrase matching exacto (`phraseto_tsquery`) usado como bonus de ranking.
- Normalización de acentos vía `unaccent` (config `ping_text`), language-neutral.
- Diseño multilenguaje/domain-agnostic verificado (español, inglés, códigos, nombres propios).
- Índices GIN sobre las 3 columnas generadas.
- Autorización segura por defecto en toda función pública (M-1B.1 sin excepción).
- Provenance obligatorio en cada resultado.
- Ranking determinista y explicable (sin ML).

**NO ofrece** (verificado y corregido en M-1C.1 — no dejar ninguna afirmación en contrario en este documento):
- Prefix / autocompletar (`termino:*`) — no está conectado en ninguna de las 4 llamadas reales del servicio.
- Fuzzy / corrección de typos (`pg_trgm` u otra estrategia) — no instalado.
- Semantic / vector search, embeddings.
- Parsing de lenguaje natural (NLP) — el actor debe pasar `personId`/`query` ya resueltos.
- Integración con AI Agent / Ping AI legacy.

## Diseño global / domain-agnostic

**Ping es un producto global y horizontal** — vida personal, familia, trabajo, estudios, proyectos, viajes, salud administrativa, documentos, equipos, cualquier contexto del usuario. Ninguna decisión de este documento asume una industria, empresa o vocabulario específico:

- La configuración lingüística elegida (`ping_text`, ver abajo) es **language-neutral por construcción**: no aplica stemming de ningún idioma, así que no privilegia el español sobre el inglés/portugués/etc.
- Los pesos de ranking de `commitments` (A/B/C) son estructurales — por **rol del campo** (título vs. narrativa vs. resultado) — nunca por vocabulario, término o industria específica.
- El proxy de ranking (`computeTextRankProxy`) cuenta ocurrencias de término de forma literal, sin diccionario de dominio ni lista de palabras especiales.
- Los fixtures de test son deliberadamente neutrales (personas: Laura/Alex/Sofia/Daniel/Emily; temas: vacaciones, dentista, cumpleaños, "Proyecto Aurora", presupuesto, reunión) — nunca vocabulario de una industria del usuario real.

**Confirmación explícita (sección 25 del ticket): no existe ninguna lógica, índice, ranking, schema o comportamiento específico para una industria o empresa en este servicio.** El significado del lenguaje natural (resolver "Laura" a un `personId`, interpretar "las vacaciones" como intención) se resuelve en una futura capa Agent/Context — Retrieval sólo recibe filtros ya estructurados (`personId`, `textQuery`) y devuelve evidencia.

## Principio: estructura primero, texto complementa

El pipeline es siempre: **scope estructurado → autorización → full-text → ranking → provenance → dedupe**. Un `query` de texto se combina con **AND** sobre todo lo demás (`conversationId`, `personId`, `status`, `timeRange`) — nunca lo reemplaza, nunca lo amplía. La visibilidad canónica de commitments (`buildCommitmentVisibilityFilter`) y la autorización de conversaciones (`assertConversationParticipant`) siguen siendo la fuente de verdad de qué puede ver el actor; el texto sólo decide QUÉ TAN RELEVANTE es cada resultado dentro de eso.

El motor NO interpreta lenguaje natural complejo: un futuro Agent traduce "¿Qué habíamos hablado de las vacaciones con Laura?" a `{ personId: <id de Laura>, query: "vacaciones" }` — Retrieval recibe eso ya resuelto.

## Auditoría previa (resumen)

- `/search` (`backend/src/controllers/search.controller.ts`) usa `.ilike()` (substring, no FTS real) sobre `commitments.title/description/expected_result/next_action`, `messages.content`, `contacts.*`, `profiles.*`, `conversations.name`. Autoriza mensajes obteniendo primero los `conversation_participants` propios del actor (mismo patrón batch que este ticket implementa). No busca `audio_transcriptions`.
- Ninguna migración previa había creado `tsvector`, `GIN`, `pg_trgm` ni `unaccent`. Única extensión instalada antes de este ticket: `pgcrypto`.
- Columnas de texto confirmadas en schema real (no asumidas): `messages.content` (text, nullable); `commitments.title` (not null), `description`, `expected_result`, `next_action`, `resolution_result`, `rejection_reason` (todas text, nullable); `audio_transcriptions.transcript_text` (text, nullable, sin `message_id` propio — se une vía `attachments.message_id`).
- Índices existentes relevantes: `commitments_conversation_idx` ya existe dedicado; `owner_user_id`/`assigned_to_user_id`/`commitment_events.commitment_id`/`attachments.context_conversation_id` sólo existen como columna izquierda de índices compuestos.

## Configuración lingüística: `ping_text` (custom), NO `spanish`

**Elección inicial rechazada tras evidencia real**: se evaluó `spanish` primero (por ser el idioma del equipo), pero al probarlo contra ejemplos GLOBALES reales se encontró un defecto de diseño serio:

```sql
select to_tsvector('spanish', 'Proyecto Aurora Dr. Smith budget reunión');
-- 'auror':2 'budget':5 'dr':3 'proyect':1 'reunion':6 'smith':4
```

`spanish` **stemea nombres propios** ("Proyecto" → `proyect`, "Aurora" → `auror`) sólo por aplicar reglas gramaticales españolas a CUALQUIER texto, sin importar el idioma real de esa palabra. Para un producto horizontal donde el contenido puede incluir nombres de proyectos, personas o lugares en cualquier idioma, esto es inaceptable — privilegia la gramática de un idioma sobre el contenido real del usuario.

**Configuración elegida: `ping_text`** — un text search config nuevo (`create text search configuration public.ping_text (copy = simple)`), definido como el parser `simple` (sin stemming de NINGÚN idioma) con `unaccent` intercalado antes del diccionario simple:

```sql
create extension if not exists unaccent;
create text search configuration public.ping_text (copy = simple);
alter text search configuration public.ping_text
    alter mapping for hword, hword_part, word
    with unaccent, simple;
```

Comparación verificada contra Postgres 17 real:

| Caso | `spanish` | `simple` | `ping_text` (elegido) |
|---|---|---|---|
| "Proyecto Aurora" (nombre propio) | **destruido**: `proyect`/`auror` | intacto | **intacto**: `proyecto`/`aurora` |
| "producción" (texto) vs "produccion" (query) | cruzan (`@@`=true) | NO cruzan | **cruzan** (`@@`=true) — sin necesitar stemming de idioma |
| "meeting"/"budget"/"birthday" (inglés) | intactos (fuera del diccionario español) | intactos | intactos |
| "AA123", "50/70", "ETA" (códigos) | intactos | intactos | intactos |
| "vacaciones"/"vacacion" (plural/singular) | cruzan (stem `vacacion`) | NO cruzan | **NO cruzan** (tradeoff aceptado, ver abajo) |
| stopwords ("the", "el") | eliminadas | conservadas | conservadas (ruido menor para ranking, no destructivo) |

**Tradeoff aceptado y documentado**: `ping_text` pierde el cruce plural/singular que `spanish` sí tenía para español (a costa de romper nombres propios). Se acepta como el tradeoff correcto para un producto que no puede privilegiar la gramática de un idioma sobre el contenido real del usuario. Esta pérdida es SIMÉTRICA — afecta igual a cualquier idioma, no sólo español.

**Corrección M-1C.1**: la versión original de este documento afirmaba que esta pérdida se "mitiga parcialmente con prefix-matching". Esa afirmación fue **verificada como FALSA** — ver "Prefix vs typo/fuzzy — verificación empírica (M-1C.1)" más abajo. El servicio real NO hace prefix-matching en ninguna consulta; esa oración fue eliminada del contrato.

**Restricción técnica real encontrada y resuelta**: PostgREST no puede parsear un "." dentro del modificador `fts()`/`wfts()` de su sintaxis de filtro (choca con su propia gramática de paths de columna) — `wfts(public.ping_text).query` falla con `PGRST100`. Verificado y resuelto usando el nombre **sin calificar por esquema** (`ping_text`, no `public.ping_text`) en las llamadas desde el servicio (`FTS_CONFIG = 'ping_text'`), que resuelve correctamente vía el `search_path` por defecto (`public` incluido) — confirmado con una llamada REST real contra PostgREST local, no sólo `psql` crudo. La migración SÍ usa el nombre calificado (`public.ping_text`) en las expresiones de columnas generadas, donde no hay esa restricción — es más explícito y no depende de `search_path` en tiempo de escritura.

## Schema / index strategy: generated columns + GIN (opción A del ticket)

Migración `supabase/migrations/20260903150000_full_text_retrieval.sql`. Cero triggers, cero mantenimiento manual.

```sql
-- messages
alter table public.messages add column content_tsv tsvector
    generated always as (to_tsvector('public.ping_text', coalesce(content, ''))) stored;
create index messages_content_tsv_idx on public.messages using gin (content_tsv);

-- commitments (pesado A/B/C — por ROL del campo, nunca por vocabulario)
alter table public.commitments add column search_tsv tsvector
    generated always as (
        setweight(to_tsvector('public.ping_text', coalesce(title,'')), 'A')
        || setweight(to_tsvector('public.ping_text', coalesce(description,'')||' '||coalesce(expected_result,'')||' '||coalesce(next_action,'')), 'B')
        || setweight(to_tsvector('public.ping_text', coalesce(resolution_result,'')||' '||coalesce(rejection_reason,'')), 'C')
    ) stored;
create index commitments_search_tsv_idx on public.commitments using gin (search_tsv);

-- audio_transcriptions (índice parcial: sólo completed)
alter table public.audio_transcriptions add column transcript_tsv tsvector
    generated always as (to_tsvector('public.ping_text', coalesce(transcript_text, ''))) stored;
create index audio_transcriptions_tsv_idx on public.audio_transcriptions
    using gin (transcript_tsv) where status = 'completed';
```

## Messages FTS

Dos modos nuevos, ambos autorization-safe por defecto (M-1B.1 se mantiene sin excepción):

- **Con `conversationId`**: `retrieveMessagesFullTextInConversation` — autoriza membership, luego `content_tsv @@ websearch_to_tsquery('ping_text', query)` sólo en esa conversación.
- **Sin `conversationId`** (buscar "en mis conversaciones"): `retrieveMessagesFullTextAcrossAuthorizedConversations` — **una sola consulta batch** obtiene el universo autorizado (`select conversation_id from conversation_participants where user_id = actor`), y el `.in(conversationIds)` de esa consulta **es** el límite de autorización a nivel de query. Nunca N+1.
- `personId` (opcional, en ambos modos) acota además a `sender_id = personId` — nunca amplía, sólo reduce.

Los modos "recientes" y "ventana" (M-1B) siguen en orden cronológico. El modo texto ordena por **relevancia** (deliberado).

## Commitments FTS

`retrieveCommitments` acepta `input.query` y aplica `.textSearch('search_tsv', query, {type:'websearch', config:'ping_text'})` **con AND** sobre `buildCommitmentVisibilityFilter` y cualquier otro filtro — nunca lo reemplaza. Con texto, sobre-trae (`limit × 3`, acotado al techo absoluto de siempre) y el ranking final decide qué `limit` filas devolver.

## Transcriptions FTS

`retrieveTranscriptions(actorUserId, conversationId, limit, timeRange?, textQuery?)` — nuevo parámetro final opcional (posicional, no rompe callers). Autoriza la conversación primero, luego aplica `transcript_tsv @@ websearch_to_tsquery(...)` sobre el índice GIN parcial (`status='completed'`).

## Authorization (M-1B.1 se mantiene sin excepción)

El texto **nunca** es un canal de fuga de resultados, counts, ranking, ni metadatos:

- `retrieveCommitments`: visibilidad con AND antes/junto al `.textSearch()`.
- `retrieveMessages` (con conversationId): autoriza membership ANTES de construir la query de texto.
- `retrieveMessages` (sin conversationId): universo autorizado derivado EXCLUSIVAMENTE de `conversation_participants where user_id = actorUserId`.
- `retrieveTranscriptions`: autoriza la conversación ANTES del `.textSearch()`.

Certificado con tests unitarios (outsider directo, cross-conversación) y con integración real (`fullTextRetrieval.integration.sql`, queries I/J).

## Ranking

**Por qué no `ORDER BY ts_rank()` directo**: PostgREST `.order()` sólo acepta nombres de columna reales, no expresiones SQL arbitrarias — y `ts_rank()` necesita el parámetro de búsqueda por request, así que tampoco calificaría como "computed column" de PostgREST. Diseño:

1. **Matching real, correcto e indexado, en SQL**: `@@` contra el tsvector generado.
2. **Sobre-traer acotado** (`limit × 3`, techo absoluto sin cambios) ordenado por recencia en SQL.
3. **Refinamiento de orden en JS**: `computeTextRankProxy` (cuenta ocurrencias, case-insensitive, sin diccionario de idioma ni de dominio) + `hasExactPhrase` (bonus por frase exacta) — determinista, explicable, sin ML, sin reglas específicas de industria/vocabulario.

Fórmula (commitments):
```
score = structuredScore (conversación exacta:+100, persona/contacto:+50, status abierto:+25, recencia:hasta+10)
      + textRank (title×8 + description×3 + expected_result×3 + resolution_result×2 + rejection_reason×2, por ocurrencia)
      + exactPhraseBonus (+40 si la frase exacta está en el título, +25 si está en description/expected_result/resolution_result)
```
Los multiplicadores (×8, ×3, ×2) son pesos **por rol de campo** (título es más importante que un campo de resultado/auditoría) — no están ligados a ningún término, industria o vocabulario. Un match estructurado exacto (100pts) sigue pesando más que texto salvo un match textual excepcionalmente fuerte — intencional.

`textRank` se expone como campo opcional en los 3 DTOs afectados (sólo con `query`) — explicabilidad sin copiar fragmentos de texto.

## Exact phrase

`phraseto_tsquery('ping_text', 'Proyecto Aurora')` genera `'proyecto' <-> 'aurora'` (adyacencia real) — verificado que rechaza el orden invertido, y que funciona igual sobre frases en inglés ("birthday dinner"). El bonus de frase exacta en JS (`hasExactPhrase`, substring case-insensitive) es un complemento barato sobre el conjunto ya emparejado.

## Acentos

Resuelto por `ping_text` (unaccent + simple) de forma **language-neutral**: "produccion" (query sin tilde) encuentra "producción" (texto con tilde) y viceversa — verificado real, ver query F en la integración. No depende de qué idioma sea la palabra.

## Mixed language

Verificado con datos reales mezclando español/inglés en la MISMA conversación: cada término se tokeniza igual sin importar su idioma (query K/L de la integración). `websearch_to_tsquery` con múltiples términos bare exige AND (ambos en la misma fila) — comportamiento estándar de Postgres, no específico de idioma; con `or` explícito (`'Proyecto or budget'`) se comporta como cualquier búsqueda multi-término, encontrando contenido en cualquiera de los dos idiomas. Ningún idioma recibe tratamiento especial en código.

## Prefix vs typo/fuzzy — verificación empírica (M-1C.1)

La versión original de este documento afirmaba, sin verificar contra el código real, que "prefix-matching nativo ya cubre los ejemplos de typo del ticket". **Esa afirmación era incorrecta en dos niveles**, verificados empíricamente contra Postgres 17 real en esta revisión:

**1. Prefix (`term:*`) y typo/fuzzy son cosas DISTINTAS — nunca deben llamarse por el mismo nombre.**

| Documento | Query | Tipo | `to_tsquery('ping_text', 'query:*')` |
|---|---|---|---|
| "el presupuesto fue aprobado" | `presup` | prefijo válido (truncamiento) | **match** |
| "el presupuesto fue aprobado" | `presupu` | prefijo válido | **match** |
| "el presupuesto fue aprobado" | `presupuest` | prefijo válido | **match** |
| "el presupuesto fue aprobado" | `presupuesto` | palabra completa | **match** |
| "el presupuesto fue aprobado" | `presupesto` | **typo real** (falta una "u") | **NO match** |
| "estamos planeando las vacaciones" | `vacac` / `vacaci` / `vacacion` / `vacaciones` | prefijos válidos | **match** (los 4) |
| "the meeting is confirmed" | `meet` | prefijo válido | **match** |
| "the meeting is confirmed" | `meting` | **typo real** (falta una "e") | **NO match** |
| "the meeting is confirmed" | `meeting` | palabra completa | **match** |

Prefix matching (`:*`) SÍ funciona para truncamiento/autocompletar. NO resuelve errores ortográficos internos (letra faltante, transpuesta) — eso requiere `pg_trgm` u otra estrategia fuzzy real, no prefix.

**2. Más importante: el servicio real NUNCA usa prefix matching — la afirmación original describía una capacidad demostrada en `psql` aislado durante el diseño, que nunca se conectó al código.** Las 4 llamadas reales en `retrieval.service.ts` usan `{ type: 'websearch' }` (`websearch_to_tsquery`), que **NO agrega `:*`** a ningún término. Verificado:

```sql
select to_tsvector('ping_text', 'el presupuesto fue aprobado') @@ websearch_to_tsquery('ping_text', 'presup'); -- f
select websearch_to_tsquery('ping_text', 'presup'); -- 'presup'  (sin ':*' — lexema literal, no prefijo)
```

**Contrato real y corregido de M-1C**: sólo coincidencia por token/lexema completo (vía `websearch_to_tsquery`: términos AND/OR, frases con comillas, exclusión con `-`) y frase exacta (`phraseto_tsquery`, usada aparte para el bonus de ranking). **Ni prefijo/autocompletar ni typo/fuzzy están implementados en M-1C.** Ambos quedan como capacidad futura explícita, independiente entre sí:
- Prefijo/autocompletar: agregarlo requeriría construir manualmente `to_tsquery` con `:*` por término, perdiendo el parseo de frases/exclusión que da `websearch_to_tsquery` — una decisión de diseño real, no trivial, fuera de alcance de este ticket ("no rediseñar M-1C").
- Typo/fuzzy real: requiere `pg_trgm` (o equivalente), sin evidencia de necesidad real hoy.

## Trigram

**`pg_trgm` deliberadamente NO instalado.** Sin evidencia de que typos reales de usuarios sean un problema hoy — deuda futura explícita, no implementada (evita sobre-ingeniería). **NO instalar sólo para cerrar este ticket.**

## Limits

Reutiliza `DEFAULT_LIMITS`/`clampLimit`/`MAX_LIMIT_MULTIPLIER` de M-1B sin cambios. Con `query`, cada función sobre-trae `limit × 3` acotado al mismo techo absoluto — nunca sin límite en SQL. El resultado final siempre se recorta a `limit` tras rankear.

## Provenance

Sin cambios conceptuales. Se agregó `textRank?: number` como campo de nivel superior (no dentro de `provenance`) en los 3 DTOs afectados.

## Índices

**Cero índices nuevos fuera de los 3 GIN de FTS.** Los 5 índices de deuda de M-1B (`commitments.conversation_id/owner_user_id/assigned_to_user_id`, `commitment_events.commitment_id`, `attachments.context_conversation_id`) ya están cubiertos por composites existentes o no son tocados por el patrón de M-1C — ninguno se agrega "por si acaso".

## Migration

Nueva (`20260903150000_full_text_retrieval.sql`), ninguna histórica editada. Validada con `supabase db reset` completo. `EXPLAIN ANALYZE` corrido contra datos reales a escala. Sólo aplicada en local — no en staging, no en producción.

## Queries objetivo — certificadas (A-L, sección "Consultas objetivo globales")

Certificadas con datos reales, deliberadamente neutrales y multilingües, en `backend/tests/postgres/fullTextRetrieval.integration.sql` (14 aserciones, Postgres 17 local, `rollback` final — cero estado permanente):

| # | Query | Resultado |
|---|---|---|
| A | "vacaciones" | 1 mensaje relevante en la conversación autorizada |
| B | "Proyecto Aurora" | frase exacta encuentra el mensaje correcto; orden invertido NO matchea |
| C | "dentista" | encuentra el commitment relacionado |
| D | personId(Alex) + "budget"/"presupuesto" | acota a mensajes de Alex (contenido en inglés); transcript en español también verificado |
| E/G | "meeting" | contenido en inglés recuperado igual que el español |
| F | "produccion" (sin tilde) | encuentra "producción" (con tilde) |
| H | texto inexistente | 0 filas, sin error |
| I | outsider buscando término que existe en conversación ajena | 0 filas |
| J | término en conv-1, conversationId=conv-2 explícito | 0 filas |
| K | "AA123", "50/70" | intactos, no destruidos por tokenización |
| L | "Proyecto or budget" (mezcla de idiomas) | encuentra ambos mensajes (español + inglés) |
| — | Principio de producto | `ping_text` preserva "Proyecto Aurora" intacto (vs. `spanish` que lo destruía) |

## Tests unitarios

21 tests nuevos en `backend/tests/retrievalService.test.ts` (78 totales en el archivo) — mock de `supabase-js` extendido con soporte `.textSearch()` (`backend/tests/helpers/supabaseMock.ts`). Fixtures neutrales (Laura/Alex/Sofia, dentista/presupuesto/Proyecto Aurora). Cubren: helpers puros (español e inglés), `retrieveCommitments` con texto, `retrieveMessages` con/sin conversationId, `personId`, `retrieveTranscriptions`, límites/overfetch, orquestación end-to-end, y un bloque explícito de "multi-idioma, códigos y sin resultados" probando que el motor no trata ningún idioma como caso especial.

## Tests Postgres

`backend/tests/postgres/fullTextRetrieval.integration.sql` — 14 aserciones (A-L + principio de producto), Postgres real, `rollback` final. **Passed.**

## EXPLAIN

Corrido contra datos sembrados a escala real (3002 mensajes, 8001 commitments, 2001 transcripciones) con vocabulario neutral. Hallazgo real documentado honestamente: inmediatamente después de la carga masiva, el planner eligió `Seq Scan` para los 3 GIN (estadísticas desactualizadas tras el bulk insert — comportamiento normal de Postgres, no un defecto). Tras `ANALYZE` explícito, los 4 casos usan `Bitmap Index Scan` sobre los índices GIN correspondientes (`messages_content_tsv_idx`, `commitments_search_tsv_idx`, `audio_transcriptions_tsv_idx`), incluyendo la búsqueda de frase exacta. Ningún benchmark inventado — salida real de `EXPLAIN ANALYZE` de esta sesión.

## Performance

Sin N+1: cada modo de búsqueda agrega como máximo UNA consulta adicional. `retrieveContext` sigue usando las variantes internas ya autorizadas (M-1B.1) — el texto no agregó autorización redundante.

## Archivos

- `supabase/migrations/20260903150000_full_text_retrieval.sql` (nuevo — extensión `unaccent`, config `ping_text`, 3 columnas generadas + GIN)
- `backend/src/services/retrieval.service.ts` (extendido)
- `backend/src/types/retrieval.ts` (extendido: `textRank?`, comentario de `query` actualizado)
- `backend/tests/retrievalService.test.ts` (21 tests nuevos, fixtures neutrales)
- `backend/tests/helpers/supabaseMock.ts` (soporte `.textSearch()` agregado)
- `backend/tests/postgres/fullTextRetrieval.integration.sql` (nuevo, vocabulario neutral/multilingüe)
- `docs/M-1C-FULL-TEXT-RETRIEVAL.md` (este archivo)

## Búsqueda global sin conversationId — auditoría de escalabilidad (M-1C.1)

`retrieveMessagesFullTextAcrossAuthorizedConversations` (rama "sin conversationId" de `retrieveMessages`):

- **Ejecuta exactamente 2 queries**: (1) `conversation_participants` filtrado por `user_id = actor` para obtener el universo autorizado, (2) `messages` con `.in('conversation_id', conversationIds)` + `.textSearch(...)`. Nunca N+1, sin cambios respecto a lo ya certificado en M-1C.
- **Cómo se pasan los IDs a PostgREST**: supabase-js serializa `.in(column, array)` como parte del **query string de una request GET** (`?conversation_id=in.(id1,id2,...)`).
- **Riesgo real de URL, verificado empíricamente contra PostgREST+Kong local** (no teórico) generando requests reales con N conversationIds:

| N conversaciones | Longitud de URL | Resultado |
|---|---|---|
| 100 | ~3.8 KB | HTTP 200 |
| 150 | ~5.7 KB | HTTP 200 |
| 200 | ~7.5 KB | HTTP 200 |
| 250 | ~9.4 KB | **HTTP 414 (Request-URI Too Long)** |
| 300 | ~11.2 KB | **HTTP 414** |
| 500+ | ~18.6 KB+ | **HTTP 414** (listas mayores fallan antes incluso a nivel de proceso cliente) |

**El punto de quiebre real está entre 200 y 250 conversaciones autorizadas del actor** (~8 KB de URL, el límite típico de encabezados de Nginx/Kong).

**Decisión (sin optimizar prematuramente, per instrucción explícita del ticket)**: se mantiene el diseño actual — suficiente para el volumen inicial (ningún consumidor real conectado todavía a este modo; un usuario típico está muy por debajo de 200 conversaciones). Se documenta el punto de escalamiento para que no sea sorpresa más adelante.

**Alternativa futura si se alcanza ese volumen**: mover la autorización a un RPC (vía `.rpc()`, que envía parámetros en el body de un POST, sin límite de URL) que reciba `actorUserId` + `textQuery` y haga el join `messages ⋈ conversation_participants` directamente en SQL, evitando materializar la lista de IDs en la capa de aplicación. No implementado ahora — fuera de alcance de M-1C/M-1C.1.

## Riesgos

- Pérdida de stemming plural/singular (tradeoff simétrico, aceptado). **Ya no se afirma que prefix-matching lo mitigue** — verificado que el servicio no usa prefix matching (ver "Prefix vs typo/fuzzy" arriba).
- Ni prefijo/autocompletar ni typo/fuzzy están implementados — ambos son capacidad futura explícita, verificados y documentados en detalle.
- El proxy de ranking en JS es una aproximación explicable, no una réplica exacta de `ts_rank()` — el matching (qué filas califican) sigue siendo 100% correcto porque ocurre en SQL.
- `pg_trgm` queda como deuda explícita para typos reales — sin evidencia de necesidad hoy. NO instalar sólo para cerrar un ticket.
- Búsqueda global sin conversationId: punto de quiebre real verificado en ~200-250 conversaciones autorizadas (URL demasiado larga) — aceptable para el volumen inicial, alternativa RPC documentada.
- `/search` legacy sigue duplicando (parcialmente) capacidad de búsqueda con `ILIKE` — deuda documentada, fuera de alcance (producción/mobile).
- El nombre del config debe pasarse SIN calificar por esquema (`ping_text`) en cualquier llamada vía PostgREST/supabase-js — una futura extensión de este servicio que use un config calificado por esquema fallaría con `PGRST100`; documentado explícitamente para que no se repita el error.

## Search legacy

`/search` queda **legacy, sin tocar** — endpoint público real usado por mobile, fuera de alcance de este ticket. No hay duplicación estricta de motores: `/search` es substring-match, esto es FTS real. Deuda documentada, no resuelta aquí (exige tocar UX/mobile en producción).

## Staging

No tocado. Migración sólo aplicada en local disposable Postgres.

## Producción

No tocada. Ninguna acción sobre producción.

## Recomendación

M-1C queda listo para review y cierre tras la corrección M-1C.1 (afirmación de prefix-matching retirada, contrato real documentado, escalabilidad de búsqueda global auditada). Antes de M-1D, recomendable decidir: (1) si `/search` legacy se migra a este servicio, (2) si `pg_trgm` se justifica con evidencia real de typos de usuarios, (3) si vale la pena implementar prefijo/autocompletar como capacidad independiente (no requiere `pg_trgm`), y (4) si el volumen de conversaciones por usuario se acerca al punto de quiebre de ~200-250 antes de necesitar la alternativa RPC para la búsqueda global.

M-1C FULL-TEXT RETRIEVAL VERIFICADO — LISTO PARA CIERRE
