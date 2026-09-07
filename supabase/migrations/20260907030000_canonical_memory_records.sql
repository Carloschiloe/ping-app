-- M-2 — CANONICAL MEMORY + CONTEXT ARCHITECTURE. Migración aditiva, no
-- destructiva: crea `memory_records` desde cero, no modifica ninguna tabla
-- existente. LOCAL ONLY para este ticket — no se aplica a staging/producción
-- hasta autorización explícita en un ticket futuro (ver ticket M-2, sección
-- final "restricciones de entrega").
--
-- DECISIÓN DE ALCANCE (sección 11 del ticket, "no asumir exposición cruzada"):
-- `memory_records` es SIEMPRE de propiedad exclusiva de `owner_user_id`. La
-- columna `visibility_scope` existe como gancho para una futura fase de
-- memoria compartida por conversación, pero NINGÚN código de este ticket
-- amplía la visibilidad más allá del owner — ni RLS ni la capa de servicio
-- (`memory.service.ts#buildMemoryVisibilityFilter`) exponen jamás una fila a
-- otro actor. Esto es deliberadamente más estricto que lo mínimo necesario:
-- evita construir una segunda superficie de fuga persona-a-persona (además
-- de la ya existente para commitments/proposals) sin que el ticket exija
-- resolverla ahora.
--
-- MEMORY_TYPE (taxonomía, ver docs de entrega M-2 sección "Taxonomía"):
--   - 'episodic'  -> "esto pasó" (un evento/observación anclada a un momento;
--                    ej. "hablamos de Puerto Montt el 3 de marzo").
--   - 'semantic'  -> "esto es cierto sobre alguien/algo" (un hecho persistente
--                    con posible vigencia temporal; ej. "Alejandra vive en
--                    Puerto Montt").
-- Las otras 4 categorías de la taxonomía (canonical entity truth / derived
-- summary / working context / retrieval index) NO son filas de esta tabla:
-- canonical entity truth ya vive en commitments/profiles/contacts (nunca se
-- duplica aquí — ver invariante de dominancia canónica); derived summary y
-- working context son productos de lectura/síntesis en memoria de proceso,
-- no estado persistido por este ticket; retrieval index es el propio GIN de
-- abajo, no una tabla separada.
create table public.memory_records (
    id                      uuid primary key default gen_random_uuid(),
    owner_user_id           uuid not null references public.profiles(id) on delete cascade,

    memory_type             text not null,

    -- Sujeto: EXACTAMENTE uno de subject_person_id / subject_contact_id puede
    -- estar resuelto; si la identidad no resolvió a un profile/contact real,
    -- se guarda únicamente el hint crudo (nunca se inventa un id) y el
    -- registro queda restringido a 'candidate' de por vida para memoria
    -- semántica-personal (ver memory.service.ts#validateMemoryCandidate,
    -- sección 16 del ticket "no inventar identidad").
    subject_person_id       uuid references public.profiles(id) on delete set null,
    subject_contact_id      uuid references public.contacts(id) on delete set null,
    subject_unresolved_hint text,

    -- Hecho normalizado: predicate/object_value son la forma estructurada
    -- (usada para dedup/conflicto/supersesión); canonical_text es la forma
    -- legible que síntesis puede citar textualmente con su evidencia.
    predicate               text not null,
    object_value            text not null,
    canonical_text          text not null,

    source_type             text not null,
    source_id               uuid,
    conversation_id         uuid references public.conversations(id) on delete set null,

    -- Evidencia NO negociable (sección "provenance" del ticket): array de
    -- {sourceType, sourceId, messageId?, timestamp?}. Un memory_record sin al
    -- menos una entrada aquí nunca puede promoverse a 'active' — ver
    -- memory.service.ts#validateMemoryCandidate.
    evidence_refs           jsonb not null default '[]'::jsonb,

    observed_at             timestamptz not null,
    valid_from              timestamptz,
    valid_until             timestamptz,

    status                  text not null default 'candidate',
    superseded_by           uuid references public.memory_records(id) on delete set null,
    superseded_at           timestamptz,

    confidence              real not null default 1.0,
    sensitivity             text not null default 'normal',
    visibility_scope        text not null default 'private',

    -- extraction_method distingue "el LLM sugirió esto, Core lo validó"
    -- (llm) de hechos derivados determinísticamente de eventos canónicos
    -- (deterministic, ej. de un commitment.accepted) o cargados a mano
    -- (manual, uso interno/soporte). Nunca hay una cuarta vía de escritura.
    extraction_method       text not null,
    model_provider          text,
    model_version           text,

    -- Clave de deduplicación/idempotencia: hash normalizado de
    -- (owner_user_id, subject resuelto o hint, predicate, object_value
    -- normalizado). Ver memory.service.ts#computeContentHash. El índice único
    -- de abajo es la garantía real a nivel de base de datos — la capa de
    -- servicio NUNCA es la única línea de defensa contra duplicados.
    content_hash            text not null,

    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),

    constraint memory_records_type_check
        check (memory_type in ('episodic', 'semantic')),
    constraint memory_records_source_type_check
        check (source_type in ('message', 'commitment', 'commitment_proposal', 'attachment', 'transcription', 'manual')),
    constraint memory_records_status_check
        check (status in ('candidate', 'active', 'superseded', 'invalidated', 'deleted')),
    constraint memory_records_sensitivity_check
        check (sensitivity in ('normal', 'sensitive', 'restricted')),
    constraint memory_records_visibility_check
        check (visibility_scope in ('private', 'conversation', 'shared')),
    constraint memory_records_extraction_method_check
        check (extraction_method in ('deterministic', 'llm', 'manual')),
    constraint memory_records_confidence_check
        check (confidence >= 0 and confidence <= 1),
    -- Un memory_record 'active'/'superseded' con evidencia vacía sería una
    -- afirmación sin procedencia -- prohibido explícitamente por el ticket.
    -- 'candidate' puede transitoriamente carecer de evidencia normalizada
    -- durante validación (aplicado en memory.service.ts, no sólo aquí,
    -- porque jsonb_array_length no puede validar la FORMA de cada entrada,
    -- sólo su cardinalidad). 'invalidated'/'deleted' TAMBIÉN pueden (deben
    -- poder) quedar con evidence_refs vacío: invalidar es EXACTAMENTE la
    -- transición que ocurre cuando la última evidencia real desaparece (ver
    -- memory.service.ts#invalidateMemoryForDeletedSource) -- exigir
    -- evidencia no vacía en ese estado haría la propia invalidación
    -- imposible de persistir.
    constraint memory_records_evidence_required_when_promoted
        check (status in ('candidate', 'invalidated', 'deleted') or jsonb_array_length(evidence_refs) > 0)
);

comment on table public.memory_records is
    'M-2 canonical memory: hechos episódicos/semánticos derivados con procedencia obligatoria. Nunca es fuente de verdad canónica -- ver invariante de dominancia canónica en memory.service.ts.';

-- Idempotencia real: dos ingestas del mismo evento (mismo hecho, mismo
-- sujeto, mismo owner) nunca crean una segunda fila activa. 'deleted' queda
-- fuera del índice para permitir reinsertar tras un borrado explícito.
create unique index memory_records_owner_hash_unique_idx
    on public.memory_records (owner_user_id, content_hash)
    where status <> 'deleted';

create index memory_records_owner_status_type_idx
    on public.memory_records (owner_user_id, status, memory_type);

create index memory_records_owner_subject_person_idx
    on public.memory_records (owner_user_id, subject_person_id)
    where subject_person_id is not null;

create index memory_records_owner_subject_contact_idx
    on public.memory_records (owner_user_id, subject_contact_id)
    where subject_contact_id is not null;

-- Soporta los deletion hooks (borrado de fuente/conversación/cuenta) sin
-- escanear toda la tabla -- ver memory.service.ts#invalidateMemoryForSource.
create index memory_records_source_idx
    on public.memory_records (source_type, source_id)
    where source_id is not null;

create index memory_records_conversation_idx
    on public.memory_records (conversation_id)
    where conversation_id is not null;

create index memory_records_owner_observed_idx
    on public.memory_records (owner_user_id, observed_at desc);

-- Cadena de supersesión: encontrar rápidamente qué reemplazó a qué (sección
-- "current vs historical" y "¿qué cambió sobre X?").
create index memory_records_superseded_by_idx
    on public.memory_records (superseded_by)
    where superseded_by is not null;

-- Búsqueda léxica de memoria: MISMA config `public.ping_text` que
-- commitments/commitment_proposals (ver 20260907010000) -- nunca una config
-- nueva/paralela, para que "búsqueda de texto" sea un único concepto
-- coherente en todo Ping, no uno distinto por subsistema.
alter table public.memory_records
    add column search_tsv tsvector
    generated always as (
        setweight(to_tsvector('public.ping_text', coalesce(canonical_text, '')), 'A')
        || setweight(to_tsvector('public.ping_text', coalesce(object_value, '')), 'B')
    ) stored;

create index memory_records_search_tsv_idx
    on public.memory_records using gin (search_tsv);

create trigger trg_memory_records_updated_at before update on public.memory_records
    for each row execute procedure public.set_updated_at();

alter table public.memory_records enable row level security;

-- RLS es defensa en profundidad, no el mecanismo primario de autorización
-- del Agent (que usa supabaseAdmin / service role, igual que
-- retrieval.service.ts para commitments/proposals -- ver commitmentVisibility.ts).
-- La política aquí es deliberadamente la más simple posible: sólo el dueño.
create policy memory_records_owner_select on public.memory_records
    for select using (owner_user_id = auth.uid());

create policy memory_records_owner_insert on public.memory_records
    for insert with check (owner_user_id = auth.uid());

create policy memory_records_owner_update on public.memory_records
    for update using (owner_user_id = auth.uid());

create policy memory_records_owner_delete on public.memory_records
    for delete using (owner_user_id = auth.uid());

-- Rollback manual (nunca ejecutado automáticamente):
-- drop table if exists public.memory_records;
