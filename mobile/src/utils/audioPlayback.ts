/**
 * Returns whether a stopped player is at the end of its current source.
 *
 * A paused player must keep its position so the next tap resumes playback.
 * Only an actual end-of-track signal (or an exact known-duration position)
 * should trigger a rewind for replay.
 */
export interface AudioPlaybackStatusLike {
    currentTime: number;
    duration: number;
    didJustFinish: boolean;
}

export function shouldRestartAudioPlayback(status: AudioPlaybackStatusLike): boolean {
    if (status.didJustFinish) {
        return true;
    }

    return status.duration > 0 && status.currentTime >= status.duration;
}
