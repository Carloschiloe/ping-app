import { describe, expect, it } from 'vitest';
import {
    buildCallPageUrl,
    parseCallBridgeMessage,
} from '../src/utils/callBridge';

describe('call bridge', () => {
    it('keeps the /api prefix when building the Agora call page URL', () => {
        const url = buildCallPageUrl('https://ping-backend-staging.onrender.com/api', {
            appId: 'app-id',
            token: 'token with symbols/+',
            channel: 'conversation-id',
            video: true,
            timestamp: 123,
        });

        expect(url).toBe(
            'https://ping-backend-staging.onrender.com/api/call'
            + '?appId=app-id&token=token+with+symbols%2F%2B'
            + '&channel=conversation-id&video=true&t=123'
        );
    });

    it('accepts only known status messages from the call page', () => {
        expect(parseCallBridgeMessage(
            JSON.stringify({ type: 'call-status', status: 'connected' })
        )).toEqual({ type: 'call-status', status: 'connected' });
        expect(parseCallBridgeMessage('hangup')).toBeNull();
        expect(parseCallBridgeMessage(
            JSON.stringify({ type: 'call-status', status: 'unknown' })
        )).toBeNull();
    });
});
