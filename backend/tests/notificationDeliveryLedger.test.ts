import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../src/lib/supabaseAdmin', () => ({
    supabaseAdmin: { rpc },
}));

import {
    buildNotificationDeliveryKey,
    claimNotificationDelivery,
    completeNotificationDelivery,
    failNotificationDelivery,
} from '../src/services/notificationDeliveryLedger.service';

describe('notification delivery ledger', () => {
    beforeEach(() => rpc.mockReset());

    it('derives one stable key from the complete delivery identity', () => {
        const base = {
            ownerUserId: 'user-1',
            commitmentId: 'commitment-1',
            notificationKind: 'commitment_due',
            windowLabel: '30min',
            dueAt: '2026-10-25T12:00:00.000Z',
        };
        expect(buildNotificationDeliveryKey(base)).toBe(buildNotificationDeliveryKey({ ...base }));
        expect(buildNotificationDeliveryKey(base)).not.toBe(buildNotificationDeliveryKey({ ...base, windowLabel: '5min' }));
    });

    it('claims through the service-only RPC and returns the stable key', async () => {
        rpc.mockResolvedValue({ data: true, error: null });
        const result = await claimNotificationDelivery({
            ownerUserId: 'user-1',
            commitmentId: 'commitment-1',
            notificationKind: 'commitment_due',
            windowLabel: '30min',
            dueAt: '2026-10-25T12:00:00.000Z',
        });
        expect(result.claimed).toBe(true);
        expect(rpc).toHaveBeenCalledWith('claim_notification_delivery', expect.objectContaining({
            p_delivery_key: result.deliveryKey,
            p_window_label: '30min',
        }));
    });

    it('records completion and failure without exposing table writes to callers', async () => {
        rpc.mockResolvedValue({ data: true, error: null });
        await completeNotificationDelivery('delivery-key');
        await failNotificationDelivery('delivery-key', 'temporary provider failure');
        expect(rpc).toHaveBeenNthCalledWith(1, 'complete_notification_delivery', {
            p_delivery_key: 'delivery-key',
            p_provider: 'expo',
            p_provider_message_id: null,
        });
        expect(rpc).toHaveBeenNthCalledWith(2, 'fail_notification_delivery', {
            p_delivery_key: 'delivery-key',
            p_error: 'temporary provider failure',
        });
    });
});
