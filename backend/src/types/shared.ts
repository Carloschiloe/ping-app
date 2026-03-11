
export type CommitmentStatus = 'pending' | 'proposed' | 'accepted' | 'rejected' | 'completed' | 'postponed' | 'counter_proposal' | 'done';

export interface Profile {
    id: string;
    full_name: string;
    avatar_url: string;
    email: string;
}

export interface Commitment {
    id: string;
    owner_user_id: string;
    assigned_to_user_id?: string;
    group_conversation_id?: string;
    message_id?: string;
    title: string;
    due_at: string;
    status: CommitmentStatus;
    created_at: string;
    meta?: any;
    priority?: 'low' | 'medium' | 'high'; // Virtual or stored in meta
    assignee?: Profile;
    owner?: Profile;
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
