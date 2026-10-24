import { createHash } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export interface NotificationDeliveryIdentity {
    ownerUserId: string;
    commitmentId: string;
    notificationKind: string;
    windowLabel: string;
    dueAt: string;
}

export function buildNotificationDeliveryKey(identity: NotificationDeliveryIdentity): string {
    const canonical = [
        identity.ownerUserId.trim(),
        identity.commitmentId.trim(),
        identity.notificationKind.trim(),
        identity.windowLabel.trim(),
        identity.dueAt.trim(),
    ].join('|');
    return `ping-notification:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

export async function claimNotificationDelivery(identity: NotificationDeliveryIdentity): Promise<{ claimed: boolean; deliveryKey: string }> {
    const deliveryKey = buildNotificationDeliveryKey(identity);
    const { data, error } = await supabaseAdmin.rpc('claim_notification_delivery', {
        p_delivery_key: deliveryKey,
        p_owner_user_id: identity.ownerUserId,
        p_commitment_id: identity.commitmentId,
        p_notification_kind: identity.notificationKind,
        p_window_label: identity.windowLabel,
        p_due_at: identity.dueAt,
    });
    if (error) throw error;
    return { claimed: data === true, deliveryKey };
}

export async function completeNotificationDelivery(deliveryKey: string, provider = 'expo', providerMessageId?: string | null): Promise<void> {
    const { error } = await supabaseAdmin.rpc('complete_notification_delivery', {
        p_delivery_key: deliveryKey,
        p_provider: provider,
        p_provider_message_id: providerMessageId ?? null,
    });
    if (error) throw error;
}

export async function failNotificationDelivery(deliveryKey: string, errorMessage: string): Promise<void> {
    const { error } = await supabaseAdmin.rpc('fail_notification_delivery', {
        p_delivery_key: deliveryKey,
        p_error: errorMessage,
    });
    if (error) throw error;
}
