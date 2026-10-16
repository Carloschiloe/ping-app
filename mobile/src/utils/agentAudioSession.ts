import type { AudioMode } from 'expo-audio';

/**
 * Audio session used while Ping captures a voice turn.
 *
 * The agent must receive only the microphone signal. `doNotMix` prevents
 * speech/audio already playing on the device from sharing the capture
 * session. The installed native module already supports this; no APK change
 * is required for this JS-level policy change.
 */
export const AGENT_RECORDING_AUDIO_MODE: Partial<AudioMode> = {
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
};

/** Restore the normal app audio policy after a voice turn ends or is cancelled. */
export const AGENT_IDLE_AUDIO_MODE: Partial<AudioMode> = {
    allowsRecording: false,
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
};
