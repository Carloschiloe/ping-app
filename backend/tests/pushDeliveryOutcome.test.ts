import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, rpcMock, chunkMock, sendMock, isExpoPushTokenMock } = vi.hoisted(() => ({
    fromMock: vi.fn(),
    rpcMock: vi.fn(),
    chunkMock: vi.fn(),
    sendMock: vi.fn(),
    isExpoPushTokenMock: vi.fn(() => true),
}));

vi.mock('expo-server-sdk', () => ({
    Expo: class {
        static isExpoPushToken = isExpoPushTokenMock;
        chunkPushNotifications(messages: unknown[]) {
            return chunkMock(messages);
        }
        sendPushNotificationsAsync(chunk: unknown[]) {
            return sendMock(chunk);
        }
    },
}));

vi.mock('../src/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: fromMock, rpc: rpcMock } }));

import { checkDueCommitments } from '../src/services/push.service';

function makeDueAt() {
    const dueAt = new Date(Date.now() + 5 * 60 * 1000);
    dueAt.setSeconds(30, 0);
    return dueAt.toISOString();
}

function configureDatabase(dueAt: string) {
    let commitmentQueryCount = 0;
    fromMock.mockImplementation((table: string) => {
        if (table === 'profiles') {
            const query = {
                select: vi.fn(() => query),
                in: vi.fn(async () => ({
                    data: [{ id: 'user-1', expo_push_token: 'ExponentPushToken[test]' }],
                    error: null,
                })),
            };
            return query;
        }

        commitmentQueryCount += 1;
        const query = {
            select: vi.fn(() => query),
            in: vi.fn(() => query),
            gte: vi.fn(() => query),
            lte: vi.fn(async () => ({
                data: commitmentQueryCount === 2
                    ? [{ id: 'commitment-1', title: 'Comprar leche', owner_user_id: 'user-1', due_at: dueAt }]
                    : [],
                error: null,
            })),
        };
        return query;
    });
}

describe('push delivery outcome persistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        chunkMock.mockImplementation((messages: unknown[]) => [messages]);
        rpcMock.mockImplementation(async (name: string) => {
            if (name === 'claim_notification_delivery') return { data: true, error: null };
            return { data: true, error: null };
        });
    });

    it('completes a delivery only when Expo returns an ok ticket', async () => {
        configureDatabase(makeDueAt());
        sendMock.mockResolvedValue([{ status: 'ok', id: 'expo-ticket-1' }]);

        await checkDueCommitments();

        expect(rpcMock).toHaveBeenCalledWith('complete_notification_delivery', expect.objectContaining({
            p_delivery_key: expect.stringContaining('ping-notification:'),
            p_provider: 'expo',
            p_provider_message_id: 'expo-ticket-1',
        }));
        expect(rpcMock).not.toHaveBeenCalledWith('fail_notification_delivery', expect.anything());
    });

    it('records a provider rejection as failed and never as sent', async () => {
        configureDatabase(makeDueAt());
        sendMock.mockResolvedValue([{
            status: 'error',
            message: 'The notification could not be delivered',
            details: { error: 'DeviceNotRegistered' },
        }]);

        await checkDueCommitments();

        expect(rpcMock).toHaveBeenCalledWith('fail_notification_delivery', expect.objectContaining({
            p_delivery_key: expect.stringContaining('ping-notification:'),
            p_error: expect.stringContaining('expo:DeviceNotRegistered'),
        }));
        expect(rpcMock).not.toHaveBeenCalledWith('complete_notification_delivery', expect.anything());
    });
});
