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
});
