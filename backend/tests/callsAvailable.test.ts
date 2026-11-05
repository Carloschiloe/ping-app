import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const routes = fs.readFileSync(path.join(__dirname, '../src/routes/index.ts'), 'utf-8');

describe('Calls work without a feature switch', () => {
    it('token, call notice and call page are open to signed-in participants', () => {
        expect(routes).toContain("router.get('/agora/token/:channelName', requireAuth, agoraController.getToken);");
        expect(routes).toContain("router.post('/agora/call/notify', requireAuth, agoraController.notifyCall);");
        expect(routes).toContain("router.get('/call', agoraController.renderCallPage);");
    });

    it('only recording a call stays behind its switch', () => {
        expect(routes).toContain("router.post('/agora/recording/start', requireAuth, callRecordingEnabled,");
        expect(routes).not.toContain("requireFeature('ENABLE_CALLS')");
    });
});
