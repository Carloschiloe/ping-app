import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

interface ActiveTyper {
    id: string;
    name: string;
    isRecording: boolean;
    recordingStartedAt: number | null;
}

interface ActivityPayload {
    user_id: string;
    name: string;
    email: string;
    typing: boolean;
    recording: boolean;
    recording_started_at: number | null;
}

const TYPING_EXPIRY_MS = 4_000;
const RECORDING_EXPIRY_MS = 5 * 60_000;

export function useChatPresence(conversationId: string, user: any) {
    const userId = user?.id as string | undefined;
    const [activeTypers, setActiveTypers] = useState<ActiveTyper[]>([]);
    const presenceChannel = useRef<any>(null);
    const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const remoteTimeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const presenceActivities = useRef(new Map<string, ActiveTyper>());
    const broadcastActivities = useRef(new Map<string, ActiveTyper>());
    const lastTypingTime = useRef(0);
    const recordingStartedAt = useRef<number | null>(null);

    const publishMergedActivities = useCallback(() => {
        const merged = new Map(presenceActivities.current);
        broadcastActivities.current.forEach((activity, id) => {
            const current = merged.get(id);
            if (!current || activity.isRecording || !current.isRecording) {
                merged.set(id, activity);
            }
        });
        setActiveTypers(Array.from(merged.values()));
    }, []);

    const rememberBroadcastActivity = useCallback((payload: ActivityPayload) => {
        const id = payload.user_id;
        if (!id || id === userId) return;

        const existingTimeout = remoteTimeouts.current.get(id);
        if (existingTimeout) clearTimeout(existingTimeout);

        if (!payload.typing && !payload.recording) {
            broadcastActivities.current.delete(id);
            publishMergedActivities();
            return;
        }

        broadcastActivities.current.set(id, {
            id,
            name: payload.name || payload.email || 'Alguien',
            isRecording: payload.recording,
            recordingStartedAt: payload.recording ? payload.recording_started_at : null,
        });
        publishMergedActivities();

        const timeout = setTimeout(() => {
            broadcastActivities.current.delete(id);
            remoteTimeouts.current.delete(id);
            publishMergedActivities();
        }, payload.recording ? RECORDING_EXPIRY_MS : TYPING_EXPIRY_MS);
        remoteTimeouts.current.set(id, timeout);
    }, [publishMergedActivities, userId]);

    useEffect(() => {
        if (!conversationId || !userId) return;

        const channel = supabase.channel(`presence-${conversationId}`, {
            config: {
                presence: { key: userId },
                broadcast: { self: false },
            },
        });

        let isSubscribed = false;
        const activeRemoteTimeouts = remoteTimeouts.current;
        const activePresenceActivities = presenceActivities.current;
        const activeBroadcastActivities = broadcastActivities.current;

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const nextPresence = new Map<string, ActiveTyper>();

                Object.keys(state).forEach((key) => {
                    if (key === userId) return;

                    const sessions: any[] = state[key] as any[];
                    const isTyping = sessions.some((session) => session.typing === true);
                    const isRecording = sessions.some((session) => session.recording === true);
                    if (!isTyping && !isRecording) return;

                    const activitySession = sessions.find((session) =>
                        isRecording ? session.recording === true : session.typing === true
                    ) || sessions[0];

                    nextPresence.set(key, {
                        id: key,
                        name: activitySession.name || activitySession.email || 'Alguien',
                        isRecording,
                        recordingStartedAt: isRecording
                            ? Number(activitySession.recording_started_at) || Date.now()
                            : null,
                    });
                });

                presenceActivities.current = nextPresence;
                publishMergedActivities();
            })
            .on('broadcast', { event: 'activity' }, ({ payload }) => {
                rememberBroadcastActivity(payload as ActivityPayload);
            })
            .subscribe((status) => {
                isSubscribed = status === 'SUBSCRIBED';
            });

        presenceChannel.current = {
            publish: async (payload: ActivityPayload) => {
                if (!isSubscribed) return false;

                try {
                    await Promise.all([
                        channel.track(payload),
                        channel.send({
                            type: 'broadcast',
                            event: 'activity',
                            payload,
                        }),
                    ]);
                    return true;
                } catch (error) {
                    console.warn('[Presence] Activity update failed', {
                        message: error instanceof Error ? error.message : 'unknown',
                    });
                    return false;
                }
            },
        };

        return () => {
            if (typingTimeout.current) clearTimeout(typingTimeout.current);
            activeRemoteTimeouts.forEach((timeout) => clearTimeout(timeout));
            activeRemoteTimeouts.clear();
            activePresenceActivities.clear();
            activeBroadcastActivities.clear();
            supabase.removeChannel(channel);
            presenceChannel.current = null;
        };
    }, [conversationId, publishMergedActivities, rememberBroadcastActivity, userId]);

    const buildPayload = (overrides: Partial<ActivityPayload>): ActivityPayload => ({
        user_id: user.id,
        name: user.user_metadata?.full_name?.split(' ')[0]
            || user.full_name?.split(' ')[0]
            || user.email?.split('@')[0]
            || 'Un usuario',
        email: user.email?.split('@')[0] || 'Un usuario',
        typing: false,
        recording: false,
        recording_started_at: null,
        ...overrides,
    });

    const broadcastTyping = async (isTyping: boolean) => {
        if (!presenceChannel.current || !user) return;

        const now = Date.now();
        if (isTyping && now - lastTypingTime.current < 700) return;

        const success = await presenceChannel.current.publish(buildPayload({
            typing: isTyping,
        }));
        if (isTyping && success) lastTypingTime.current = Date.now();
    };

    const broadcastRecording = async (isRecording: boolean) => {
        if (!presenceChannel.current || !user) return;

        if (isRecording) {
            recordingStartedAt.current = Date.now();
        }

        await presenceChannel.current.publish(buildPayload({
            recording: isRecording,
            recording_started_at: isRecording ? recordingStartedAt.current : null,
        }));

        if (!isRecording) recordingStartedAt.current = null;
    };

    const handleTyping = (isTyping = true) => {
        broadcastTyping(isTyping);
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        if (isTyping) {
            typingTimeout.current = setTimeout(() => {
                broadcastTyping(false);
            }, 3_000);
        }
    };

    return {
        activeTypers,
        handleTyping,
        broadcastRecording,
    };
}
