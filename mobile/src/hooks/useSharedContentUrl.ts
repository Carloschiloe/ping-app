import { useCallback, useEffect, useState } from 'react';
import {
    resolveAttachmentUrl,
    resolvePrivateFileUrl,
} from '../lib/privateFiles';
import type { SharedContentItem } from '../types/sharedContent';

export function useSharedContentUrl(item: SharedContentItem | null, enabled = true) {
    const [url, setUrl] = useState<string | null>(null);
    const [state, setState] = useState<'idle' | 'loading' | 'available' | 'unavailable'>('idle');
    const [refreshVersion, setRefreshVersion] = useState(0);

    const refresh = useCallback(() => setRefreshVersion((version) => version + 1), []);

    useEffect(() => {
        if (!item || !enabled || item.type === 'link') return;
        let active = true;
        const forceRefresh = refreshVersion > 0;
        setState('loading');

        const resolve = async () => {
            try {
                const access = item.attachmentId
                    ? await resolveAttachmentUrl(item.attachmentId, { forceRefresh })
                    : await resolvePrivateFileUrl('message', item.messageId, { forceRefresh });
                if (!active) return;
                setUrl(access.signedUrl);
                setState('available');
            } catch {
                if (!active) return;
                if (item.legacyUrl) {
                    setUrl(item.legacyUrl);
                    setState('available');
                } else {
                    setUrl(null);
                    setState('unavailable');
                }
            }
        };
        void resolve();
        return () => {
            active = false;
        };
    }, [enabled, item, refreshVersion]);

    return { url, state, refresh };
}
