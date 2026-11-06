import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatSummary } from '../components/SummaryModal';

// The last summary of each chat is kept on the phone with the newest message
// it covered. While no message arrives after it, tapping Resumen shows it at
// once instead of reading the whole chat again.

type SavedSummary = { newestMessageId: string; summary: ChatSummary };

export const summaryCacheKey = (userId: string, conversationId: string) => `ping.chat-summary.v1:${userId}:${conversationId}`;

export async function readSavedSummary(userId: string, conversationId: string, newestMessageId?: string | null): Promise<ChatSummary | null> {
    if (!newestMessageId) return null;
    try {
        const raw = await AsyncStorage.getItem(summaryCacheKey(userId, conversationId));
        const saved = raw ? (JSON.parse(raw) as SavedSummary) : null;
        return saved?.newestMessageId === newestMessageId && saved.summary?.text ? saved.summary : null;
    } catch {
        return null;
    }
}

export function saveSummary(userId: string, conversationId: string, newestMessageId: string | null | undefined, summary: ChatSummary) {
    // A summary that failed is not worth keeping.
    if (!newestMessageId || !summary.sections) return;
    const value: SavedSummary = { newestMessageId, summary };
    AsyncStorage.setItem(summaryCacheKey(userId, conversationId), JSON.stringify(value)).catch(() => undefined);
}
