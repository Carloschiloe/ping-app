import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

// M-2 — CANONICAL MEMORY + CONTEXT ARCHITECTURE. Mismo patrón que
// retrievalService.test.ts: se mockea supabaseAdmin, nunca una base real
// (la validación empírica contra Postgres real se hizo aparte, ver informe
// de entrega). Este archivo certifica el CONTRATO determinístico de
// memory.service.ts: whitelist de extracción, clasificación de
// sensibilidad, dominancia canónica, y el pipeline de ingesta/retrieval
// contra la forma exacta de las llamadas a supabaseAdmin.
vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

// ─── parseMemoryExtractionCandidate — whitelist estricta (sección "tests adversariales de extracción") ─
describe('M-2: parseMemoryExtractionCandidate — frontera de extracción LLM', () => {
    it('acepta un candidato válido completo', async () => {
        const { parseMemoryExtractionCandidate } = await import('../src/services/memory.service');
        const result = parseMemoryExtractionCandidate({
            memoryTypeHint: 'semantic', subjectHint: { name: 'Alejandra' }, predicateHint: 'lives_in',
            objectValueHint: 'Puerto Montt', canonicalTextHint: 'Alejandra vive en Puerto Montt', confidenceHint: 0.8,
        });
        expect(result).not.toBeNull();
        expect(result?.predicateHint).toBe('lives_in');
    });

    it('rechaza (null) cuando falta memoryTypeHint', async () => {
        const { parseMemoryExtractionCandidate } = await import('../src/services/memory.service');
        expect(parseMemoryExtractionCandidate({ predicateHint: 'p', objectValueHint: 'v', canonicalTextHint: 't' })).toBeNull();
    });

    it('rechaza un memoryTypeHint inválido (nunca un tercer tipo inventado)', async () => {
        const { parseMemoryExtractionCandidate } = await import('../src/services/memory.service');
        expect(parseMemoryExtractionCandidate({ memoryTypeHint: 'canonical', predicateHint: 'p', objectValueHint: 'v', canonicalTextHint: 't' })).toBeNull();
    });

    it('rechaza cuando faltan predicateHint/objectValueHint/canonicalTextHint', async () => {
        const { parseMemoryExtractionCandidate } = await import('../src/services/memory.service');
        expect(parseMemoryExtractionCandidate({ memoryTypeHint: 'semantic', objectValueHint: 'v', canonicalTextHint: 't' })).toBeNull();
        expect(parseMemoryExtractionCandidate({ memoryTypeHint: 'semantic', predicateHint: 'p', canonicalTextHint: 't' })).toBeNull();
        expect(parseMemoryExtractionCandidate({ memoryTypeHint: 'semantic', predicateHint: 'p', objectValueHint: 'v' })).toBeNull();
    });

    it('null/no-objeto -> null, nunca crashea', async () => {
        const { parseMemoryExtractionCandidate } = await import('../src/services/memory.service');
        expect(parseMemoryExtractionCandidate(null)).toBeNull();
        expect(parseMemoryExtractionCandidate('a string')).toBeNull();
        expect(parseMemoryExtractionCandidate(42)).toBeNull();
        expect(parseMemoryExtractionCandidate(undefined)).toBeNull();
    });

    it('ADVERSARIAL: campos "resueltos" inventados (subjectPersonId, ownerUserId, status, sourceId) se descartan en silencio -- nunca se copian', async () => {
        const { parseMemoryExtractionCandidate } = await import('../src/services/memory.service');
        const result = parseMemoryExtractionCandidate({
            memoryTypeHint: 'semantic', predicateHint: 'p', objectValueHint: 'v', canonicalTextHint: 't',
            subjectPersonId: 'invented-id-12345', ownerUserId: 'invented-owner', status: 'active', sourceId: 'invented-source',
        } as any);
        expect(result).not.toBeNull();
        expect((result as any).subjectPersonId).toBeUndefined();
        expect((result as any).ownerUserId).toBeUndefined();
        expect((result as any).status).toBeUndefined();
        expect((result as any).sourceId).toBeUndefined();
    });

    it('un subjectHint con campos vacíos/whitespace colapsa a null (nunca "sujeto fantasma")', async () => {
        const { parseMemoryExtractionCandidate } = await import('../src/services/memory.service');
        const result = parseMemoryExtractionCandidate({
            memoryTypeHint: 'semantic', predicateHint: 'p', objectValueHint: 'v', canonicalTextHint: 't',
            subjectHint: { name: '   ', email: '' },
        });
        expect(result?.subjectHint).toBeNull();
    });

    it('ADVERSARIAL: confidenceHint fuera de [0,1] se acota, nunca se rechaza el candidato entero', async () => {
        const { parseMemoryExtractionCandidate } = await import('../src/services/memory.service');
        const over = parseMemoryExtractionCandidate({ memoryTypeHint: 'semantic', predicateHint: 'p', objectValueHint: 'v', canonicalTextHint: 't', confidenceHint: 5 });
        const under = parseMemoryExtractionCandidate({ memoryTypeHint: 'semantic', predicateHint: 'p', objectValueHint: 'v', canonicalTextHint: 't', confidenceHint: -3 });
        expect(over?.confidenceHint).toBe(1);
        expect(under?.confidenceHint).toBe(0);
    });

    it('confidenceHint no-numérico se ignora (undefined), nunca NaN', async () => {
        const { parseMemoryExtractionCandidate } = await import('../src/services/memory.service');
        const result = parseMemoryExtractionCandidate({ memoryTypeHint: 'semantic', predicateHint: 'p', objectValueHint: 'v', canonicalTextHint: 't', confidenceHint: 'high' as any });
        expect(result?.confidenceHint).toBeUndefined();
    });

    it('ADVERSARIAL: sensitivityHint inválido (valor inventado) se ignora, nunca se propaga', async () => {
        const { parseMemoryExtractionCandidate } = await import('../src/services/memory.service');
        const result = parseMemoryExtractionCandidate({ memoryTypeHint: 'semantic', predicateHint: 'p', objectValueHint: 'v', canonicalTextHint: 't', sensitivityHint: 'top_secret' as any });
        expect(result?.sensitivityHint).toBeUndefined();
    });
});

// ─── classifySensitivity — Core nunca confía ciegamente en el hint ─────────
describe('M-2: classifySensitivity — Core nunca degrada sensibilidad por debajo de lo que el contenido revela', () => {
    it('ADVERSARIAL: hint "normal" sobre contenido de salud -> forzado a "sensitive"', async () => {
        const { classifySensitivity } = await import('../src/services/memory.service');
        expect(classifySensitivity('salud', 'diagnostico X', 'normal')).toBe('sensitive');
    });

    it('hint "restricted" sobre contenido sensible se preserva como "restricted"', async () => {
        const { classifySensitivity } = await import('../src/services/memory.service');
        expect(classifySensitivity('password', 'x', 'restricted')).toBe('restricted');
    });

    it('sin hint, contenido sensible -> "sensitive" por defecto (nunca "normal")', async () => {
        const { classifySensitivity } = await import('../src/services/memory.service');
        expect(classifySensitivity('salario', 'x', undefined)).toBe('sensitive');
    });

    it('sin coincidencia de palabra clave, se respeta el hint tal cual', async () => {
        const { classifySensitivity } = await import('../src/services/memory.service');
        expect(classifySensitivity('lives_in', 'Puerto Montt', 'sensitive')).toBe('sensitive');
    });

    it('sin coincidencia y sin hint -> "normal"', async () => {
        const { classifySensitivity } = await import('../src/services/memory.service');
        expect(classifySensitivity('lives_in', 'Puerto Montt', undefined)).toBe('normal');
    });
});

// ─── enforceMemoryCanonicalDominance — invariante no negociable ───────────
// M-2 ABSOLUTE FINAL, Blocker C: cualquier predicate canon-owned es SIEMPRE
// isCurrent=false, coincida o no coincida con el valor canónico actual --
// nunca se crea una "verdad activa competidora", ni siquiera cuando por
// casualidad concuerdan. Función ahora SÍNCRONA (ya no necesita la DB para
// esta invariante -- ver comentario en canonicalTruthRegistry.ts).
describe('M-2 ABSOLUTE FINAL: enforceMemoryCanonicalDominance -- nunca duplica verdad canónica activa', () => {
    const memory = (overrides: Partial<Record<string, any>> = {}) => ({
        id: 'mem1', memoryType: 'episodic' as const, subjectPersonId: null, subjectContactId: null,
        canonicalText: 'El compromiso "Entrenar" está en estado proposed.', predicate: 'commitment_status:cm1',
        objectValue: 'proposed', observedAt: '2026-01-01T00:00:00Z', validFrom: null, validUntil: null,
        status: 'active' as const, isCurrent: true, supersededBy: null, confidence: 1, sensitivity: 'normal' as const,
        evidenceRefs: [], sourceType: 'commitment' as const, sourceId: 'cm1', conversationId: null,
        ...overrides,
    });

    it('CASO ENTRENAR: memoria dice "proposed" -> isCurrent forzado a false (canon-owned, sin importar el valor canónico real)', async () => {
        const { enforceMemoryCanonicalDominance } = await import('../src/services/canonicalTruthRegistry');
        const result = enforceMemoryCanonicalDominance([memory()]);
        expect(result[0].isCurrent).toBe(false);
    });

    it('CIERRE DEL BLOCKER C: aunque la memoria COINCIDA con el estado canónico actual, isCurrent SIGUE siendo false -- nunca hay una verdad activa duplicada, ni por coincidencia', async () => {
        const { enforceMemoryCanonicalDominance } = await import('../src/services/canonicalTruthRegistry');
        // La memoria dice "accepted" y el canónico real TAMBIÉN dice "accepted"
        // en este momento -- pese a eso, memoria no puede ser una segunda
        // autoridad sobre el mismo hecho.
        const result = enforceMemoryCanonicalDominance([memory({ objectValue: 'accepted' })]);
        expect(result[0].isCurrent).toBe(false);
    });

    it('ADVERSARIAL B: canónico avanza de "accepted" a "completed" -- una memoria que aún dice "accepted" también queda histórica', async () => {
        const { enforceMemoryCanonicalDominance } = await import('../src/services/canonicalTruthRegistry');
        const result = enforceMemoryCanonicalDominance([memory({ objectValue: 'accepted' })]);
        expect(result[0].isCurrent).toBe(false);
    });

    it('nunca toca memoria no relacionada a ningún dominio canónico conocido (otro predicate)', async () => {
        const { enforceMemoryCanonicalDominance } = await import('../src/services/canonicalTruthRegistry');
        const m = memory({ predicate: 'lives_in', sourceType: 'message' as any, sourceId: 'msg1' });
        const result = enforceMemoryCanonicalDominance([m]);
        expect(result[0].isCurrent).toBe(true);
    });

    it('ADVERSARIAL C: una memoria que inventa un dato de perfil actual (profile_field:...) nunca es isCurrent, sin importar el valor', async () => {
        const { enforceMemoryCanonicalDominance } = await import('../src/services/canonicalTruthRegistry');
        const m = memory({ predicate: 'profile_field:owner1:full_name', objectValue: 'Nombre Inventado Por La Memoria', sourceType: 'message' as any, sourceId: 'msg1' });
        const result = enforceMemoryCanonicalDominance([m]);
        expect(result[0].isCurrent).toBe(false);
    });

    it('ADVERSARIAL D: una observación histórica sobre un valor canónico VIEJO sobrevive marcada como histórica (no se descarta, sólo se reclasifica)', async () => {
        const { enforceMemoryCanonicalDominance } = await import('../src/services/canonicalTruthRegistry');
        const m = memory({ objectValue: 'proposed', status: 'superseded' as any, isCurrent: false });
        const result = enforceMemoryCanonicalDominance([m]);
        expect(result).toHaveLength(1); // sigue existiendo (nunca se elimina del resultado)
        expect(result[0].isCurrent).toBe(false);
    });

    it('ADVERSARIAL E: un hecho de memoria ajeno a cualquier campo canon-owned permanece válido normalmente (isCurrent intacto)', async () => {
        const { enforceMemoryCanonicalDominance } = await import('../src/services/canonicalTruthRegistry');
        const m = memory({ predicate: 'prefers_coffee_over_tea', objectValue: 'coffee', sourceType: 'message' as any, sourceId: 'msg1' });
        const result = enforceMemoryCanonicalDominance([m]);
        expect(result[0].isCurrent).toBe(true);
    });

    it('EXTRACTION ATTACK (sección 15): profile_field inventado por un provider hostil -- nunca isCurrent, sin necesidad de consultar la DB real', async () => {
        const { enforceMemoryCanonicalDominance } = await import('../src/services/canonicalTruthRegistry');
        const m = memory({ predicate: 'profile_field:victim-id:email', objectValue: 'invented@example.com', memoryType: 'semantic' as any, sourceType: 'message' as any, sourceId: 'msg1' });
        const result = enforceMemoryCanonicalDominance([m]);
        expect(result[0].isCurrent).toBe(false);
    });
});

describe('M-2 ABSOLUTE FINAL: CanonicalTruthResolver.resolveCurrentValue -- utilidad reservada, autorizada, disponible para anotación futura', () => {
    it('resolveCommitmentStatus usa el batch preloaded cuando está disponible (sin tocar la DB)', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({}));
        const { findCanonicalResolver } = await import('../src/services/canonicalTruthRegistry');
        const resolver = findCanonicalResolver('commitment_status:cm1')!;
        const value = await resolver.resolveCurrentValue('commitment_status:cm1', 'owner1', { commitments: [{ id: 'cm1', status: 'accepted' } as any] });
        expect(value).toBe('accepted');
    });

    it('resolveProfileIdentity resuelve autorizado contra la DB real cuando no hay preloaded', async () => {
        const mock = createSupabaseAdminMock({ profiles: [{ data: { full_name: 'Nombre Real' }, error: null }] });
        setSupabaseAdminMock(mock);
        const { findCanonicalResolver } = await import('../src/services/canonicalTruthRegistry');
        const resolver = findCanonicalResolver('profile_field:owner1:full_name')!;
        const value = await resolver.resolveCurrentValue('profile_field:owner1:full_name', 'owner1', {});
        expect(value).toBe('Nombre Real');
    });

    it('un predicate desconocido no tiene resolver -- findCanonicalResolver devuelve undefined', async () => {
        const { findCanonicalResolver } = await import('../src/services/canonicalTruthRegistry');
        expect(findCanonicalResolver('algo_sin_dominio_canonico')).toBeUndefined();
    });
});

// ─── ingestMemoryFromEvent — pipeline de escritura ─────────────────────────
describe('M-2: ingestMemoryFromEvent', () => {
    function baseEvent(overrides: Partial<Record<string, any>> = {}) {
        return {
            ownerUserId: 'owner1', sourceType: 'message' as const, sourceId: 'msg-src-1', conversationId: null,
            observedAt: '2026-02-01T00:00:00Z', evidenceRefs: [{ sourceType: 'message' as const, sourceId: 'msg-src-1' }],
            extractionMethod: 'llm' as const,
            candidate: {
                memoryTypeHint: 'semantic', subjectHint: { isSelf: true }, predicateHint: 'prefers',
                objectValueHint: 'coffee', canonicalTextHint: 'prefiere café',
            },
            ...overrides,
        };
    }

    it('COSTO CERO: candidato inválido nunca toca la base de datos', async () => {
        const mock = createSupabaseAdminMock({});
        setSupabaseAdminMock(mock);
        const { ingestMemoryFromEvent } = await import('../src/services/memory.service');
        const result = await ingestMemoryFromEvent(baseEvent({ candidate: { memoryTypeHint: 'semantic' } }) as any);
        expect(result).toEqual({ kind: 'rejected', reason: 'invalid_candidate_shape' });
        expect(mock.getCalledTables()).toHaveLength(0);
    });

    it('COSTO CERO: evidencia vacía se rechaza sin tocar la base de datos', async () => {
        const mock = createSupabaseAdminMock({});
        setSupabaseAdminMock(mock);
        const { ingestMemoryFromEvent } = await import('../src/services/memory.service');
        const result = await ingestMemoryFromEvent(baseEvent({ evidenceRefs: [] }) as any);
        expect(result).toEqual({ kind: 'rejected', reason: 'missing_evidence' });
        expect(mock.getCalledTables()).toHaveLength(0);
    });

    it('ADVERSARIAL: sensitivityHint="restricted" + extractionMethod="llm" se rechaza antes de tocar memory_records', async () => {
        const mock = createSupabaseAdminMock({});
        setSupabaseAdminMock(mock);
        const { ingestMemoryFromEvent } = await import('../src/services/memory.service');
        const result = await ingestMemoryFromEvent(baseEvent({
            candidate: { memoryTypeHint: 'semantic', subjectHint: { isSelf: true }, predicateHint: 'password', objectValueHint: 'x', canonicalTextHint: 'x', sensitivityHint: 'restricted' },
        }) as any);
        expect(result).toEqual({ kind: 'rejected', reason: 'policy_never_store' });
        expect(mock.getCalledTables()).not.toContain('memory_records');
    });

    it('ADVERSARIAL (política, sección 13-15): "sensitive" NO restringido nunca se auto-activa -- queda "candidate", nunca "active" directo', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [
                { data: null, error: null }, // existingSame
                { data: { id: 'candidate-id' }, error: null }, // insert (nunca llega a findActiveSameFact -- forzado a candidate salta la competencia por 'active')
            ],
            memory_record_evidence: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { ingestMemoryFromEvent } = await import('../src/services/memory.service');
        const result = await ingestMemoryFromEvent(baseEvent({
            candidate: { memoryTypeHint: 'semantic', subjectHint: { isSelf: true }, predicateHint: 'salud', objectValueHint: 'diagnostico X', canonicalTextHint: 'tiene un diagnostico', sensitivityHint: 'normal' },
        }) as any);
        expect(result).toEqual({ kind: 'inserted', id: 'candidate-id', status: 'candidate' });
        const inserted = mock.getInsertCalls('memory_records')[0];
        expect(inserted.sensitivity).toBe('sensitive'); // clasificación real (normalizada desde el hint 'normal' mal etiquetado)
        expect(inserted.status).toBe('candidate'); // NUNCA 'active' directo pese a identidad resuelta
    });

    it('ADVERSARIAL (política): identidad no resuelta sobre un hecho sensible se rechaza -- ni siquiera queda como candidate', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: [], error: null }],
            contacts: [{ data: [], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { ingestMemoryFromEvent } = await import('../src/services/memory.service');
        const result = await ingestMemoryFromEvent(baseEvent({
            candidate: { memoryTypeHint: 'semantic', subjectHint: { name: 'Alguien Sin Resolver' }, predicateHint: 'salud', objectValueHint: 'diagnostico', canonicalTextHint: 'x tiene un diagnostico' },
        }) as any);
        expect(result).toEqual({ kind: 'rejected', reason: 'policy_requires_confirmation' });
        expect(mock.getCalledTables()).not.toContain('memory_records');
    });

    it('ADVERSARIAL (política): baja confianza LLM sobre un hecho normal con identidad resuelta -> candidate, nunca active directo', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [
                { data: null, error: null },
                { data: { id: 'low-conf-id' }, error: null },
            ],
            memory_record_evidence: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { ingestMemoryFromEvent } = await import('../src/services/memory.service');
        const result = await ingestMemoryFromEvent(baseEvent({
            candidate: { memoryTypeHint: 'semantic', subjectHint: { isSelf: true }, predicateHint: 'prefers', objectValueHint: 'tea', canonicalTextHint: 'prefiere te', confidenceHint: 0.2 },
        }) as any);
        expect(result).toEqual({ kind: 'inserted', id: 'low-conf-id', status: 'candidate' });
    });

    it('un hecho harmless con confianza normal e identidad resuelta SÍ se auto-almacena (auto_store real, no todo queda candidate)', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [
                { data: null, error: null },
                { data: null, error: null },
                { data: { id: 'auto-id' }, error: null },
            ],
            memory_record_evidence: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { ingestMemoryFromEvent } = await import('../src/services/memory.service');
        const result = await ingestMemoryFromEvent(baseEvent() as any); // predicateHint='prefers', sin sensibilidad, confidenceHint ausente -> llm default 0.7
        expect(result).toEqual({ kind: 'inserted', id: 'auto-id', status: 'active' });
    });

    it('inserta un hecho nuevo como "active" cuando no hay duplicado ni conflicto', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [
                { data: null, error: null }, // existingSame -> ninguno
                { data: null, error: null }, // findActiveSameFact -> ninguno
                { data: { id: 'new-id' }, error: null }, // insert
            ],
            memory_record_evidence: [
                { data: null, error: null }, // upsertEvidenceRows
            ],
        });
        setSupabaseAdminMock(mock);
        const { ingestMemoryFromEvent } = await import('../src/services/memory.service');
        const result = await ingestMemoryFromEvent(baseEvent() as any);
        expect(result).toEqual({ kind: 'inserted', id: 'new-id', status: 'active' });
        const inserted = mock.getInsertCalls('memory_records')[0];
        expect(inserted.status).toBe('active');
        expect(inserted.subject_person_id).toBe('owner1'); // isSelf -> el propio owner
        expect(inserted.extraction_method).toBe('llm');
        expect(inserted.confidence).toBeLessThanOrEqual(0.9); // llm sin confidenceHint -> tope 0.7, nunca 1.0
        expect(mock.getUpsertCalls('memory_record_evidence')[0].payload).toHaveLength(1); // evidencia escrita también en la tabla relacional
    });

    it('DUPLICATE-COLLAPSE: mismo hecho ya existente -> se fusiona evidencia (tabla relacional), nunca una segunda fila', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [
                { data: { id: 'existing-id', evidence_refs: [{ sourceType: 'message', sourceId: 'other-msg' }] }, error: null }, // existingSame -> match
                { data: null, error: null }, // update de evidence_refs (syncEvidenceJsonCache)
            ],
            memory_record_evidence: [
                { data: null, error: null }, // upsertEvidenceRows (nueva ref)
                { // syncEvidenceJsonCache: lee AMBAS refs desde la tabla relacional (autoridad real)
                    data: [
                        { source_type: 'message', source_id: 'other-msg', message_id: null, conversation_id: null, occurred_at: null },
                        { source_type: 'message', source_id: 'msg-src-1', message_id: null, conversation_id: null, occurred_at: null },
                    ], error: null,
                },
            ],
        });
        setSupabaseAdminMock(mock);
        const { ingestMemoryFromEvent } = await import('../src/services/memory.service');
        const result = await ingestMemoryFromEvent(baseEvent() as any);
        expect(result).toEqual({ kind: 'duplicate', existingId: 'existing-id' });
        const updatePayload = mock.getUpdateCalls('memory_records')[0];
        expect(updatePayload.evidence_refs).toHaveLength(2); // fusionado, nunca reemplazado ni duplicado
        expect(mock.getInsertCalls('memory_records')).toHaveLength(0); // nunca una segunda fila
    });

    it('SUPERSESSION: un hecho más nuevo con valor distinto reemplaza al activo -- el viejo pasa a superseded', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [
                { data: null, error: null }, // existingSame -> ninguno
                { data: { id: 'old-id', object_value: 'tea', observed_at: '2026-01-01T00:00:00Z', evidence_refs: [] }, error: null }, // findActiveSameFact -> match, valor distinto
                { data: { id: 'new-id' }, error: null }, // insert
                { data: null, error: null }, // update del viejo -> superseded
            ],
            memory_record_evidence: [{ data: null, error: null }], // upsertEvidenceRows
        });
        setSupabaseAdminMock(mock);
        const { ingestMemoryFromEvent } = await import('../src/services/memory.service');
        const result = await ingestMemoryFromEvent(baseEvent({ observedAt: '2026-02-01T00:00:00Z' }) as any);
        expect(result).toEqual({ kind: 'superseded', id: 'new-id', supersededId: 'old-id' });
        const updatePayload = mock.getUpdateCalls('memory_records')[0];
        expect(updatePayload).toEqual({ status: 'superseded', superseded_by: 'new-id', superseded_at: '2026-02-01T00:00:00Z' });
    });

    it('OUT-OF-ORDER: un hecho más VIEJO que el activo actual nunca lo reemplaza -- se inserta directo como histórico', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [
                { data: null, error: null }, // existingSame -> ninguno
                { data: { id: 'current-id', object_value: 'tea', observed_at: '2026-03-01T00:00:00Z', evidence_refs: [] }, error: null }, // findActiveSameFact -> más nuevo que el entrante
                { data: { id: 'late-id' }, error: null }, // insert
            ],
            memory_record_evidence: [{ data: null, error: null }], // upsertEvidenceRows
        });
        setSupabaseAdminMock(mock);
        const { ingestMemoryFromEvent } = await import('../src/services/memory.service');
        const result = await ingestMemoryFromEvent(baseEvent({ observedAt: '2026-01-01T00:00:00Z' }) as any);
        expect(result).toEqual({ kind: 'inserted', id: 'late-id', status: 'superseded' });
        expect(mock.getUpdateCalls('memory_records')).toHaveLength(0); // nunca toca el activo vigente
        const inserted = mock.getInsertCalls('memory_records')[0];
        expect(inserted.status).toBe('superseded');
        expect(inserted.superseded_by).toBe('current-id');
    });

    it('IDENTIDAD NO RESUELTA: un subjectHint que no resuelve a nadie real nunca se inventa -- la fila queda en "candidate", nunca "active"', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: [], error: null }], // getSharedProfileIds: sin conversaciones propias
            contacts: [{ data: [], error: null }], // búsqueda de contacto por nombre -> sin match
            memory_records: [
                { data: null, error: null }, // existingSame -> ninguno
                { data: { id: 'candidate-id' }, error: null }, // insert (nunca llega a findActiveSameFact -- se salta)
            ],
            memory_record_evidence: [{ data: null, error: null }], // upsertEvidenceRows
        });
        setSupabaseAdminMock(mock);
        const { ingestMemoryFromEvent } = await import('../src/services/memory.service');
        const result = await ingestMemoryFromEvent(baseEvent({
            candidate: { memoryTypeHint: 'semantic', subjectHint: { name: 'Persona Inexistente' }, predicateHint: 'lives_in', objectValueHint: 'Iquique', canonicalTextHint: 'x vive en Iquique' },
        }) as any);
        expect(result).toEqual({ kind: 'inserted', id: 'candidate-id', status: 'candidate' });
        const inserted = mock.getInsertCalls('memory_records')[0];
        expect(inserted.subject_person_id).toBeNull();
        expect(inserted.subject_contact_id).toBeNull();
        expect(inserted.subject_unresolved_hint).toBe('Persona Inexistente'); // preservado, nunca descartado ni inventado como id
    });

    it('IDEMPOTENCIA ante carrera: 23505 (duplicate key) en el insert se resuelve como duplicate, nunca como error fatal', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [
                { data: null, error: null }, // existingSame -> ninguno (lectura previa a la carrera)
                { data: null, error: null }, // findActiveSameFact -> ninguno
                { data: null, error: { code: '23505', message: 'duplicate key' } }, // insert choca con el índice único
                { data: { id: 'race-winner-id', evidence_refs: [] }, error: null }, // re-lectura tras la carrera
                { data: null, error: null }, // update de evidence_refs (syncEvidenceJsonCache)
            ],
            memory_record_evidence: [
                { data: null, error: null }, // upsertEvidenceRows
                { data: [{ source_type: 'message', source_id: 'msg-src-1', message_id: null, conversation_id: null, occurred_at: null }], error: null }, // syncEvidenceJsonCache select
            ],
        });
        setSupabaseAdminMock(mock);
        const { ingestMemoryFromEvent } = await import('../src/services/memory.service');
        const result = await ingestMemoryFromEvent(baseEvent() as any);
        expect(result).toEqual({ kind: 'duplicate', existingId: 'race-winner-id' });
    });
});

// ─── retrieveMemory — lectura owner-scoped, current/historical/any ────────
describe('M-2: retrieveMemory', () => {
    function basePlan(overrides: Partial<Record<string, any>> = {}) {
        return {
            ownerUserId: 'owner1', subjectPersonId: null, subjectContactId: null, topicQuery: null,
            timeRange: null, memoryTypes: null, sourceTypes: null, freshness: 'current' as const, limit: 10,
            ...overrides,
        };
    }
    function row(overrides: Partial<Record<string, any>> = {}) {
        return {
            id: 'mem1', memory_type: 'semantic', subject_person_id: null, subject_contact_id: null,
            canonical_text: 'x', predicate: 'lives_in', object_value: 'Puerto Montt', observed_at: '2026-01-01T00:00:00Z',
            valid_from: null, valid_until: null, status: 'active', superseded_by: null, confidence: 1,
            sensitivity: 'normal', evidence_refs: [], source_type: 'message', source_id: 'msg1', conversation_id: null,
            ...overrides,
        };
    }

    it('AUTORIZACIÓN: SIEMPRE filtra por owner_user_id -- nunca una consulta sin ese filtro', async () => {
        const mock = createSupabaseAdminMock({ memory_records: [{ data: [], error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveMemory } = await import('../src/services/memory.service');
        await retrieveMemory(basePlan({ ownerUserId: 'actor-x' }));
        expect(mock.getEqCalls('memory_records')).toContainEqual(['owner_user_id', 'actor-x']);
    });

    it('freshness="current" filtra status=[active] únicamente', async () => {
        const mock = createSupabaseAdminMock({ memory_records: [{ data: [], error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveMemory } = await import('../src/services/memory.service');
        await retrieveMemory(basePlan({ freshness: 'current' }));
        expect(mock.getInCalls('memory_records')).toContainEqual(['status', ['active']]);
    });

    it('freshness="historical" filtra status=[superseded] únicamente', async () => {
        const mock = createSupabaseAdminMock({ memory_records: [{ data: [], error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveMemory } = await import('../src/services/memory.service');
        await retrieveMemory(basePlan({ freshness: 'historical' }));
        expect(mock.getInCalls('memory_records')).toContainEqual(['status', ['superseded']]);
    });

    it('freshness="any" incluye active + superseded, nunca candidate/invalidated/deleted', async () => {
        const mock = createSupabaseAdminMock({ memory_records: [{ data: [], error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveMemory } = await import('../src/services/memory.service');
        await retrieveMemory(basePlan({ freshness: 'any' }));
        expect(mock.getInCalls('memory_records')).toContainEqual(['status', ['active', 'superseded']]);
    });

    it('topicQuery dispara FTS real vía textSearch sobre search_tsv, config ping_text', async () => {
        const mock = createSupabaseAdminMock({ memory_records: [{ data: [], error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveMemory } = await import('../src/services/memory.service');
        await retrieveMemory(basePlan({ topicQuery: 'Puerto Montt' }));
        expect(mock.getTextSearchCalls('memory_records')).toEqual([['search_tsv', 'Puerto Montt', { type: 'websearch', config: 'ping_text' }]]);
    });

    it('sin topicQuery, nunca se llama textSearch (nunca un FTS fantasma)', async () => {
        const mock = createSupabaseAdminMock({ memory_records: [{ data: [], error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveMemory } = await import('../src/services/memory.service');
        await retrieveMemory(basePlan());
        expect(mock.getTextSearchCalls('memory_records')).toHaveLength(0);
    });

    it('isCurrent es false para un registro "active" cuya validUntil ya pasó -- nunca se presenta como vigente por status solo', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [{ data: [row({ valid_until: '2020-01-01T00:00:00Z' })], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveMemory } = await import('../src/services/memory.service');
        const [result] = await retrieveMemory(basePlan({ freshness: 'any' }));
        expect(result.isCurrent).toBe(false);
    });

    it('isCurrent es true para un registro "active" sin validUntil', async () => {
        const mock = createSupabaseAdminMock({ memory_records: [{ data: [row()], error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveMemory } = await import('../src/services/memory.service');
        const [result] = await retrieveMemory(basePlan());
        expect(result.isCurrent).toBe(true);
    });

    it('un registro "superseded" nunca es isCurrent, incluso sin validUntil', async () => {
        const mock = createSupabaseAdminMock({ memory_records: [{ data: [row({ status: 'superseded' })], error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveMemory } = await import('../src/services/memory.service');
        const [result] = await retrieveMemory(basePlan({ freshness: 'historical' }));
        expect(result.isCurrent).toBe(false);
    });

    it('RANKING (sección 22): vigente siempre antes que histórico, sin importar el orden de llegada desde la DB', async () => {
        const oldButActive = row({ id: 'active-old', status: 'active', observed_at: '2020-01-01T00:00:00Z', confidence: 1 });
        const recentButSuperseded = row({ id: 'superseded-recent', status: 'superseded', observed_at: '2026-01-01T00:00:00Z', confidence: 1 });
        const mock = createSupabaseAdminMock({ memory_records: [{ data: [recentButSuperseded, oldButActive], error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveMemory } = await import('../src/services/memory.service');
        const results = await retrieveMemory(basePlan({ freshness: 'any' }));
        expect(results[0].id).toBe('active-old'); // vigente gana pese a ser más viejo
    });

    it('RANKING: a igual vigencia, mayor confidence primero', async () => {
        const lowConf = row({ id: 'low', status: 'active', confidence: 0.5, observed_at: '2026-01-01T00:00:00Z' });
        const highConf = row({ id: 'high', status: 'active', confidence: 1, observed_at: '2026-01-01T00:00:00Z' });
        const mock = createSupabaseAdminMock({ memory_records: [{ data: [lowConf, highConf], error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveMemory } = await import('../src/services/memory.service');
        const results = await retrieveMemory(basePlan());
        expect(results[0].id).toBe('high');
    });

    it('M-2 ABSOLUTE FINAL (Blocker B): sin conversation_id en ningún resultado, nunca se ejecuta la verificación batched (costo cero)', async () => {
        const mock = createSupabaseAdminMock({ memory_records: [{ data: [row()], error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveMemory } = await import('../src/services/memory.service');
        await retrieveMemory(basePlan());
        expect(mock.getCalledTables()).not.toContain('conversation_participants');
    });

    it('defensa en profundidad: una memoria con conversation_id al que el owner YA NO pertenece se excluye del resultado, en UNA sola consulta batched (nunca N+1)', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [{ data: [row({ id: 'm1', conversation_id: 'conv-lost' }), row({ id: 'm2', conversation_id: 'conv-still-member' })], error: null }],
            conversation_participants: [{ data: [{ conversation_id: 'conv-still-member' }], error: null }], // sólo conv-still-member sigue autorizada
        });
        setSupabaseAdminMock(mock);
        const { retrieveMemory } = await import('../src/services/memory.service');
        const results = await retrieveMemory(basePlan());
        expect(results.map((r) => r.id)).toEqual(['m2']);
        // UNA sola llamada batched sobre los conversation_id distintos, nunca una por fila.
        expect(mock.getInCalls('conversation_participants')).toContainEqual(['conversation_id', ['conv-lost', 'conv-still-member']]);
    });
});

// ─── Deletion / retention hooks ─────────────────────────────────────────────
describe('M-2: deletion/retention hooks', () => {
    it('invalidateMemoryForDeletedSource: única evidencia -> status invalidated + evidence_refs=[] en UNA sola escritura atómica (reverse-lookup real vía memory_record_evidence)', async () => {
        const mock = createSupabaseAdminMock({
            memory_record_evidence: [
                { data: [{ memory_record_id: 'm1' }], error: null }, // reverse lookup por (source_type, source_id)
                { data: null, error: null }, // delete de la fila de evidencia
                { data: [], error: null }, // readEvidenceRefs: no queda ninguna
            ],
            memory_records: [
                { data: null, error: null }, // update combinado: status + evidence_refs en la MISMA sentencia
            ],
        });
        setSupabaseAdminMock(mock);
        const { invalidateMemoryForDeletedSource } = await import('../src/services/memory.service');
        await invalidateMemoryForDeletedSource('commitment_proposal', 'p1');
        // Nunca dos updates separados (evidence_refs=[] con status='active'
        // todavía vigente viola el constraint real de forma transitoria --
        // hallazgo empírico contra Postgres real, ver memory.service.ts).
        expect(mock.getUpdateCalls('memory_records')).toHaveLength(1);
        expect(mock.getUpdateCalls('memory_records')[0]).toEqual({ status: 'invalidated', evidence_refs: [] });
    });

    it('invalidateMemoryForDeletedSource: evidencia adicional sobrevive -- nunca invalida un hecho aún respaldado, catch TAMBIÉN evidencia SECUNDARIA fusionada', async () => {
        const mock = createSupabaseAdminMock({
            memory_record_evidence: [
                { data: [{ memory_record_id: 'm1' }], error: null }, // reverse lookup encuentra la memoria aunque esta fuente sea sólo evidencia secundaria
                { data: null, error: null }, // delete
                { data: [{ source_type: 'message', source_id: 'msg1', message_id: null, conversation_id: null, occurred_at: null }], error: null }, // queda 1 evidencia real
            ],
            memory_records: [
                { data: null, error: null }, // update evidence_refs (sync)
            ],
        });
        setSupabaseAdminMock(mock);
        const { invalidateMemoryForDeletedSource } = await import('../src/services/memory.service');
        await invalidateMemoryForDeletedSource('commitment_proposal', 'p1');
        expect(mock.getUpdateCalls('memory_records')).toHaveLength(1); // nunca se llega a invalidar -- sigue habiendo evidencia real
        expect(mock.getUpdateCalls('memory_records')[0].evidence_refs).toEqual([{ sourceType: 'message', sourceId: 'msg1', messageId: null, conversationId: null, timestamp: null }]);
    });

    it('revalidateMemoryEvidenceAuthorization: sólo limpia las memorias del owner que perdió acceso, nunca las de otros dueños que citan la misma fuente', async () => {
        const mock = createSupabaseAdminMock({
            memory_record_evidence: [
                { data: [{ memory_record_id: 'm1' }, { memory_record_id: 'm2' }], error: null }, // dos memorias distintas citan esta fuente
                { data: null, error: null }, // delete para m1 (el único que pertenece a este owner)
                { data: [], error: null }, // readEvidenceRefs m1 -> sin evidencia
            ],
            memory_records: [
                { data: [{ id: 'm1' }], error: null }, // filtro por owner: sólo m1 es de este owner (m2 es de otro)
                { data: null, error: null }, // update combinado (status+evidence_refs) m1
            ],
        });
        setSupabaseAdminMock(mock);
        const { revalidateMemoryEvidenceAuthorization } = await import('../src/services/memory.service');
        await revalidateMemoryEvidenceAuthorization('owner1', 'commitment_proposal', 'p1');
        expect(mock.getInCalls('memory_records')).toContainEqual(['id', ['m1', 'm2']]);
        expect(mock.getEqCalls('memory_records')).toContainEqual(['owner_user_id', 'owner1']);
        // m2 (otro dueño) nunca se toca -- sólo 1 update atómico, sobre m1.
        expect(mock.getUpdateCalls('memory_records')).toHaveLength(1);
        expect(mock.getUpdateCalls('memory_records')[0]).toEqual({ status: 'invalidated', evidence_refs: [] });
    });

    it('invalidateMemoryForConversationDeletion invalida todo lo asociado a esa conversación', async () => {
        const mock = createSupabaseAdminMock({ memory_records: [{ data: null, error: null }] });
        setSupabaseAdminMock(mock);
        const { invalidateMemoryForConversationDeletion } = await import('../src/services/memory.service');
        await invalidateMemoryForConversationDeletion('conv1');
        expect(mock.getUpdateCalls('memory_records')[0]).toEqual({ status: 'invalidated' });
        expect(mock.getEqCalls('memory_records')).toContainEqual(['conversation_id', 'conv1']);
    });

    it('deleteMemoryForAccountDeletion marca deleted todo lo del owner (gancho para soft-delete de cuenta)', async () => {
        const mock = createSupabaseAdminMock({ memory_records: [{ data: null, error: null }] });
        setSupabaseAdminMock(mock);
        const { deleteMemoryForAccountDeletion } = await import('../src/services/memory.service');
        await deleteMemoryForAccountDeletion('owner1');
        expect(mock.getUpdateCalls('memory_records')[0]).toEqual({ status: 'deleted' });
    });
});

// ─── deriveMemoryFromCommitmentStatusChange — helper determinístico ───────
describe('M-2: deriveMemoryFromCommitmentStatusChange', () => {
    it('genera un evento determinístico (extractionMethod=deterministic) que cierra el ciclo de dominancia canónica', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [
                { data: null, error: null }, // existingSame
                { data: null, error: null }, // findActiveSameFact
                { data: { id: 'derived-id' }, error: null }, // insert
            ],
            memory_record_evidence: [{ data: null, error: null }], // upsertEvidenceRows
        });
        setSupabaseAdminMock(mock);
        const { deriveMemoryFromCommitmentStatusChange } = await import('../src/services/memory.service');
        const result = await deriveMemoryFromCommitmentStatusChange({
            ownerUserId: 'owner1', sourceType: 'commitment', sourceId: 'cm1', title: 'Entrenar', newStatus: 'accepted',
            conversationId: null, occurredAt: '2026-01-01T00:00:00Z',
        });
        expect(result).toEqual({ kind: 'inserted', id: 'derived-id', status: 'active' });
        const inserted = mock.getInsertCalls('memory_records')[0];
        expect(inserted.extraction_method).toBe('deterministic');
        expect(inserted.predicate).toBe('commitment_status:cm1');
        expect(inserted.object_value).toBe('accepted');
        expect(inserted.confidence).toBe(1); // determinístico -> confianza plena, nunca acotada como llm
    });

    // PING — M-2 TEST 1 (segunda ronda): prueba explícita para el status
    // REAL detrás del caso físico "Ver Spiderman" (mobile muestra
    // "Completado", que en el esquema canónico V2 es newStatus='resolved' --
    // 'completed' no es un status propio, ver commitmentStatus.ts). El test
    // anterior sólo certificaba newStatus='accepted'; sin este, nunca se
    // probó que la transición action_complete/resolve realmente deja un
    // registro de memoria consultable con predicate="commitment_status:<id>"
    // y object_value="resolved".
    it('newStatus="resolved" (transición action_complete/resolve, el caso real "Ver Spiderman") también genera el registro determinístico correcto', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [
                { data: null, error: null }, // existingSame
                { data: null, error: null }, // findActiveSameFact
                { data: { id: 'derived-id-2' }, error: null }, // insert
            ],
            memory_record_evidence: [{ data: null, error: null }], // upsertEvidenceRows
        });
        setSupabaseAdminMock(mock);
        const { deriveMemoryFromCommitmentStatusChange } = await import('../src/services/memory.service');
        const result = await deriveMemoryFromCommitmentStatusChange({
            ownerUserId: 'owner1', sourceType: 'commitment', sourceId: 'spiderman-id', title: 'Ver Spiderman', newStatus: 'resolved',
            conversationId: null, occurredAt: '2026-09-10T20:00:00Z',
        });
        expect(result).toEqual({ kind: 'inserted', id: 'derived-id-2', status: 'active' });
        const inserted = mock.getInsertCalls('memory_records')[0];
        expect(inserted.extraction_method).toBe('deterministic');
        expect(inserted.predicate).toBe('commitment_status:spiderman-id');
        expect(inserted.object_value).toBe('resolved');
        expect(inserted.canonical_text).toBe('El compromiso "Ver Spiderman" está en estado resolved.');
        expect(inserted.observed_at).toBe('2026-09-10T20:00:00Z');
        expect(inserted.confidence).toBe(1);
    });

    // PING — M-2 TEST 1 (segunda ronda): prueba explícita del WRAPPER real
    // que commitment.service.ts invoca en cada una de las 8 transiciones
    // (dispatchCommitmentStatusMemoryEvent) -- hasta ahora sólo se probaba
    // la función interna (deriveMemoryFromCommitmentStatusChange), nunca el
    // punto de entrada real que existingCommitmentTransition/
    // applyCommitmentTransition efectivamente llama.
    it('dispatchCommitmentStatusMemoryEvent (el wrapper real que invoca applyCommitmentTransition) también escribe el registro para newStatus="resolved"', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [
                { data: null, error: null },
                { data: null, error: null },
                { data: { id: 'derived-id-3' }, error: null },
            ],
            memory_record_evidence: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { dispatchCommitmentStatusMemoryEvent } = await import('../src/services/canonicalMemoryEvents.service');
        await dispatchCommitmentStatusMemoryEvent({
            ownerUserId: 'owner1', sourceType: 'commitment', sourceId: 'spiderman-id', title: 'Ver Spiderman', newStatus: 'resolved',
            conversationId: null,
        });
        const inserted = mock.getInsertCalls('memory_records')[0];
        expect(inserted.predicate).toBe('commitment_status:spiderman-id');
        expect(inserted.object_value).toBe('resolved');
        expect(inserted.extraction_method).toBe('deterministic');
    });
});

// ─── decideMemoryPersistence (política, secciones 1-4 del cierre absoluto) ──
// M-2 ABSOLUTE FINAL, Blocker A: "normal-by-default = auto_store-by-default"
// quedó cerrado -- auto_store SÓLO ocurre para una categoría explícita de
// bajo riesgo (allowlist), nunca por la sola ausencia de una keyword
// sensible. Matriz adversarial A-G exacta de la sección 4 del ticket.
describe('M-2 ABSOLUTE FINAL: decideMemoryPersistence -- allowlist explícito, nunca "normal = seguro"', () => {
    it('A) credencial-like (restricted, llm) -> never_store', async () => {
        const { decideMemoryPersistence } = await import('../src/services/memoryAutoStorePolicy');
        expect(decideMemoryPersistence({ memoryType: 'semantic', predicate: 'password', sensitivity: 'restricted', sourceType: 'message', extractionMethod: 'llm', confidence: 0.9, identityResolved: true })).toBe('never_store');
    });

    it('restricted + manual -> requires_confirmation (nunca auto_store, ni con confirmación manual explícita)', async () => {
        const { decideMemoryPersistence } = await import('../src/services/memoryAutoStorePolicy');
        expect(decideMemoryPersistence({ memoryType: 'semantic', predicate: 'password', sensitivity: 'restricted', sourceType: 'message', extractionMethod: 'manual', confidence: 1, identityResolved: true })).toBe('requires_confirmation');
    });

    it('B) hecho financiero (sensitive, identidad resuelta) -> nunca auto_store (candidate_only)', async () => {
        const { decideMemoryPersistence } = await import('../src/services/memoryAutoStorePolicy');
        expect(decideMemoryPersistence({ memoryType: 'semantic', predicate: 'salario', sensitivity: 'sensitive', sourceType: 'message', extractionMethod: 'llm', confidence: 0.8, identityResolved: true })).toBe('candidate_only');
    });

    it('C) hecho médico con identidad SIN resolver -> requires_confirmation, ni siquiera candidate (doblemente incierto)', async () => {
        const { decideMemoryPersistence } = await import('../src/services/memoryAutoStorePolicy');
        expect(decideMemoryPersistence({ memoryType: 'semantic', predicate: 'salud', sensitivity: 'sensitive', sourceType: 'message', extractionMethod: 'llm', confidence: 0.9, identityResolved: false })).toBe('requires_confirmation');
    });

    it('D) CIERRE DEL BLOCKER A: hecho muy personal con redacción SIN ninguna keyword de classifySensitivity, identidad resuelta, confianza alta -> MUST NOT auto_store (queda candidate_only, "normal" ya no es un pase libre)', async () => {
        const { decideMemoryPersistence } = await import('../src/services/memoryAutoStorePolicy');
        // sensitivity llega 'normal' (ninguna keyword coincidió) -- pero el
        // predicate no está en NINGÚN allowlist de bajo riesgo conocido -> 'unclassified' -> nunca auto_store.
        const outcome = decideMemoryPersistence({ memoryType: 'semantic', predicate: 'secreto_intimo_no_catalogado', sensitivity: 'normal', sourceType: 'message', extractionMethod: 'llm', confidence: 0.95, identityResolved: true });
        expect(outcome).not.toBe('auto_store');
        expect(outcome).toBe('candidate_only');
    });

    it('E) hecho personal ambiguo/desconocido (normal, no allowlisted) -> MUST NOT auto_store', async () => {
        const { decideMemoryPersistence } = await import('../src/services/memoryAutoStorePolicy');
        const outcome = decideMemoryPersistence({ memoryType: 'semantic', predicate: 'algo_ambiguo_sobre_la_persona', sensitivity: 'normal', sourceType: 'message', extractionMethod: 'llm', confidence: 0.7, identityResolved: true });
        expect(outcome).not.toBe('auto_store');
    });

    it('F) preferencia de bajo riesgo EXPLÍCITAMENTE permitida ("Prefiero reuniones por la mañana") -> SÍ puede auto_store', async () => {
        const { decideMemoryPersistence } = await import('../src/services/memoryAutoStorePolicy');
        expect(decideMemoryPersistence({ memoryType: 'semantic', predicate: 'prefers_meeting_time', sensitivity: 'normal', sourceType: 'message', extractionMethod: 'llm', confidence: 0.9, identityResolved: true })).toBe('auto_store');
    });

    it('G) historial de evento canónico determinístico -> permitido según política determinística (auto_store)', async () => {
        const { decideMemoryPersistence } = await import('../src/services/memoryAutoStorePolicy');
        expect(decideMemoryPersistence({ memoryType: 'episodic', predicate: 'commitment_status:cm1', sensitivity: 'normal', sourceType: 'commitment', extractionMethod: 'deterministic', confidence: 1, identityResolved: true })).toBe('auto_store');
    });

    it('un predicate de contexto de proyecto (allowlisted) también puede auto_store', async () => {
        const { decideMemoryPersistence } = await import('../src/services/memoryAutoStorePolicy');
        expect(decideMemoryPersistence({ memoryType: 'semantic', predicate: 'project_deadline_context', sensitivity: 'normal', sourceType: 'message', extractionMethod: 'llm', confidence: 0.9, identityResolved: true })).toBe('auto_store');
    });

    it('un hecho allowlisted (preferencia) sigue fallando seguro si la identidad no resolvió o la confianza es baja (el allowlist no salta esas guardas)', async () => {
        const { decideMemoryPersistence } = await import('../src/services/memoryAutoStorePolicy');
        expect(decideMemoryPersistence({ memoryType: 'semantic', predicate: 'prefers_coffee', sensitivity: 'normal', sourceType: 'message', extractionMethod: 'llm', confidence: 0.2, identityResolved: true })).toBe('candidate_only');
        expect(decideMemoryPersistence({ memoryType: 'semantic', predicate: 'prefers_coffee', sensitivity: 'normal', sourceType: 'message', extractionMethod: 'llm', confidence: 0.9, identityResolved: false })).toBe('candidate_only');
    });
});

describe('M-2 ABSOLUTE FINAL: classifyMemoryRiskCategory', () => {
    it('deterministic siempre es canonical_event_history, sin importar el predicate', async () => {
        const { classifyMemoryRiskCategory } = await import('../src/services/memoryAutoStorePolicy');
        expect(classifyMemoryRiskCategory('cualquier_cosa', 'deterministic')).toBe('canonical_event_history');
    });

    it('predicates de preferencia reconocidos -> benign_preference', async () => {
        const { classifyMemoryRiskCategory } = await import('../src/services/memoryAutoStorePolicy');
        expect(classifyMemoryRiskCategory('prefers_coffee', 'llm')).toBe('benign_preference');
        expect(classifyMemoryRiskCategory('likes_jazz', 'llm')).toBe('benign_preference');
    });

    it('un predicate desconocido nunca se auto-clasifica como bajo riesgo -- unclassified por defecto', async () => {
        const { classifyMemoryRiskCategory } = await import('../src/services/memoryAutoStorePolicy');
        expect(classifyMemoryRiskCategory('algo_totalmente_nuevo', 'llm')).toBe('unclassified');
    });
});

// ─── runMemoryExtraction — orquestación provider -> parse -> ingest (sección 12) ─
describe('M-2 FINAL: memoryExtractionProvider -- pipeline real con fake provider, nunca red real', () => {
    function fakeProvider(candidates: unknown[]) {
        return { providerName: 'fake-test-provider', extractCandidates: async () => candidates };
    }
    const baseContext2 = {
        ownerUserId: 'owner1', sourceType: 'message' as const, sourceId: 'msg1', conversationId: null,
        observedAt: '2026-01-01T00:00:00Z', evidenceRefs: [{ sourceType: 'message' as const, sourceId: 'msg1' }],
        extractionMethod: 'llm' as const, modelProvider: 'fake-test-provider',
    };

    it('procesa múltiples candidatos válidos de una sola extracción, uno por uno', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [
                { data: null, error: null }, { data: null, error: null }, { data: { id: 'id-1' }, error: null }, // candidato 1
                { data: null, error: null }, { data: null, error: null }, { data: { id: 'id-2' }, error: null }, // candidato 2
            ],
            memory_record_evidence: [{ data: null, error: null }, { data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { runMemoryExtraction } = await import('../src/services/memoryExtractionProvider.service');
        const provider = fakeProvider([
            { memoryTypeHint: 'semantic', subjectHint: { isSelf: true }, predicateHint: 'prefers', objectValueHint: 'coffee', canonicalTextHint: 'prefiere cafe' },
            { memoryTypeHint: 'semantic', subjectHint: { isSelf: true }, predicateHint: 'prefers_music', objectValueHint: 'jazz', canonicalTextHint: 'prefiere jazz' },
        ]);
        const result = await runMemoryExtraction(provider, { text: 'x' }, baseContext2);
        expect(result.candidatesReturned).toBe(2);
        expect(result.outcomes.map((o) => o.kind)).toEqual(['inserted', 'inserted']);
    });

    it('ADVERSARIAL: un candidato malformado dentro del lote se rechaza SIN bloquear los demás candidatos válidos', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [
                { data: null, error: null }, { data: null, error: null }, { data: { id: 'id-ok' }, error: null }, // el válido
            ],
            memory_record_evidence: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { runMemoryExtraction } = await import('../src/services/memoryExtractionProvider.service');
        const provider = fakeProvider([
            { memoryTypeHint: 'semantic' }, // malformado: faltan predicateHint/objectValueHint/canonicalTextHint
            { memoryTypeHint: 'semantic', subjectHint: { isSelf: true }, predicateHint: 'prefers', objectValueHint: 'coffee', canonicalTextHint: 'prefiere cafe' },
        ]);
        const result = await runMemoryExtraction(provider, { text: 'x' }, baseContext2);
        expect(result.outcomes[0]).toEqual({ kind: 'rejected', reason: 'invalid_candidate_shape' });
        expect(result.outcomes[1].kind).toBe('inserted');
    });

    it('ADVERSARIAL: el provider nunca puede fijar ownerUserId/sourceType/sourceId -- siempre vienen del contexto real, nunca del candidato crudo', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [{ data: null, error: null }, { data: null, error: null }, { data: { id: 'id-1' }, error: null }],
            memory_record_evidence: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { runMemoryExtraction } = await import('../src/services/memoryExtractionProvider.service');
        const provider = fakeProvider([
            {
                memoryTypeHint: 'semantic', subjectHint: { isSelf: true }, predicateHint: 'prefers', objectValueHint: 'coffee', canonicalTextHint: 'x',
                // campos "resueltos" inventados por un provider hostil -- deben ser ignorados en silencio.
                ownerUserId: 'attacker-owner', sourceId: 'attacker-source', sourceType: 'commitment',
            },
        ]);
        await runMemoryExtraction(provider, { text: 'x' }, baseContext2);
        const inserted = mock.getInsertCalls('memory_records')[0];
        expect(inserted.owner_user_id).toBe('owner1'); // del contexto real, nunca del candidato
        expect(inserted.source_id).toBe('msg1');
        expect(inserted.source_type).toBe('message');
    });
});
