import { describe, expect, it } from 'vitest';
import {
    buildCallPageUrl,
    buildCallPageOriginWhitelist,
    isCallPageUrl,
    getAllowedCallPermissionResources,
    parseCallBridgeMessage,
} from '../src/utils/callBridge';

describe('call bridge', () => {
    it('restricts the call page whitelist to the API origin', () => {
        expect(buildCallPageOriginWhitelist('https://ping-app-con3.onrender.com/api'))
            .toEqual(['https://ping-app-con3.onrender.com']);
        expect(buildCallPageOriginWhitelist('https://ping-app-con3.onrender.com/api/'))
            .toEqual(['https://ping-app-con3.onrender.com']);
    });

    it('keeps a change of page on the same server inside the app, as the web view checks it', () => {
        // Same check the web view makes: the list against the page's origin only.
        const origin = (url: string) => /^[A-Za-z][A-Za-z0-9+\-.]+:(\/\/)?[^/]*/.exec(url)![0];
        const passes = (url: string) => buildCallPageOriginWhitelist('https://api.vorian.app/api')
            .some((item) => new RegExp('^' + item.replace(/[.+?^$()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')).test(origin(url)));
        expect(passes('https://api.vorian.app/api/agent/voice/live/client?provider=openai')).toBe(true);
        expect(isCallPageUrl('https://api.vorian.app/api', 'https://api.vorian.app/api/agent/voice/live/client?provider=openai')).toBe(true);
        expect(isCallPageUrl('https://api.vorian.app/api', 'https://api.vorian.app.otro.com/x')).toBe(false);
        expect(isCallPageUrl('https://api.vorian.app/api', 'https://otro.com/')).toBe(false);
    });

    it('allows audio only for voice calls and audio plus video for video calls', () => {
        expect(getAllowedCallPermissionResources(false)).toEqual(['AUDIO_CAPTURE']);
        expect(getAllowedCallPermissionResources(true)).toEqual([
            'AUDIO_CAPTURE',
            'VIDEO_CAPTURE',
        ]);
    });

    it('keeps the /api prefix when building the Agora call page URL', () => {
        const url = buildCallPageUrl('https://ping-app-con3.onrender.com/api', {
            appId: 'app-id',
            token: 'token with symbols/+',
            channel: 'conversation-id',
            video: true,
            timestamp: 123,
        });

        expect(url).toBe(
            'https://ping-app-con3.onrender.com/api/call'
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

import { parseMeetingBridgeMessage } from '../src/utils/callBridge';

describe('meeting recording bridge', () => {
    it('reads what the call page says about the recording', () => {
        expect(parseMeetingBridgeMessage(JSON.stringify({ type: 'meeting-recording', state: 'uploaded', startedAt: '2026-11-16T13:00:00.000Z', seconds: 61.5 })))
            .toEqual({ type: 'meeting-recording', state: 'uploaded', startedAt: '2026-11-16T13:00:00.000Z', seconds: 61.5, pieces: null });
        expect(parseMeetingBridgeMessage(JSON.stringify({ type: 'meeting-recording', state: 'recording', seconds: 'x' })))
            .toEqual({ type: 'meeting-recording', state: 'recording', startedAt: undefined, seconds: undefined, pieces: null });
    });

    it('keeps the map of the pieces the phone kept, and drops a broken one', () => {
        const pieces = [{ at: 0, from: 0, len: 2.5 }, { at: 7.1, from: 2.5, len: 1.2 }];
        expect(parseMeetingBridgeMessage(JSON.stringify({ type: 'meeting-recording', state: 'uploaded', pieces }))?.pieces).toEqual(pieces);
        expect(parseMeetingBridgeMessage(JSON.stringify({ type: 'meeting-recording', state: 'uploaded', pieces: [{ at: -1, from: 0, len: 1 }] }))?.pieces).toBeNull();
    });

    it('ignores anything else', () => {
        expect(parseMeetingBridgeMessage('hangup')).toBeNull();
        expect(parseMeetingBridgeMessage(JSON.stringify({ type: 'call-status', status: 'connected' }))).toBeNull();
        expect(parseMeetingBridgeMessage(JSON.stringify({ type: 'meeting-recording', state: 'delete-everything' }))).toBeNull();
    });
});
