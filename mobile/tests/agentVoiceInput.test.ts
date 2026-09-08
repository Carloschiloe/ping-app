// M-5 — useAgentVoiceInput/voiceSession.ts: cancel/background/unmount
// cleanup contracts (sección 8 del ticket: "no zombie microphone, no orphan
// temporary file, no accidental second transcription request"). El hook en
// sí NUNCA se renderiza (mobile/vitest.config.ts: sólo lógica pura, sin
// jest-expo/renderer nativo — mismo principio ya establecido en
// tests/expoAudioMigration.test.ts) — la máquina de estados de
// voiceSession.ts SÍ es pura y se certifica comportamentalmente; el resto
// del hook se audita por inspección de código (mismo patrón).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mapMicrophonePermission, transitionVoiceSession, voiceStatusCopy } from '../src/utils/voiceSession';

function readSrc(relPath: string): string {
    return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8');
}

describe('voiceSession.ts — máquina de estados (pura, comportamental)', () => {
    it('idle -> listening -> capturing -> transcribing -> interpreting -> responding -> ended', () => {
        let state = transitionVoiceSession('idle', 'START_PERMISSION_CHECK');
        state = transitionVoiceSession(state, 'CAPTURE_STARTED');
        state = transitionVoiceSession(state, 'CAPTURE_STOPPED');
        state = transitionVoiceSession(state, 'TRANSCRIPT_READY');
        state = transitionVoiceSession(state, 'AGENT_SUBMITTED');
        state = transitionVoiceSession(state, 'AGENT_FINISHED');
        expect(state).toBe('ended');
    });

    it('CANCEL es válido desde listening y desde capturing (contrato H/I: cancelar/backgrounding en cualquier punto de la grabación)', () => {
        expect(transitionVoiceSession('listening', 'CANCEL')).toBe('cancelled');
        expect(transitionVoiceSession('capturing', 'CANCEL')).toBe('cancelled');
        expect(transitionVoiceSession('transcribing', 'CANCEL')).toBe('cancelled');
    });

    it('una transición inválida nunca se aplica en silencio -- lanza (nunca deja el estado en un valor inconsistente)', () => {
        expect(() => transitionVoiceSession('ended', 'CAPTURE_STOPPED')).toThrow();
        expect(() => transitionVoiceSession('idle', 'TRANSCRIPT_READY')).toThrow();
    });

    it('mapMicrophonePermission: bloqueado sólo cuando ya no se puede volver a pedir', () => {
        expect(mapMicrophonePermission({ granted: true, canAskAgain: false })).toBe('granted');
        expect(mapMicrophonePermission({ granted: false, canAskAgain: true })).toBe('denied');
        expect(mapMicrophonePermission({ granted: false, canAskAgain: false })).toBe('blocked');
        expect(mapMicrophonePermission({ status: 'restricted', granted: false, canAskAgain: false })).toBe('restricted');
        expect(mapMicrophonePermission({ status: 'undetermined', granted: false, canAskAgain: true })).toBe('unknown');
    });

    it('voiceStatusCopy nunca expone un estado sin copy para los estados activos (listening/capturing/transcribing)', () => {
        expect(voiceStatusCopy('listening')).toBeTruthy();
        expect(voiceStatusCopy('capturing')).toBeTruthy();
        expect(voiceStatusCopy('transcribing')).toBeTruthy();
        expect(voiceStatusCopy('idle')).toBeNull();
    });
});

describe('useAgentVoiceInput.ts — auditoría de código (sección 8: cleanup en cancel/background/unmount)', () => {
    const src = readSrc('src/hooks/useAgentVoiceInput.ts');

    it('CONTRATO I: escucha AppState y cancela la captura si la app deja de estar activa mientras graba', () => {
        expect(src).toContain("AppState.addEventListener('change'");
        expect(src).toMatch(/next !== 'active'[\s\S]{0,200}void cancel\(\)/);
    });

    it('CONTRATO H: cancel() aborta cualquier request de transcripción en vuelo antes de limpiar', () => {
        expect(src).toContain('requestAbortRef.current?.abort()');
    });

    it('cancel() y el cleanup de unmount detienen el recorder y borran la captura local (nunca un archivo huérfano)', () => {
        expect(src).toContain('await recorder.stop()');
        expect(src).toContain('deleteLocalCapture(');
        expect(src).toMatch(/file\.exists\)\s*file\.delete\(\)/);
    });

    it('unmount limpia el listener de AppState y desactiva el modo de grabación (nunca deja el micrófono "armado")', () => {
        expect(src).toMatch(/mountedRef\.current = false;[\s\S]{0,200}subscription\.remove\(\)/);
        expect(src).toContain('setAudioModeAsync({ allowsRecording: false');
    });

    it('nunca inicia una captura sin comprobar permisos primero (start() siempre chequea antes de grabar)', () => {
        expect(src).toContain('getRecordingPermissionsAsync');
        expect(src).toContain('requestRecordingPermissionsAsync');
        expect(src).toMatch(/if \(!response\.granted\)[\s\S]{0,300}return;/);
    });
});
