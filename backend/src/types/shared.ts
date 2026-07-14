
export type CommitmentStatus = 'proposed' | 'accepted' | 'counter_proposal' | 'rejected' | 'resolved' | 'cancelled';

export interface Profile {
    id: string;
    full_name: string;
    avatar_url: string;
    email: string;
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
    priority?: 'low' | 'medium' | 'high';
    assignee?: Profile;
    owner?: Profile;
    // Alias temporales de compatibilidad mobile (ver utils/commitmentCompat.ts).
    group_conversation_id?: string | null;
    is_group_task?: boolean;
    completed?: boolean;
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
