// Insercion append-only en commitment_events. Se llama SIEMPRE despues de que
// la operacion principal sobre `commitments` ya se confirmo exitosa (nunca
// antes, nunca en paralelo): si el insert del evento falla, la transicion de
// negocio ya ocurrio y no se revierte (ver seccion de riesgos de atomicidad
// en el informe final). No existe update ni delete de commitment_events en
// ningun punto del backend: la tabla solo tiene policy de SELECT para
// `authenticated` (ver baseline_v2.sql), y aqui solo se usa `insert`.
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { CommitmentEventType } from './commitmentTransitions';
import { CanonicalCommitmentStatus } from './commitmentStatus';

export interface RecordCommitmentEventInput {
    commitmentId: string;
    actorUserId: string | null;
    eventType: CommitmentEventType;
    previousStatus: CanonicalCommitmentStatus | null;
    newStatus: CanonicalCommitmentStatus | null;
    payload?: Record<string, any>;
}

export async function recordCommitmentEvent(input: RecordCommitmentEventInput): Promise<void> {
    const { error } = await supabaseAdmin.from('commitment_events').insert({
        commitment_id: input.commitmentId,
        actor_user_id: input.actorUserId,
        event_type: input.eventType,
        previous_status: input.previousStatus,
        new_status: input.newStatus,
        payload: input.payload || {},
    });

    if (error) {
        // No se relanza: la operacion principal (el update/insert de
        // commitments) ya se confirmo. Perder un registro de auditoria no
        // debe hacer fallar la respuesta al usuario, pero se deja rastro en
        // logs para deteccion.
        console.error('[commitmentEvents] Failed to record commitment_events row (main operation already succeeded):', {
            commitmentId: input.commitmentId,
            eventType: input.eventType,
            error,
        });
    }
}
