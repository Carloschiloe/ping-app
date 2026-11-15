import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { confirmAction, notify } from '../design/ConfirmDialog';
import type { MeetingBridgeMessage, MeetingPiece } from '../utils/callBridge';

// «Grabar y resumir» during a call.
//
// The person who taps it says yes; the other phone is asked over the call's
// Realtime channel and answers. Only when the server says everyone said yes
// does each phone start recording its own microphone (inside the call page).
// At the end each phone uploads its track and Vorian sends the summary to
// everyone's chat with Vorian.

export type MeetingState = 'off' | 'idle' | 'asking' | 'waiting' | 'recording' | 'saving';

type Channel = { on: (...args: any[]) => any; send: (message: any) => Promise<any> };

const UPLOAD_WAIT_MS = 45_000;
const ASK_SEEN_WAIT_MS = 10_000;

export function useMeetingRecording(options: {
    conversationId: string;
    remoteName: string;
    inject: (js: string) => void;
}) {
    const { conversationId, inject } = options;
    // Names are sometimes saved in lower case («alejandra»).
    const remoteName = options.remoteName.charAt(0).toUpperCase() + options.remoteName.slice(1);
    const [state, setState] = useState<MeetingState>('off');
    const stateRef = useRef<MeetingState>('off');
    const callIdRef = useRef<string | null>(null);
    const maxSecondsRef = useRef(5400);
    const channelRef = useRef<Channel | null>(null);
    const uploadDone = useRef<(() => void) | null>(null);
    const startedAtRef = useRef<string | null>(null);
    const askSeenRef = useRef(false);

    const set = useCallback((next: MeetingState) => { stateRef.current = next; setState(next); }, []);

    useEffect(() => {
        let alive = true;
        apiClient.get('/meetings/status').then((s: any) => {
            if (!alive) return;
            if (s?.enabled) { maxSecondsRef.current = Number(s.maxSeconds) || 5400; set('idle'); }
        }).catch(() => undefined);
        return () => { alive = false; };
    }, [set]);

    const broadcast = useCallback(async (event: string, payload: Record<string, unknown> = {}) => {
        try { await channelRef.current?.send({ type: 'broadcast', event, payload }); } catch { /* the other phone may be gone */ }
    }, []);

    const beginRecording = useCallback(async (callId: string) => {
        if (stateRef.current === 'recording' || stateRef.current === 'saving') return;
        try {
            const { uploadUrl, maxSeconds } = await apiClient.post(`/meetings/${callId}/upload-url`, {});
            callIdRef.current = callId;
            maxSecondsRef.current = Number(maxSeconds) || maxSecondsRef.current;
            inject(`window.startMeetingRecording && window.startMeetingRecording(${JSON.stringify(uploadUrl)}, ${maxSecondsRef.current}); true;`);
        } catch (error: any) {
            set('idle');
            void notify({ title: 'No se pudo empezar a grabar', message: error?.message || 'Inténtalo de nuevo.', icon: 'alert-circle-outline' });
        }
    }, [inject, set]);

    /** Listen on the call's channel; called before it subscribes. */
    const attach = useCallback((channel: Channel) => {
        channelRef.current = channel;
        channel
            .on('broadcast', { event: 'meeting-ask' }, ({ payload }: any) => {
                const callId = typeof payload?.callId === 'string' ? payload.callId : null;
                if (!callId || stateRef.current === 'off') return;
                // Tell the asking phone the question arrived, so it does not wait in silence.
                void broadcast('meeting-asked', { callId });
                callIdRef.current = callId;
                set('asking');
                const name = typeof payload?.name === 'string' && payload.name ? payload.name : remoteName;
                void confirmAction({
                    title: 'Grabar y resumir',
                    message: `${name} quiere grabar esta llamada para que Vorian les mande un resumen y los compromisos que acuerden. Cada teléfono graba solo su propio micrófono y el audio se borra después de resumir.`,
                    confirmLabel: 'Sí, acepto',
                    cancelLabel: 'No',
                    destructive: false,
                    icon: 'sparkles-outline',
                }).then(async (ok) => {
                    if (!ok) {
                        set('idle');
                        apiClient.post(`/meetings/${callId}/decline`, {}).catch(() => undefined);
                        void broadcast('meeting-declined');
                        return;
                    }
                    try {
                        const result = await apiClient.post(`/meetings/${callId}/consent`, {});
                        if (result?.allConsented) {
                            void broadcast('meeting-start', { callId });
                            await beginRecording(callId);
                        } else {
                            set('waiting');
                        }
                    } catch (error: any) {
                        set('idle');
                        void notify({ title: 'No se pudo guardar tu respuesta', message: error?.message || 'Inténtalo de nuevo.', icon: 'alert-circle-outline' });
                    }
                });
            })
            .on('broadcast', { event: 'meeting-asked' }, () => {
                askSeenRef.current = true;
            })
            .on('broadcast', { event: 'meeting-start' }, ({ payload }: any) => {
                const callId = typeof payload?.callId === 'string' ? payload.callId : callIdRef.current;
                if (callId && stateRef.current === 'waiting') void beginRecording(callId);
            })
            .on('broadcast', { event: 'meeting-declined' }, () => {
                if (stateRef.current !== 'waiting') return;
                set('idle');
                void notify({ title: 'No se grabará', message: `${remoteName} prefirió no grabar esta llamada.`, icon: 'alert-circle-outline' });
            })
            .on('broadcast', { event: 'meeting-stop' }, () => {
                if (stateRef.current === 'recording') inject('window.finishMeetingRecording && window.finishMeetingRecording(); true;');
            });
    }, [beginRecording, broadcast, inject, remoteName, set]);

    /** The button: ask to record, or stop recording. */
    const press = useCallback(() => {
        const current = stateRef.current;
        if (current === 'recording') {
            void confirmAction({
                title: 'Terminar la grabación',
                message: 'Vorian les mandará el resumen apenas lo tenga.',
                confirmLabel: 'Terminar',
                cancelLabel: 'Seguir grabando',
                destructive: false,
                icon: 'stop-circle-outline',
            }).then((ok) => {
                if (!ok) return;
                void broadcast('meeting-stop');
                inject('window.finishMeetingRecording && window.finishMeetingRecording(); true;');
            });
            return;
        }
        if (current !== 'idle') return;
        void confirmAction({
            title: 'Grabar y resumir',
            message: `Le pediremos permiso a ${remoteName}. Si acepta, cada teléfono graba solo su propio micrófono; al colgar, Vorian les manda un resumen y te ofrece anotar tus compromisos. El audio se borra después de resumir.`,
            confirmLabel: 'Pedir permiso',
            destructive: false,
            icon: 'sparkles-outline',
        }).then(async (ok) => {
            if (!ok) return;
            try {
                set('waiting');
                const result = await apiClient.post('/meetings/request', { conversationId });
                callIdRef.current = result.callId;
                if (result.allConsented) {
                    await beginRecording(result.callId);
                } else {
                    askSeenRef.current = false;
                    await broadcast('meeting-ask', { callId: result.callId });
                    // The other phone says at once that it saw the question; if it
                    // does not, it never will (an older app, or it lost the line).
                    setTimeout(() => {
                        if (stateRef.current !== 'waiting' || askSeenRef.current) return;
                        set('idle');
                        apiClient.post(`/meetings/${result.callId}/decline`, {}).catch(() => undefined);
                        void notify({
                            title: 'No le llegó el aviso',
                            message: `El teléfono de ${remoteName} no recibió el pedido de grabar. Puede que tenga una versión antigua de Vorian: tiene que instalar la versión nueva.`,
                            icon: 'alert-circle-outline',
                        });
                    }, ASK_SEEN_WAIT_MS);
                    setTimeout(() => {
                        if (stateRef.current !== 'waiting') return;
                        set('idle');
                        void notify({ title: 'Sin respuesta', message: `${remoteName} no respondió. Puede que su app todavía no tenga esta función.`, icon: 'alert-circle-outline' });
                    }, 60_000);
                }
            } catch (error: any) {
                set('idle');
                void notify({ title: 'No se pudo pedir la grabación', message: error?.message || 'Inténtalo de nuevo.', icon: 'alert-circle-outline' });
            }
        });
    }, [beginRecording, broadcast, conversationId, inject, remoteName, set]);

    const reportUploaded = useCallback((startedAt?: string, seconds?: number, pieces?: MeetingPiece[] | null) => {
        const callId = callIdRef.current;
        if (!callId) return;
        apiClient.post(`/meetings/${callId}/uploaded`, {
            startedAt: startedAt || startedAtRef.current || new Date().toISOString(),
            seconds: Math.max(0, Math.round(seconds || 0)),
            pieces: pieces ?? null,
        }).catch(() => undefined);
    }, []);

    /** Messages from the call page about the recording. */
    const onBridgeMessage = useCallback((message: MeetingBridgeMessage) => {
        if (message.state === 'recording') {
            startedAtRef.current = message.startedAt || new Date().toISOString();
            set('recording');
        } else if (message.state === 'uploading') {
            set('saving');
        } else if (message.state === 'uploaded') {
            reportUploaded(message.startedAt, message.seconds, message.pieces);
            set('idle');
            uploadDone.current?.();
        } else if (message.state === 'upload-failed') {
            set('idle');
            uploadDone.current?.();
            void notify({ title: 'No se pudo guardar la grabación', message: 'Esta vez no habrá resumen de la llamada.', icon: 'alert-circle-outline' });
        } else if (message.state === 'unavailable') {
            set('idle');
            const callId = callIdRef.current;
            if (callId) apiClient.post(`/meetings/${callId}/decline`, {}).catch(() => undefined);
            void notify({ title: 'No se pudo grabar', message: 'Este teléfono no permite grabar dentro de la llamada.', icon: 'alert-circle-outline' });
        } else if (message.state === 'cancelled') {
            set('idle');
        }
    }, [reportUploaded, set]);

    /** Before leaving the call: upload what this phone recorded (waits a little). */
    const finishBeforeLeaving = useCallback(async () => {
        if (stateRef.current !== 'recording' && stateRef.current !== 'saving') return;
        await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, UPLOAD_WAIT_MS);
            uploadDone.current = () => { clearTimeout(timer); uploadDone.current = null; resolve(); };
            if (stateRef.current === 'recording') inject('window.finishMeetingRecording && window.finishMeetingRecording(); true;');
        });
    }, [inject]);

    return { state, attach, press, onBridgeMessage, finishBeforeLeaving };
}
