import { describe, it, expect } from 'vitest';
import { createCommitmentSchema, updateCommitmentSchema } from '../src/schemas/commitment.schema';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

describe('createCommitmentSchema', () => {
    it('acepta un compromiso válido con solo título', async () => {
        const result = await createCommitmentSchema.safeParseAsync({
            body: { title: 'Comprar pan' },
        });
        expect(result.success).toBe(true);
    });

    it('rechaza un compromiso sin título', async () => {
        const result = await createCommitmentSchema.safeParseAsync({
            body: {},
        });
        expect(result.success).toBe(false);
    });

    it('rechaza un título demasiado corto (menos de 3 caracteres)', async () => {
        const result = await createCommitmentSchema.safeParseAsync({
            body: { title: 'ab' },
        });
        expect(result.success).toBe(false);
    });

    it('rechaza un due_at con formato de fecha inválido', async () => {
        const result = await createCommitmentSchema.safeParseAsync({
            body: { title: 'Comprar pan', due_at: 'no-es-una-fecha' },
        });
        expect(result.success).toBe(false);
    });

    it('acepta un due_at ISO válido', async () => {
        const result = await createCommitmentSchema.safeParseAsync({
            body: { title: 'Comprar pan', due_at: '2026-03-05T15:00:00-03:00' },
        });
        expect(result.success).toBe(true);
    });

    it('acepta un assigned_to_user_id con formato UUID válido', async () => {
        const result = await createCommitmentSchema.safeParseAsync({
            body: { title: 'Comprar pan', assigned_to_user_id: VALID_UUID },
        });
        expect(result.success).toBe(true);
    });

    it('rechaza un assigned_to_user_id que no es UUID', async () => {
        const result = await createCommitmentSchema.safeParseAsync({
            body: { title: 'Comprar pan', assigned_to_user_id: 'no-es-un-uuid' },
        });
        expect(result.success).toBe(false);
    });
});

describe('updateCommitmentSchema', () => {
    it('acepta un id de params válido junto con un body vacío', async () => {
        const result = await updateCommitmentSchema.safeParseAsync({
            params: { id: VALID_UUID },
            body: {},
        });
        expect(result.success).toBe(true);
    });

    it('rechaza un id de params que no es UUID', async () => {
        const result = await updateCommitmentSchema.safeParseAsync({
            params: { id: 'no-es-un-uuid' },
            body: {},
        });
        expect(result.success).toBe(false);
    });

    it('ignora silenciosamente un campo no declarado en el schema (comportamiento "strip" por defecto de Zod)', async () => {
        const result = await updateCommitmentSchema.safeParseAsync({
            params: { id: VALID_UUID },
            body: { title: 'Nuevo título', campo_no_permitido: 'valor_extra' },
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data.body as Record<string, unknown>).campo_no_permitido).toBeUndefined();
        }
    });

    it('acepta rejection_reason como string', async () => {
        const result = await updateCommitmentSchema.safeParseAsync({
            params: { id: VALID_UUID },
            body: { rejection_reason: 'No pude asistir' },
        });
        expect(result.success).toBe(true);
    });
});
