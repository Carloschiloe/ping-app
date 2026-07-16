
// Fuente unica de verdad de los tipos V2 del dominio compartido entre
// pantallas/hooks. Estados canonicos V2 (backend/src/utils/commitmentStatus.ts):
// SOLO estos 6 valores se persisten en la base. 'completed'/'pending'/
// 'in_progress'/'postponed'/'done' son legacy y NUNCA deben tratarse como
// estado propio del mobile — solo existen como alias de ENTRADA temporal
// (ver utils/commitmentStatus.ts:normalizeCommitmentStatus).
export type CommitmentStatus =
    | 'proposed'
    | 'accepted'
    | 'counter_proposal'
    | 'rejected'
    | 'resolved'
    | 'cancelled';

// Alias legacy aceptados SOLO como entrada (nunca como estado canonico de
// verdad ni renderizado como tal). Ver utils/commitmentStatus.ts.
export type LegacyCommitmentStatusInput = 'pending' | 'in_progress' | 'postponed' | 'done' | 'completed';

export interface Profile {
    id: string;
    full_name: string;
    avatar_url: string;
    email: string;
}

// Contacto externo (contraparte de un commitment sin cuenta en Ping).
export interface Contact {
    id: string;
    display_name: string;
    phone?: string | null;
    email?: string | null;
    linked_user_id?: string | null;
    created_at: string;
}

export interface Commitment {
    id: string;
    owner_user_id: string;
    assigned_to_user_id?: string | null;
    counterparty_contact_id?: string | null;
    conversation_id?: string | null;
    message_id?: string | null;
    title: string;
    description?: string | null;
    due_at: string | null;
    proposed_due_at?: string | null;
    status: CommitmentStatus;
    type?: 'task' | 'meeting';
    priority?: 'low' | 'medium' | 'high';
    expected_result?: string | null;
    next_action?: string | null;
    follow_up_at?: string | null;
    waiting_on_user_id?: string | null;
    waiting_on_contact_id?: string | null;
    action_completed_at?: string | null;
    resolved_at?: string | null;
    rejection_reason?: string | null;
    created_at: string;
    meta?: any;
    assignee?: Profile;
    owner?: Profile;
    counterparty?: Contact;
    // Alias temporales de compatibilidad devueltos por el backend (ver
    // backend/src/utils/commitmentCompat.ts). No usar en logica nueva: se
    // conservan solo por si algun consumidor viejo todavia los lee.
    group_conversation_id?: string | null;
    is_group_task?: boolean;
    completed?: boolean;
}

export interface CommitmentEvent {
    id: string;
    commitment_id: string;
    actor_user_id: string | null;
    event_type:
        | 'created' | 'accepted' | 'rejected' | 'counter_proposed' | 'rescheduled'
        | 'action_completed' | 'resolved' | 'reopened' | 'cancelled'
        | 'follow_up_scheduled' | 'reassigned';
    previous_status: CommitmentStatus | null;
    new_status: CommitmentStatus | null;
    payload: Record<string, any>;
    created_at: string;
}

export interface Conversation {
    id: string;
    name?: string | null;
    avatar_url?: string | null;
    isGroup: boolean;
    archived: boolean;
    mode?: 'chat' | 'operation';
    otherUser?: Profile | null;
    groupMetadata?: { id: string; name?: string | null; avatar_url?: string | null } | null;
    lastMessage?: Message | null;
    unreadCount?: number;
}

export interface Message {
    id: string;
    conversation_id: string;
    sender_id: string | null;
    content: string;
    metadata?: Record<string, any> | null;
    message_type?: string | null;
    system_event_type?: string | null;
    status: string;
    created_at: string;
    profiles?: Profile | Profile[] | null;
    // Alias temporales de compatibilidad devueltos por el backend (ver
    // backend/src/utils/messageCompat.ts). Preferir content/metadata.
    text?: string;
    meta?: Record<string, any>;
}

export interface InsightsResponse {
    needsAttention: Commitment[];
    awaitingResponse: Commitment[];
    overdue: Commitment[];
    upcoming: Commitment[];
    noDate: Commitment[];
    actionDonePendingResolution: Commitment[];
    recentlyResolved: Commitment[];
    counts: {
        needsAttention: number;
        awaitingResponse: number;
        overdue: number;
        upcoming: number;
        noDate: number;
        actionDonePendingResolution: number;
        recentlyResolved: number;
    };
    // Alias temporal de compatibilidad (ver backend/src/controllers/insights.controller.ts).
    pendingResponse?: Commitment[];
}

export interface ProactiveAction {
    id: string;
    label: string;
    type: 'OPEN_CHAT' | 'COMPLETE_TASK' | 'CREATE_NOTE' | 'REPLY';
    payload: any;
}

export interface Briefing {
    title: string;
    summary: string;
    priority_commitment?: Commitment;
    suggestions: ProactiveAction[];
}
