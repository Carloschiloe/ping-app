export function formatRecordingDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Expo Go can report a zero duration when the recorder is unloaded even
 * though progress updates already observed valid elapsed time. Preserve the
 * final native value when it is valid, otherwise keep the last observation.
 */
export function resolveRecordingDurationMs(
    finalDurationMs: number | undefined,
    observedDurationMs: number | undefined,
): number | undefined {
    for (const candidate of [finalDurationMs, observedDurationMs]) {
        if (Number.isFinite(candidate) && Number(candidate) > 0) {
            return Math.round(Number(candidate));
        }
    }
    return undefined;
}
