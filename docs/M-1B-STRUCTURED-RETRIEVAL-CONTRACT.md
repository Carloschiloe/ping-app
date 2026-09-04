# Structured Retrieval Contract (M-1B)

Servicio interno: `backend/src/services/retrieval.service.ts`. No expone ruta HTTP. Sin embeddings, sin LLM. Consulta exclusivamente datos canónicos ya existentes (`commitments`, `commitment_events`, `messages`, `attachments`, `audio_transcriptions`, `profiles`, `contacts`) — nunca los copia.

## Inputs

```ts
retrieveContext({
  actorUserId,       // obligatorio — actor ya autenticado, resuelto por el caller (nunca desde el cliente)
  query?,            // reservado para M-1C, se devuelve tal cual en el resultado
  conversationId?,
  personId?,         // profiles.id YA resuelto (ver resolvePerson)
  contactId?,        // contacts.id YA resuelto
  timeRange?: { from?, to? },
  types?,            // subconjunto de: person | commitment | commitment_event | message | transcription | attachment
  statuses?,         // CanonicalCommitmentStatus[]
  limits?,           // override por tipo, siempre acotado (ver Límites)
  messageWindow?: { aroundMessageId, before?, after? },
  attachmentKinds?,
})
```

## Outputs

```ts
{ query, scope, people, commitments, events, messages, transcriptions, attachments, provenance }
```
Cada entidad es un DTO delgado (`Retrieval*`, ver `backend/src/types/retrieval.ts`), nunca la fila cruda de Supabase. `provenance` es la lista deduplicada de referencias de todas las entidades devueltas.

## Authorization

**Toda función pública (exportada) de este servicio es authorization-safe por defecto.** Ningún consumidor presente o futuro (Agent, Voice, Memory, Morning Routine, o cualquier otro) necesita recordar "autorizar antes de llamar" — cada función pública valida por sí misma que el actor puede ver lo que pide, sin importar por qué puerta entra. Esto se verifica explícitamente con tests que llaman cada función pública de forma directa, simulando un caller que se salta `retrieveContext` (ver `backend/tests/retrievalService.test.ts`, bloques `M-1B.1`).

Orden fijo, sin excepción: **actor → conversaciones permitidas → datos permitidos → retrieval**.

- `retrieveContext`: si se da `conversationId`, `assertConversationParticipant` corre primero — antes de cualquier otra consulta.
- `retrieveCommitments`: siempre filtrada por `buildCommitmentVisibilityFilter` (la misma función que ya usa `/search`), combinada con AND a cualquier filtro adicional (conversación/persona) — un filtro adicional nunca amplía lo que el actor puede ver, sólo lo acota. No necesita un `assertConversationParticipant` explícito: un `conversationId` ajeno sin relación propia con el commitment produce lista vacía, nunca una fuga (y un `assert` aquí rompería el caso legítimo de un owner que ve su commitment aunque ya no sea miembro de la conversación).
- `retrieveCommitmentEvents(actorUserId, commitmentIds, limit)`: revalida qué de los `commitmentIds` recibidos el actor puede ver realmente (misma visibilidad canónica que `retrieveCommitments`) ANTES de traer sus eventos. Un `commitmentId` ajeno queda fuera silenciosamente — no es un error, mismo estilo "vacío seguro".
- `retrieveMessages(input, limit)`: si `input.messageWindow` está presente, autoriza resolviendo el mensaje → su `conversation_id` real → membership, ANTES de traer nada (esto cubre también un `messageId` ajeno, aunque el caller no pase `conversationId`). Si en cambio se pide por `conversationId` directo, autoriza esa conversación antes de consultar `messages`.
- `retrieveTranscriptions(actorUserId, conversationId, limit, timeRange?)` y `retrieveAttachments(actorUserId, conversationId, limit, kinds?)`: ambas autorizan `conversationId` con `assertConversationParticipant` como primer paso, antes de cualquier otra consulta.
- `retrieveTranscriptionForAttachment(actorUserId, attachmentId)`: resuelve el `attachmentId` a su conversación real y autoriza ANTES de exponer transcript, metadata o filename — un `attachmentId` ajeno nunca revela nada, ni siquiera si la transcripción existe.
- `resolvePerson(actorUserId, input)`: cada rama (id directo, contacto, texto) valida contra el universo autorizado del actor antes de devolver un perfil o contacto — nunca expone un candidato fuera de ese universo.

### Modelo público / interno (M-1B.1)

Para evitar una cascada ineficiente de doble autorización, `retrieveContext` — que ya autorizó `conversationId` una sola vez al inicio — invoca variantes **internas, no exportadas** de estas mismas funciones (`retrieveMessagesInternal`, `retrieveCommitmentEventsInternal`, `retrieveTranscriptionsInternal`, `retrieveAttachmentsInternal`), que son consultas puras sin autorización propia. Estas internas **nunca se exportan** y no deben usarse fuera de este archivo. Cualquier consumidor externo — presente o futuro — siempre pasa por la función pública del mismo nombre, que autoriza primero y luego delega a la interna. El resultado es el mismo dato, con exactamente una verificación de autorización por request, sin importar por qué puerta se entra.

## Precedencia (sin duplicar fuente de verdad)

1. `commitments` / `commitment_events` — nunca se copian campos a otra tabla.
2. `conversations` / `conversation_participants` — solo para autorización y scope.
3. `profiles` / `contacts` — resolución de personas.
4. `messages` — ventanas acotadas, nunca "todo el historial".
5. `audio_transcriptions` — solo `status='completed'`.
6. `attachments` — solo referencias (id, kind, mime, lifecycle), nunca signed URLs ni contenido.

## Límites

| Recurso | Default | Tope máximo |
|---|---|---|
| commitments | 20 | 100 |
| events | 20 | 100 |
| messages | 30 | 150 |
| transcriptions | 10 | 50 |
| attachments | 10 | 50 |

Ninguna consulta se ejecuta sin límite. Un límite inválido (0, negativo, no numérico) cae al default; uno excesivo se recorta al tope (5x default).

## Provenance

Toda entidad devuelta trae su `RetrievalProvenance` (`sourceType`, `sourceId`, y referencias cruzadas relevantes: `conversationId`, `messageId`, `attachmentId`, `commitmentId`, `timestamp`). Nunca se devuelve un resultado sin esta referencia.

## Ranking (commitments)

Determinista, sin ML: `+100` conversación exacta, `+50` persona/contacto exacto, `+25` estado abierto (`isOpenCommitmentStatus`), `+recencia` (decae linealmente a 0 en ~10 días). Mensajes/eventos/adjuntos/transcripciones ya vienen ordenados por recencia o por scope de construcción — no requieren ranking adicional en M-1B.

## Qué NO hace este servicio

No interpreta lenguaje natural, no resuelve pronombres/roles ("él", "mi jefe"), no genera embeddings, no llama a ningún LLM, no genera signed URLs, no descarga archivos, no hace OCR, no escribe en `memories` (no existe todavía), no se conecta a `/ai/ask`.
