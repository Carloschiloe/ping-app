import { describe, expect, it } from 'vitest';
import {
    formatRecordingDuration,
    resolveRecordingDurationMs,
} from '../src/utils/audioRecording';

describe('audio recording duration', () => {
    it('formats elapsed milliseconds as minutes and seconds', () => {
        expect(formatRecordingDuration(0)).toBe('00:00');
        expect(formatRecordingDuration(1_999)).toBe('00:01');
        expect(formatRecordingDuration(65_000)).toBe('01:05');
    });

    it('never displays a negative duration', () => {
        expect(formatRecordingDuration(-1_000)).toBe('00:00');
    });

    it('preserves the last Expo Go progress duration when unload reports zero', () => {
        expect(resolveRecordingDurationMs(0, 4_237)).toBe(4_237);
    });

    it('prefers a valid final recorder duration and omits an unmeasured duration', () => {
        expect(resolveRecordingDurationMs(4_312, 4_237)).toBe(4_312);
        expect(resolveRecordingDurationMs(0, 0)).toBeUndefined();
    });
});
