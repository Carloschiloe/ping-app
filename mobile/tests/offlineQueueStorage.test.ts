import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { removeItem } = vi.hoisted(() => ({
    removeItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { removeItem },
}));

import { clearOfflineMessageQueue } from '../src/utils/offlineQueueStorage';
import { OFFLINE_QUEUE_KEY } from '../src/utils/synchronization';

describe('offline queue storage', () => {
    beforeEach(() => {
        removeItem.mockReset();
        removeItem.mockResolvedValue(undefined);
    });

    it('removes the complete queue when the authenticated session ends', async () => {
        await clearOfflineMessageQueue();
        expect(removeItem).toHaveBeenCalledOnce();
        expect(removeItem).toHaveBeenCalledWith(OFFLINE_QUEUE_KEY);
    });

    it('guards persistence until the queue has finished hydrating', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../src/hooks/useOfflineSync.ts'),
            'utf8',
        );
        expect(source).toContain('const [isQueueHydrated, setIsQueueHydrated] = useState(false);');
        expect(source).toMatch(/if \(!isQueueHydrated\) return;/);
        expect(source).toContain('setIsQueueHydrated(true);');
    });
});
