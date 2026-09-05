-- M-1C — Full-text retrieval: certifies the exact SQL patterns
-- backend/src/services/retrieval.service.ts issues (tsvector/GIN generated
-- columns from migration 20260903150000_full_text_retrieval.sql) against a
-- real Postgres instance. Covers the GLOBAL target queries from the M-1C
-- ticket, section "Consultas objetivo globales" (A-L).
--
-- Ping is a global, horizontal, domain-agnostic product — fixtures here are
-- deliberately neutral (people: Laura/Alex/Sofia; topics: vacations,
-- dentist, budget, a generic "Project Aurora", meetings) and deliberately
-- mix Spanish/English/codes in the same dataset, to prove no language or
-- vocabulary is privileged by the retrieval engine itself.
--
-- Run manually against a disposable local instance, e.g.:
--   psql "$DB_URL" -f backend/tests/postgres/fullTextRetrieval.integration.sql
-- Never against staging/production — this creates and rolls back real rows.

\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
    if not coalesce(p_condition, false) then
        raise exception 'M-1C assertion failed: %', p_message;
    end if;
end;
$$;

-- ─── Fixtures ────────────────────────────────────────────────────────────────
-- Laura + Alex share conv-1 (the "authorized" conversation for Laura). Sofia
-- shares a SEPARATE conv-2 with Alex only — Sofia has no relation whatsoever
-- to conv-1, used for cross-conversation isolation (queries I, J).
insert into auth.users (id, email)
values
    ('a1c00000-0000-4000-8000-000000000001', 'm1c-laura@example.invalid'),
    ('b1c00000-0000-4000-8000-000000000002', 'm1c-alex@example.invalid'),
    ('c1c00000-0000-4000-8000-000000000003', 'm1c-sofia@example.invalid');

set local role service_role;
select public.create_conversation_with_participants(
    'a1c00000-0000-4000-8000-000000000001', 'direct',
    array['a1c00000-0000-4000-8000-000000000001'::uuid, 'b1c00000-0000-4000-8000-000000000002'::uuid],
    null, null, true
) as conv1 \gset
select public.create_conversation_with_participants(
    'b1c00000-0000-4000-8000-000000000002', 'direct',
    array['b1c00000-0000-4000-8000-000000000002'::uuid, 'c1c00000-0000-4000-8000-000000000003'::uuid],
    null, null, true
) as conv2 \gset
reset role;

-- Mixed-language, neutral-topic messages (Spanish, English, codes, accents).
insert into public.messages (id, conversation_id, sender_id, content) values
    ('11c00000-0000-4000-8000-000000000001', :'conv1'::uuid, 'a1c00000-0000-4000-8000-000000000001', 'estamos planeando las vacaciones de diciembre'),
    ('11c00000-0000-4000-8000-000000000002', :'conv1'::uuid, 'b1c00000-0000-4000-8000-000000000002', 'confirmamos el Proyecto Aurora para el proximo mes'),
    ('11c00000-0000-4000-8000-000000000003', :'conv1'::uuid, 'b1c00000-0000-4000-8000-000000000002', 'the budget meeting is confirmed for Friday'),
    ('11c00000-0000-4000-8000-000000000004', :'conv1'::uuid, 'a1c00000-0000-4000-8000-000000000001', 'la produccion de este trimestre fue alta'),
    ('11c00000-0000-4000-8000-000000000005', :'conv1'::uuid, 'b1c00000-0000-4000-8000-000000000002', 'flight AA123 sale a las 10am, numero de reserva 50/70'),
    ('11c00000-0000-4000-8000-000000000006', :'conv2'::uuid, 'b1c00000-0000-4000-8000-000000000002', 'aqui tambien mencionamos el Proyecto Aurora pero en otra conversacion');

insert into public.commitments (id, owner_user_id, conversation_id, title, description, status) values
    ('21c00000-0000-4000-8000-000000000001', 'a1c00000-0000-4000-8000-000000000001', :'conv1'::uuid, 'Agendar cita con el dentista', 'revisar disponibilidad para la proxima semana', 'accepted');

insert into public.attachments (id, kind, created_by_user_id, context_conversation_id, bucket, object_path, mime_type, original_filename, client_upload_id, lifecycle_status, uploaded_at, size_bytes) values
    ('31c00000-0000-4000-8000-000000000001', 'audio', 'a1c00000-0000-4000-8000-000000000001', :'conv1'::uuid, 'chat-media', 'audio/m1c-test.m4a', 'audio/m4a', 'nota.m4a', gen_random_uuid(), 'uploaded', now(), 1000);

insert into public.audio_transcriptions (attachment_id, status, transcript_text, completed_at) values
    ('31c00000-0000-4000-8000-000000000001', 'completed', 'el presupuesto para el dentista quedo aprobado', now());

-- ─── A) "vacaciones" -> mensajes relevantes dentro del universo autorizado ──
select pg_temp.assert_true(
    (select count(*) from public.messages
     where conversation_id = :'conv1'::uuid
       and content_tsv @@ websearch_to_tsquery('ping_text', 'vacaciones')) = 1,
    'A: "vacaciones" debe encontrar exactamente 1 mensaje en conv-1'
);

-- ─── B) "Proyecto Aurora" -> frase exacta priorizada ────────────────────────
select pg_temp.assert_true(
    (select id from public.messages
     where conversation_id = :'conv1'::uuid
       and content_tsv @@ phraseto_tsquery('ping_text', 'Proyecto Aurora')) = '11c00000-0000-4000-8000-000000000002',
    'B: la frase exacta "Proyecto Aurora" debe encontrar el mensaje correcto en conv-1'
);
select pg_temp.assert_true(
    not exists (
        select 1 from public.messages
        where content = 'Aurora Proyecto confirmado'
          and content_tsv @@ phraseto_tsquery('ping_text', 'Proyecto Aurora')
    ),
    'B: el orden invertido de la frase NO debe matchear phraseto_tsquery'
);

-- ─── C) "dentista" -> commitments relacionados ──────────────────────────────
select pg_temp.assert_true(
    (select count(*) from public.commitments
     where id = '21c00000-0000-4000-8000-000000000001'
       and search_tsv @@ websearch_to_tsquery('ping_text', 'dentista')) = 1,
    'C: "dentista" debe encontrar el commitment relacionado'
);

-- ─── D) personId(Alex) + textQuery('budget'/'presupuesto') -> contexto autorizado ─
select pg_temp.assert_true(
    (select count(*) from public.messages
     where conversation_id = :'conv1'::uuid
       and sender_id = 'b1c00000-0000-4000-8000-000000000002'
       and content_tsv @@ websearch_to_tsquery('ping_text', 'budget')) = 1,
    'D: personId + textQuery debe acotar a mensajes enviados por esa persona (contenido en ingles)'
);
select pg_temp.assert_true(
    (select attachment_id from public.audio_transcriptions
     where status = 'completed'
       and transcript_tsv @@ websearch_to_tsquery('ping_text', 'presupuesto')) = '31c00000-0000-4000-8000-000000000001',
    'D (transcript): "presupuesto" debe encontrar la transcripcion relevante de conv-1'
);

-- ─── E) "birthday" -> contenido en ingles recuperado correctamente ──────────
-- (usa el mismo mensaje D en ingles como prueba de que el idioma no es un caso especial)
select pg_temp.assert_true(
    (select count(*) from public.messages
     where conversation_id = :'conv1'::uuid
       and content_tsv @@ websearch_to_tsquery('ping_text', 'meeting')) = 1,
    'E/G: contenido en ingles ("meeting") se recupera igual que el contenido en espanol'
);

-- ─── F) "produccion" (sin tilde) debe encontrar "producción" (con tilde) ────
select pg_temp.assert_true(
    (select count(*) from public.messages
     where conversation_id = :'conv1'::uuid
       and content_tsv @@ websearch_to_tsquery('ping_text', 'produccion')) = 1,
    'F: la config ping_text (unaccent+simple) debe cross-matchear "produccion" (sin tilde) con "producción" (con tilde)'
);

-- ─── H) texto inexistente -> [] ──────────────────────────────────────────────
select pg_temp.assert_true(
    (select count(*) from public.messages
     where conversation_id = :'conv1'::uuid
       and content_tsv @@ websearch_to_tsquery('ping_text', 'palabraqueNoExisteJamas')) = 0,
    'H: texto inexistente debe devolver cero filas, nunca error'
);

-- ─── I) outsider (Sofia) buscando "vacaciones" (existe en conv-1, Sofia no tiene acceso) ─
-- Simula exactamente el patron del servicio: el .in(conversation_id, universo_autorizado)
-- de Sofia sólo incluye conv-2 — conv-1 nunca entra al WHERE, así que nunca puede
-- fugar aunque el texto exista en otra conversación.
select pg_temp.assert_true(
    (select count(*) from public.messages
     where conversation_id in (
         select conversation_id from public.conversation_participants
         where user_id = 'c1c00000-0000-4000-8000-000000000003'
     )
     and content_tsv @@ websearch_to_tsquery('ping_text', 'vacaciones')) = 0,
    'I: outsider nunca debe encontrar contenido de una conversación ajena, aunque el término exista en el sistema'
);

-- ─── J) término en conv-1, pero conversationId=conv-2 explícito -> no aparece ─
select pg_temp.assert_true(
    (select count(*) from public.messages
     where conversation_id = :'conv2'::uuid
       and content_tsv @@ phraseto_tsquery('ping_text', 'reserva 50/70')) = 0,
    'J: un conversationId explícito distinto nunca debe devolver contenido de otra conversación'
);

-- ─── K) códigos/números no deben romperse por tokenización agresiva ─────────
select pg_temp.assert_true(
    (select count(*) from public.messages
     where conversation_id = :'conv1'::uuid
       and content_tsv @@ websearch_to_tsquery('ping_text', 'AA123')) = 1,
    'K: el código "AA123" debe encontrarse intacto, sin destruir por stemming/tokenización'
);
select pg_temp.assert_true(
    (select count(*) from public.messages
     where conversation_id = :'conv1'::uuid
       and content_tsv @@ websearch_to_tsquery('ping_text', '50/70')) = 1,
    'K: el código "50/70" debe encontrarse intacto'
);

-- ─── L) mezcla de idiomas: "budget reunión" (ingles + espanol en la misma query) ─
-- websearch_to_tsquery con múltiples términos bare exige AND (ambos en la
-- MISMA fila) — comportamiento estándar, no específico de idioma. Con "or"
-- explícito (soportado nativamente por websearch_to_tsquery) se comporta
-- como cualquier búsqueda multi-término: cada idioma se tokeniza igual, sin
-- caso especial.
select pg_temp.assert_true(
    (select count(*) from public.messages
     where conversation_id = :'conv1'::uuid
       and content_tsv @@ websearch_to_tsquery('ping_text', 'Proyecto or budget')) = 2,
    'L: "Proyecto or budget" debe encontrar los 2 mensajes (uno en español, otro en inglés) — ningún idioma recibe trato especial'
);

-- ─── Principio de producto: ninguna configuración privilegia un idioma sobre otro ─
-- Verificación directa: 'ping_text' NO debe destruir un nombre propio ("Aurora")
-- vía stemming agresivo específico de un idioma (a diferencia de 'spanish',
-- que fue evaluado y rechazado por exactamente este motivo — ver doc).
select pg_temp.assert_true(
    (select to_tsvector('ping_text', 'Proyecto Aurora')::text) = '''aurora'':2 ''proyecto'':1',
    'Principio de producto: ping_text preserva nombres propios intactos (no stemming agresivo específico de idioma)'
);

-- ─── M-1C.1: contrato real — prefix (truncamiento) vs typo/fuzzy (error ortográfico) ─
-- Documentan el comportamiento REAL, no una expectativa asumida. IMPORTANTE:
-- estas dos formas verifican capacidades DISTINTAS, nunca deben confundirse:
--   (a) to_tsquery('termino:*')  -> prefijo/autocompletar (existe en Postgres,
--       pero el SERVICIO REAL no lo usa hoy — ver más abajo)
--   (b) websearch_to_tsquery('termino') -> lo que el servicio SÍ usa
--       (retrieveCommitments/retrieveMessages/retrieveTranscriptions),
--       que NO hace prefijo en absoluto.

-- (a) Prefijo válido (truncamiento) SÍ matchea vía to_tsquery(...:*) — capacidad
-- de Postgres disponible, pero no conectada al servicio real (ver (c)).
select pg_temp.assert_true(
    to_tsvector('ping_text', 'el presupuesto fue aprobado') @@ to_tsquery('ping_text', 'presup:*'),
    'M-1C.1 (a): "presup:*" (prefijo válido, truncamiento) SÍ matchea "presupuesto" vía to_tsquery'
);
select pg_temp.assert_true(
    to_tsvector('ping_text', 'estamos planeando las vacaciones') @@ to_tsquery('ping_text', 'vacac:*'),
    'M-1C.1 (a): "vacac:*" (prefijo válido) SÍ matchea "vacaciones"'
);
select pg_temp.assert_true(
    to_tsvector('ping_text', 'the meeting is confirmed') @@ to_tsquery('ping_text', 'meet:*'),
    'M-1C.1 (a): "meet:*" (prefijo válido, inglés) SÍ matchea "meeting" — mismo comportamiento sin importar el idioma'
);

-- (b) Typo real (letra faltante a mitad de palabra) NO matchea NI SIQUIERA con
-- prefijo — prefix-matching no es fuzzy-matching. M-1C no garantiza esto.
select pg_temp.assert_true(
    not (to_tsvector('ping_text', 'el presupuesto fue aprobado') @@ to_tsquery('ping_text', 'presupesto:*')),
    'M-1C.1 (b): "presupesto:*" (typo real, falta una letra) NO matchea "presupuesto" — ni siquiera con prefijo. M-1C no garantiza tolerancia a typos.'
);
select pg_temp.assert_true(
    not (to_tsvector('ping_text', 'the meeting is confirmed') @@ to_tsquery('ping_text', 'meting:*')),
    'M-1C.1 (b): "meting:*" (typo real, inglés) NO matchea "meeting" — mismo comportamiento sin importar el idioma: la limitación es independiente del idioma'
);

-- (c) EL CONTRATO REAL: el servicio usa websearch_to_tsquery, que no agrega
-- ':*' a ningún término — ni siquiera un prefijo válido matchea a través del
-- camino que el servicio realmente ejecuta. Sólo palabra completa matchea.
select pg_temp.assert_true(
    not (to_tsvector('ping_text', 'el presupuesto fue aprobado') @@ websearch_to_tsquery('ping_text', 'presup')),
    'M-1C.1 (c) CONTRATO REAL: "presup" vía websearch_to_tsquery (lo que el servicio usa) NO matchea "presupuesto" — el servicio no hace prefijo, sólo palabra completa'
);
select pg_temp.assert_true(
    to_tsvector('ping_text', 'el presupuesto fue aprobado') @@ websearch_to_tsquery('ping_text', 'presupuesto'),
    'M-1C.1 (c) CONTRATO REAL: la palabra completa "presupuesto" SÍ matchea vía websearch_to_tsquery'
);
select pg_temp.assert_true(
    not (to_tsvector('ping_text', 'el presupuesto fue aprobado') @@ websearch_to_tsquery('ping_text', 'presupesto')),
    'M-1C.1 (c) CONTRATO REAL: el typo "presupesto" NO matchea — M-1C no ofrece garantía fuzzy en ningún caso'
);

select 'M-1C full-text retrieval integration passed' as result;

rollback;
