import { describe, expect, it } from 'vitest';
import { FIRST_MEETING_APP_VERSION, olderVersion } from '../src/services/meetings/meetingRecording.service';

describe('phones too old to be asked to record', () => {
    it('compares app versions number by number', () => {
        expect(olderVersion('1.0.4', FIRST_MEETING_APP_VERSION)).toBe(true);
        expect(olderVersion('1.0.5', FIRST_MEETING_APP_VERSION)).toBe(false);
        expect(olderVersion('1.0.10', FIRST_MEETING_APP_VERSION)).toBe(false);
        expect(olderVersion('1.1', FIRST_MEETING_APP_VERSION)).toBe(false);
        expect(olderVersion('0.9.9', FIRST_MEETING_APP_VERSION)).toBe(true);
    });

    it('does not block a phone whose version is unknown', () => {
        expect(olderVersion(null, FIRST_MEETING_APP_VERSION)).toBe(false);
        expect(olderVersion('', FIRST_MEETING_APP_VERSION)).toBe(false);
    });
});
