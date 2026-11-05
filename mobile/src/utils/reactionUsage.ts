import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The reactions a person reaches for most come first. The count lives on
// the phone only: it is a personal habit, not something to share.

export const ALL_REACTIONS = [
    '👍', '❤️', '😂', '🙏', '✅', '👌', '😮', '😢',
    '🔥', '👏', '🎉', '💪', '🤝', '😍', '🤔', '😅',
    '👀', '🙌', '😡', '👎', '💯', '⏰', '📌',
];

export const QUICK_COUNT = 7;
const STORAGE_KEY = 'ping.reactionUsage.v1';

export function rankReactions(counts: Record<string, number>): string[] {
    // Most used first; ties keep the default order, so a new phone starts sensibly.
    return [...ALL_REACTIONS].sort((a, b) => (counts[b] || 0) - (counts[a] || 0)
        || ALL_REACTIONS.indexOf(a) - ALL_REACTIONS.indexOf(b));
}

export function useReactionOrder() {
    const [counts, setCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        AsyncStorage.getItem(STORAGE_KEY)
            .then((raw) => { if (raw) setCounts(JSON.parse(raw)); })
            .catch(() => {});
    }, []);

    const recordReaction = useCallback((emoji: string) => {
        setCounts((current) => {
            const next = { ...current, [emoji]: (current[emoji] || 0) + 1 };
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
            return next;
        });
    }, []);

    return { ordered: rankReactions(counts), recordReaction };
}
