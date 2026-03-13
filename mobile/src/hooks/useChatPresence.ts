import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface ActiveTyper {
    id: string;
    name: string;
    isRecording: boolean;
}

interface PresenceData {
    user_id: string;
    name: string;
    email: string;
    typing: boolean;
    recording: boolean;
}

export function useChatPresence(conversationId: string, user: any) {
    const [activeTypers, setActiveTypers] = useState<ActiveTyper[]>([]);
    const presenceChannel = useRef<any>(null);
    const typingTimeout = useRef<NodeJS.Timeout | null>(null);
    const lastTypingTime = useRef<number>(0);

    useEffect(() => {
        if (!conversationId || !user) return;

        const channel = supabase.channel(`presence-${conversationId}`, {
            config: { presence: { key: user.id } },
        });

        let isSubscribed = false;

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const active: ActiveTyper[] = [];
                Object.keys(state).forEach((key) => {
                    if (key !== user.id) {
                        const sessions: any[] = state[key];
                        const isTyping = sessions.some(s => s.typing === true);
                        const isRec = sessions.some(s => s.recording === true);
                        if (isTyping || isRec) {
                            const pData = sessions[0];
                            active.push({
                                id: key,
                                name: pData.name || pData.email || 'Alguien',
                                isRecording: isRec
                            });
                        }
                    }
                });
                setActiveTypers(active);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    isSubscribed = true;
                }
            });

        presenceChannel.current = {
            channel,
            track: async (data: any) => {
                if (isSubscribed) {
                    try {
                        await channel.track(data);
                        return true;
                    } catch (e) {
                        return false;
                    }
                }
                return false;
            }
        };

        return () => {
            channel.unsubscribe();
            presenceChannel.current = null;
        };
    }, [conversationId, user]);

    const broadcastTyping = async (isTyping: boolean) => {
        if (!presenceChannel.current || !user) return;

        const now = Date.now();
        if (isTyping && now - lastTypingTime.current < 1500) return;

        const success = await presenceChannel.current.track({
            user_id: user.id,
            name: (user as any).full_name?.split(' ')[0],
            email: user.email?.split('@')[0] || 'Un usuario',
            typing: isTyping,
            recording: false
        });

        if (isTyping && success) {
            lastTypingTime.current = Date.now();
        }
    };

    const broadcastRecording = async (isRec: boolean) => {
        if (!presenceChannel.current || !user) return;
        await presenceChannel.current.track({
            user_id: user.id,
            name: (user as any).full_name?.split(' ')[0],
            email: user.email?.split('@')[0] || 'Un usuario',
            typing: false,
            recording: isRec
        });
    };

    const handleTyping = () => {
        broadcastTyping(true);
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => { broadcastTyping(false); }, 3000);
    };

    return {
        activeTypers,
        handleTyping,
        broadcastRecording
    };
}
