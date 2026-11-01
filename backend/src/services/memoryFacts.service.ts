// M11 — the facts a user told Ping to remember, as one small read/forget
// surface shared by the assistant (what it knows each turn, "olvida eso") and
// the Perfil list. Only the user's own requested facts: derived memories
// (commitment status history) are never shown or forgotten here.
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';

export const USER_FACT_PREDICATE = 'user_requested_memory';
export const MAX_USER_FACTS = 40;

export interface UserFact {
    id: string;
    text: string;
    createdAt: string;
}

export async function listUserFacts(ownerUserId: string, limit = MAX_USER_FACTS): Promise<UserFact[]> {
    const { data, error } = await supabaseAdmin
        .from('memory_records')
        .select('id, canonical_text, observed_at')
        .eq('owner_user_id', ownerUserId)
        .eq('predicate', USER_FACT_PREDICATE)
        .eq('status', 'active')
        .order('observed_at', { ascending: false })
        .limit(limit);
    if (error) throw new AppError(error.message, 500);
    return (data ?? []).map((row: { id: string; canonical_text: string; observed_at: string }) => ({
        id: row.id,
        text: row.canonical_text,
        createdAt: row.observed_at,
    }));
}

/** Soft-deletes one of the owner's active facts; false when there was none. */
export async function forgetUserFact(ownerUserId: string, factId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from('memory_records')
        .update({ status: 'deleted' })
        .eq('id', factId)
        .eq('owner_user_id', ownerUserId)
        .eq('predicate', USER_FACT_PREDICATE)
        .eq('status', 'active')
        .select('id');
    if (error) throw new AppError(error.message, 500);
    return (data ?? []).length === 1;
}
