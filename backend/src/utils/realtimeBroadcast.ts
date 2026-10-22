import { supabaseAdmin } from '../lib/supabaseAdmin';

export async function sendRealtimeBroadcast(
    topic: string,
    event: string,
    payload: Record<string, unknown>,
): Promise<void> {
    const channel = supabaseAdmin.channel(topic);
    try {
        // Sending before subscribe uses Supabase's HTTP path and avoids
        // retaining a WebSocket subscription for a one-shot server signal.
        await channel.send({ type: 'broadcast', event, payload });
    } finally {
        // One channel is created per notification recipient. Always release
        // it, including when Realtime rejects the broadcast.
        await supabaseAdmin.removeChannel(channel);
    }
}
