import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { toLegacyMessageListShape } from '../utils/messageCompat';
import { toLegacyIsGroup } from '../utils/conversationCompat';
import { toLegacyCommitmentListShape } from '../utils/commitmentCompat';
import { isCanonicalCommitmentStatus, normalizeCommitmentStatus, tryNormalizeCommitmentStatus } from '../utils/commitmentStatus';
import { getSharedProfileIds } from '../utils/authz';
import {
    buildCommitmentVisibilityFilter,
    getParticipantProposalIds,
} from '../utils/commitmentVisibility';

const COMMITMENT_SELECT = `
    id, title, description, due_at, proposed_due_at, status, type, priority,
    expected_result, next_action, follow_up_at, rejection_reason,
    owner_user_id, assigned_to_user_id, counterparty_contact_id, conversation_id, message_id, created_at,
    owner:owner_user_id(id, full_name, email, avatar_url),
    assignee:assigned_to_user_id(id, full_name, email, avatar_url),
    counterparty:counterparty_contact_id(id, display_name, phone, email),
    message:message_id(id, conversation_id)
`;

// V2: busca en title/description/expected_result/next_action directamente
// (nunca en `meta`, que ya no es fuente primaria de datos criticos), mas
// contraparte (usuario asignado o contacto externo) y status V2. `meta` no
// se usa como fuente de busqueda.
async function searchCommitmentsV2(userId: string, q: string) {
    const participantProposalIds = await getParticipantProposalIds(userId);
    const ownershipFilter = buildCommitmentVisibilityFilter(userId, participantProposalIds);
    const resultsById = new Map<string, any>();

    const addAll = (rows: any[] | null | undefined) => {
        for (const row of rows || []) resultsById.set(row.id, row);
    };

    // 1. Texto libre: title/description/expected_result/next_action.
    const { data: byText } = await supabaseAdmin
        .from('commitments')
        .select(COMMITMENT_SELECT)
        .or(ownershipFilter)
        .or(`title.ilike.%${q}%,description.ilike.%${q}%,expected_result.ilike.%${q}%,next_action.ilike.%${q}%`)
        .limit(20);
    addAll(byText);

    // 2. Contraparte externa (contacto sin cuenta Ping): nombre/telefono/email.
    const { data: matchingContacts } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('owner_user_id', userId)
        .or(`display_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(20);
    const contactIds = (matchingContacts || []).map((c) => c.id);
    if (contactIds.length > 0) {
        const { data: byContact } = await supabaseAdmin
            .from('commitments')
            .select(COMMITMENT_SELECT)
            .or(ownershipFilter)
            .in('counterparty_contact_id', contactIds)
            .limit(20);
        addAll(byContact);
    }

    // 3. Contraparte usuario de Ping (nombre/email del asignado) y mensaje de
    // origen: no son filtrables via ilike sobre una relacion embebida en
    // supabase-js, se filtran en memoria sobre el scope ya autorizado.
    const ownScopeResult = await supabaseAdmin
        .from('commitments')
        .select(COMMITMENT_SELECT)
        .or(ownershipFilter)
        .limit(200);
    const ownScope: any[] = ownScopeResult.data || [];
    const qLower = q.toLowerCase();
    for (const row of ownScope) {
        const assignee = row.assignee as { full_name?: string; email?: string } | null;
        const assigneeMatch = assignee && (
            (assignee.full_name || '').toLowerCase().includes(qLower)
            || (assignee.email || '').toLowerCase().includes(qLower)
        );
        if (assigneeMatch) resultsById.set(row.id, row);
    }

    // 4. Mensaje de origen: contenido del mensaje que genero el compromiso.
    const messageIds = (ownScope || []).map((row: any) => row.message_id).filter(Boolean);
    if (messageIds.length > 0) {
        const { data: matchingMessages } = await supabaseAdmin
            .from('messages')
            .select('id')
            .in('id', messageIds)
            .ilike('content', `%${q}%`);
        const matchingMessageIds = new Set((matchingMessages || []).map((m) => m.id));
        for (const row of ownScope || []) {
            if (row.message_id && matchingMessageIds.has(row.message_id)) resultsById.set(row.id, row);
        }
    }

    // 5. Status V2 (o alias legacy de lectura): "resuelto"/"resolved" no se
    // interpreta como texto libre en Spanish aqui (evita falsos positivos),
    // solo coincidencia exacta con un valor canonico o alias reconocido.
    const normalizedQueryStatus = tryNormalizeCommitmentStatus(q) ?? (isCanonicalCommitmentStatus(qLower) ? normalizeCommitmentStatus(qLower) : null);
    if (normalizedQueryStatus) {
        for (const row of ownScope || []) {
            if (row.status === normalizedQueryStatus) resultsById.set(row.id, row);
        }
    }

    // 6. Fecha (YYYY-MM-DD): coincidencia por dia calendario sobre due_at.
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.trim())) {
        const dayStart = new Date(`${q.trim()}T00:00:00.000Z`);
        const dayEnd = new Date(`${q.trim()}T23:59:59.999Z`);
        if (!isNaN(dayStart.getTime())) {
            const { data: byDate } = await supabaseAdmin
                .from('commitments')
                .select(COMMITMENT_SELECT)
                .or(ownershipFilter)
                .gte('due_at', dayStart.toISOString())
                .lte('due_at', dayEnd.toISOString())
                .limit(20);
            addAll(byDate);
        }
    }

    return Array.from(resultsById.values()).slice(0, 30);
}

export const search = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const { q } = req.query;

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        if (!q || typeof q !== 'string') {
            res.status(400).json({ error: 'Search query "q" is required' });
            return;
        }

        const searchTerm = q.trim();
        if (
            searchTerm.length < 2
            || searchTerm.length > 100
            || !/^[\p{L}\p{N}\s@._+\-]+$/u.test(searchTerm)
        ) {
            res.status(400).json({ error: 'Search query contains unsupported characters' });
            return;
        }

        // 1. Get user's conversation IDs
        const { data: participations } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        const convIds = (participations || []).map(p => p.conversation_id);

        // 2. Search messages in those conversations
        // V2: content reemplaza text.
        const { data: messages, error: msgError } = await supabaseAdmin
            .from('messages')
            .select(`
                *,
                sender:profiles!messages_sender_id_fkey(full_name, avatar_url, email)
            `)
            .in('conversation_id', convIds)
            .is('deleted_at', null)
            .ilike('content', `%${searchTerm}%`)
            .order('created_at', { ascending: false })
            .limit(30);

        if (msgError) throw msgError;

        // 3. Search commitments: title/description/expected_result/next_action,
        // contraparte (usuario o contacto externo), status V2, fecha, y
        // mensaje de origen. Nunca busca dentro de `meta`.
        const commitmentsById = new Map<string, any>((await searchCommitmentsV2(userId, searchTerm)).map((c: any) => [c.id, c]));

        // 4. Search Profiles only inside the user's already-authorized
        // conversation scope. Service role must not expose a global directory.
        const sharedProfileIds = await getSharedProfileIds(userId);
        let profiles: any[] = [];
        if (sharedProfileIds.length > 0) {
            const { data, error: profError } = await supabaseAdmin
                .from('profiles')
                .select('id, full_name, email, avatar_url')
                .in('id', sharedProfileIds)
                .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
                .limit(20);
            if (profError) throw profError;
            profiles = data || [];
        }

        // 5. Search Conversations (Group Names)
        // V2: conversation_type reemplaza is_group.
        const { data: conversations, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('id, name, avatar_url, conversation_type')
            .in('id', convIds)
            .eq('conversation_type', 'group')
            .ilike('name', `%${searchTerm}%`)
            .limit(20);

        if (convError) throw convError;

        const conversationsCompat = (conversations || []).map(c => ({
            ...c,
            is_group: toLegacyIsGroup(c.conversation_type),
        }));

        // 6. Compromisos cuya conversacion coincide por nombre (busqueda por
        // "conversation" pedida explicitamente): se agregan al mismo set.
        const matchingConversationIds = (conversations || []).map((c) => c.id);
        if (matchingConversationIds.length > 0) {
            const participantProposalIds = await getParticipantProposalIds(userId);
            const { data: byConversation } = await supabaseAdmin
                .from('commitments')
                .select('id, title, description, due_at, proposed_due_at, status, type, priority, expected_result, next_action, follow_up_at, rejection_reason, owner_user_id, assigned_to_user_id, counterparty_contact_id, conversation_id, message_id, created_at, owner:owner_user_id(id, full_name, email, avatar_url), assignee:assigned_to_user_id(id, full_name, email, avatar_url)')
                .or(buildCommitmentVisibilityFilter(userId, participantProposalIds))
                .in('conversation_id', matchingConversationIds)
                .limit(20);
            for (const row of byConversation || []) commitmentsById.set(row.id, row);
        }

        res.status(200).json({
            messages: toLegacyMessageListShape(messages),
            commitments: toLegacyCommitmentListShape(Array.from(commitmentsById.values())),
            profiles,
            conversations: conversationsCompat
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
