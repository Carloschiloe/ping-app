-- M-2 FINAL — OPERATIONAL MEMORY + CANONICAL INVARIANTS.
--
-- Cierra el hallazgo real del gate anterior: `memory_records.evidence_refs`
-- (jsonb) por sí solo no soporta un reverse-lookup correcto por fuente
-- ("¿qué memorias citan este mensaje/commitment/proposal, sea como
-- evidencia PRIMARIA o SECUNDARIA fusionada por deduplicación?") sin
-- escanear la tabla completa. `memory_record_evidence` es la estructura
-- relacional NORMALIZADA que se vuelve la autoridad real para:
--   - reverse lookup por fuente (deletion cleanup, sección 5/6 del ticket)
--   - verificación de autorización de evidencia (sección 7)
--   - inspección de procedencia futura
--   - escala 100k+ (índice real, nunca escaneo de jsonb)
--
-- `memory_records.evidence_refs` (jsonb) se CONSERVA como caché desnormalizado
-- de lectura rápida (evita un JOIN en cada retrieveMemory), pero
-- memory.service.ts lo recalcula SIEMPRE desde esta tabla en cada escritura
-- -- nunca hay una segunda fuente de verdad independiente, sólo una
-- proyección sincronizada en el mismo statement lógico de escritura.
create table public.memory_record_evidence (
    id                  uuid primary key default gen_random_uuid(),
    memory_record_id    uuid not null references public.memory_records(id) on delete cascade,
    source_type         text not null,
    source_id           uuid not null,
    message_id          uuid,
    conversation_id     uuid,
    occurred_at         timestamptz,
    created_at          timestamptz not null default now(),

    constraint memory_record_evidence_source_type_check
        check (source_type in ('message', 'commitment', 'commitment_proposal', 'attachment', 'transcription', 'manual')),
    -- Idempotencia de evidencia: la MISMA fuente nunca se agrega dos veces a
    -- la MISMA memoria (fusión de duplicados real, ver memory.service.ts#
    -- mergeEvidenceRefs -- ahora respaldado por una garantía de DB real, no
    -- sólo por la lógica de dedupe en memoria de proceso).
    constraint memory_record_evidence_unique
        unique (memory_record_id, source_type, source_id)
);

comment on table public.memory_record_evidence is
    'M-2: estructura relacional normalizada de procedencia -- autoridad real para reverse-lookup/borrado/autorización de evidencia, ver memory.service.ts.';

-- Reverse lookup real: "¿qué memory_records citan esta fuente?" -- el índice
-- que memory_records.evidence_refs (jsonb) NUNCA pudo dar sin escanear todo.
create index memory_record_evidence_reverse_idx
    on public.memory_record_evidence (source_type, source_id);

create index memory_record_evidence_memory_idx
    on public.memory_record_evidence (memory_record_id);

alter table public.memory_record_evidence enable row level security;

-- Es hija de memory_records -- la visibilidad se hereda del owner de la
-- memoria padre, nunca una regla independiente. Sólo SELECT vía RLS (misma
-- postura que memory_records: RLS es defensa en profundidad, la autoridad
-- real de escritura es memory.service.ts vía supabaseAdmin/service role).
create policy memory_record_evidence_owner_select on public.memory_record_evidence
    for select using (
        exists (
            select 1 from public.memory_records mr
            where mr.id = memory_record_id and mr.owner_user_id = auth.uid()
        )
    );

-- Rollback manual (nunca ejecutado automáticamente):
-- drop table if exists public.memory_record_evidence;
