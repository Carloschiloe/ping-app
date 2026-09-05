// SDK 57 hotfix — expo-av (retirado de Expo Go: "Cannot find native module
// 'ExponentAV'") migrado a expo-audio para AUDIO. Pure-logic /
// static-audit tests (sin renderer, consistente con vitest.config.ts):
// certifican que la migración es estructuralmente correcta, que el contrato
// con el backend (mime type, filename, duration) no cambió, y que ningún
// archivo de audio real sigue importando expo-av. Los usos de VIDEO se
// migraron a expo-video en un hotfix posterior -- ver
// tests/expoVideoMigration.test.ts.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function readSrc(relPath: string): string {
    return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8');
}

describe('SDK57 hotfix: useAudioRecorder migrado a expo-audio', () => {
    const src = readSrc('src/hooks/useAudioRecorder.ts');

    it('nunca importa expo-av', () => {
        expect(src).not.toMatch(/from ['"]expo-av['"]/);
    });

    it('importa la API real de expo-audio usada', () => {
        expect(src).toMatch(/from ['"]expo-audio['"]/);
        expect(src).toContain('useAudioRecorder as useExpoAudioRecorder');
        expect(src).toContain('useAudioRecorderState');
        expect(src).toContain('RecordingPresets');
        expect(src).toContain('requestRecordingPermissionsAsync');
        expect(src).toContain('setAudioModeAsync');
    });

    it('usa RecordingPresets.HIGH_QUALITY (mismo formato m4a/AAC que antes)', () => {
        expect(src).toContain('RecordingPresets.HIGH_QUALITY');
    });

    it('preserva el flujo record/stop/uri de la API nueva', () => {
        expect(src).toContain('recorder.prepareToRecordAsync()');
        expect(src).toContain('recorder.record()');
        expect(src).toContain('recorder.stop()');
        expect(src).toContain('recorder.uri');
    });

    it('sigue usando resolveRecordingDurationMs (workaround de duración 0 ya certificado)', () => {
        expect(src).toContain('resolveRecordingDurationMs');
    });

    it('permission denied: nunca continúa a grabar si granted es false', () => {
        expect(src).toMatch(/if \(!granted\)/);
    });

    it('preserva el contrato exacto de subida (mime type y contrato de attachment sin cambios)', () => {
        expect(src).toContain("'audio/m4a'");
        expect(src).toMatch(/uploadPrivateMessageAttachment\(\s*conversationId,\s*recordingUri,\s*'audio\/m4a'/);
    });

    it('preserva el contrato público del hook (mismos nombres devueltos, para no tocar ChatScreen.tsx)', () => {
        expect(src).toMatch(/return\s*{\s*isRecording,\s*recordingUri,\s*recordingDurationMs,\s*startRecording,\s*stopRecording,\s*cancelAudio,\s*uploadAudio/);
    });

    it('cancelAudio limpia el estado local (uri y duración) sin dejar residuos', () => {
        const cancelFn = src.slice(src.indexOf('const cancelAudio'), src.indexOf('const uploadAudio'));
        expect(cancelFn).toContain('setRecordingUri(null)');
        expect(cancelFn).toMatch(/setRecordingDurationMs\(0\)/);
    });
});

describe('SDK57 hotfix: AudioPlayer migrado a expo-audio', () => {
    const src = readSrc('src/components/AudioPlayer.tsx');

    it('nunca importa expo-av', () => {
        expect(src).not.toMatch(/from ['"]expo-av['"]/);
    });

    it('usa los hooks reales de expo-audio (play/pause reactivos)', () => {
        expect(src).toMatch(/from ['"]expo-audio['"]/);
        expect(src).toContain('useAudioPlayer(');
        expect(src).toContain('useAudioPlayerStatus(');
        expect(src).toContain('status.playing');
    });

    it('play/pause: toggle llama player.play()/player.pause() según status.playing', () => {
        expect(src).toContain('player.pause()');
        expect(src).toContain('player.play()');
    });

    it('cleanup al desmontar: no hay una llamada manual liberando el sonido (useAudioPlayer lo hace automáticamente)', () => {
        // El componente viejo necesitaba `useEffect(() => () => sound.unloadAsync(), [sound])`.
        expect(src).not.toMatch(/\.unloadAsync\(\)/);
        expect(src).not.toContain("import React, { useState, useEffect }");
    });

    it('preserva el audio mode de reproducción (altavoz, ignora silencio) con nombres de campo de expo-audio', () => {
        expect(src).toContain('playsInSilentMode: true');
        expect(src).toContain('allowsRecording: false');
    });
});

describe('SDK57 hotfix: permisos de micrófono migrados en CallScreen y PingAIScreen', () => {
    it('CallScreen ya no importa Audio de expo-av', () => {
        const src = readSrc('src/screens/CallScreen.tsx');
        expect(src).not.toMatch(/from ['"]expo-av['"]/);
        expect(src).toContain('requestRecordingPermissionsAsync');
    });

    it('PingAIScreen ya no importa Audio de expo-av y usa el hook de expo-audio', () => {
        const src = readSrc('src/screens/PingAIScreen.tsx');
        expect(src).not.toMatch(/from ['"]expo-av['"]/);
        expect(src).toContain('useAudioRecorder(RecordingPresets.HIGH_QUALITY)');
        expect(src).toContain('requestRecordingPermissionsAsync');
    });
});
