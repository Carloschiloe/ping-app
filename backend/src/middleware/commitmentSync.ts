import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { sendRealtimeBroadcast } from '../utils/realtimeBroadcast';

// When someone creates, answers or changes a commitment, the other people in
// that chat must see it at once. The phones also listen to database changes,
// but those did not always arrive, so the other phone only noticed on its
// next refresh (up to a minute later). After every successful write to a
// commitment or proposal, this sends a direct signal to each person
// involved, on the same kind of channel incoming calls already use.

const WRITE_PATH = /^\/(commitments|commitment-proposals)(\/|$)/;

export const SYNC_EVENT = 'commitments_changed';
export const syncTopicFor = (userId: string) => `sync:user:${userId}`;

function pickString(...values: unknown[]): string | null {
    for (const value of values) if (typeof value === 'string' && value) return value;
    return null;
}

/** Conversation and people named by a commitment-shaped response or request. */
export function involvedFrom(body: any, requestBody: any): { conversationId: string | null; userIds: string[] } {
    const items = [body, body?.data, body?.proposal, body?.commitment, requestBody].filter((x) => x && typeof x === 'object');
    let conversationId: string | null = null;
    const userIds = new Set<string>();
    for (const item of items) {
        conversationId ??= pickString(item.conversation_id, item.conversationId, item.context_conversation_id, item.group_conversation_id, item.groupConversationId);
        for (const id of [item.owner_user_id, item.assigned_to_user_id, item.proposed_by_user_id, item.assignedToUserId]) {
            if (typeof id === 'string' && id) userIds.add(id);
        }
    }
    return { conversationId, userIds: [...userIds] };
}

async function notifyInvolved(actorId: string | undefined, body: any, requestBody: any): Promise<void> {
    const { conversationId, userIds } = involvedFrom(body, requestBody);
    const people = new Set(userIds);
    if (conversationId) {
        const { data } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId);
        for (const row of data ?? []) if (row.user_id) people.add(row.user_id);
    }
    if (actorId) people.delete(actorId);
    await Promise.all([...people].slice(0, 50).map((userId) =>
        sendRealtimeBroadcast(syncTopicFor(userId), SYNC_EVENT, { conversationId }).catch(() => undefined),
    ));
}

export function commitmentSync(req: Request, res: Response, next: NextFunction): void {
    if (req.method === 'GET' || !WRITE_PATH.test(req.path)) {
        next();
        return;
    }
    const originalJson = res.json.bind(res);
    res.json = ((body: any) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            const actorId = (req as any).user?.id as string | undefined;
            void notifyInvolved(actorId, body, req.body).catch(() => undefined);
        }
        return originalJson(body);
    }) as Response['json'];
    next();
}
