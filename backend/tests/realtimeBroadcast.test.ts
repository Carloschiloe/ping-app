import { beforeEach, describe, expect, it, vi } from 'vitest';

const realtimeMocks = vi.hoisted(() => ({
    channel: vi.fn(),
    removeChannel: vi.fn(async () => ({ status: 'ok' })),
}));

vi.mock('../src/lib/supabaseAdmin', () => ({
    supabaseAdmin: {
        channel: realtimeMocks.channel,
        removeChannel: realtimeMocks.removeChannel,
    },
}));

import { sendRealtimeBroadcast } from '../src/utils/realtimeBroadcast';

describe('sendRealtimeBroadcast', () => {
    beforeEach(() => {
        realtimeMocks.channel.mockReset();
        realtimeMocks.removeChannel.mockClear();
    });

    it('sends a one-shot broadcast and removes its channel', async () => {
        const channel = { send: vi.fn(async () => ({ status: 'ok' })) };
        realtimeMocks.channel.mockReturnValue(channel);

        await sendRealtimeBroadcast('calls:user:u1', 'incoming_call', { callId: 'c1' });

        expect(channel.send).toHaveBeenCalledWith({
            type: 'broadcast',
            event: 'incoming_call',
            payload: { callId: 'c1' },
        });
        expect(realtimeMocks.removeChannel).toHaveBeenCalledWith(channel);
    });

    it('removes the channel when Supabase rejects the broadcast', async () => {
        const channel = { send: vi.fn(async () => { throw new Error('realtime unavailable'); }) };
        realtimeMocks.channel.mockReturnValue(channel);

        await expect(sendRealtimeBroadcast('calls:user:u1', 'incoming_call', {})).rejects.toThrow('realtime unavailable');
        expect(realtimeMocks.removeChannel).toHaveBeenCalledWith(channel);
    });
});
