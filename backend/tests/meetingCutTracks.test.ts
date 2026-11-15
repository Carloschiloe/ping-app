import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { callTimeMs, clockMs, interleaveTracks, parseTrackPhrases, trackLabelMatches } from '../src/services/meetings/meetingTranscription';
import { renderCallPage } from '../src/controllers/agora.controller';

describe('tracks without their silences', () => {
    it('reads the times Google writes', () => {
        expect(clockMs('00:05.3')).toBe(5300);
        expect(clockMs('1:02:03')).toBe(3_723_000);
        expect(clockMs(4.25)).toBe(4250);
        expect(clockMs('')).toBeNull();
        expect(clockMs('ayer')).toBeNull();
    });

    it('puts a moment of the cut file back in the call', () => {
        const pieces = [{ at: 1, from: 0, len: 2 }, { at: 10, from: 2, len: 3 }];
        expect(callTimeMs(pieces, 500)).toBe(1500); // first piece
        expect(callTimeMs(pieces, 2500)).toBe(10_500); // second piece
        expect(callTimeMs(pieces, 2500, 4)).toBe(14_500); // the phone started 4 s later
        expect(callTimeMs(undefined, 2500, 4)).toBe(6500); // nothing was cut
    });

    it('interleaves both people in the order they spoke', () => {
        const segments = interleaveTracks([
            { speaker: 'Carlos', pieces: [{ at: 0, from: 0, len: 2 }, { at: 9, from: 2, len: 2 }], segments: [
                { speaker: 'Carlos', text: 'Hola Paula.', startMs: 0, endMs: null },
                { speaker: 'Carlos', text: 'Yo reviso el contrato.', startMs: 2100, endMs: null },
            ] },
            { speaker: 'Paula', pieces: [{ at: 3, from: 0, len: 5 }], segments: [
                { speaker: 'Paula', text: 'Hola, te mando la cotización el miércoles.', startMs: 0, endMs: null },
            ] },
        ]);
        expect(segments.map((s) => `${s.speaker}: ${s.text}`)).toEqual([
            'Carlos: Hola Paula.',
            'Paula: Hola, te mando la cotización el miércoles.',
            'Carlos: Yo reviso el contrato.',
        ]);
    });

    it('reads the short answer and the long one, naming each phrase after its track', () => {
        expect(parseTrackPhrases('[[1,0.0,"Hola"],[2,1.5,"Buenas"],[3,0,"nadie"]]', ['Carlos', 'Paula']))
            .toEqual([
                { speaker: 'Carlos', text: 'Hola', startMs: 0, endMs: null },
                { speaker: 'Paula', text: 'Buenas', startMs: 1500, endMs: null },
            ]);
        expect(parseTrackPhrases('{"segments":[{"speaker":"Pista de Paula","start":"00:02.5","text":"Ya"}]}', ['Carlos', 'Paula']))
            .toEqual([{ speaker: 'Paula', text: 'Ya', startMs: 2500, endMs: null }]);
        expect(parseTrackPhrases('no es json', ['Carlos'])).toEqual([]);
    });

    it('recognises the track name however it is written', () => {
        const all = ['Carlos Soto', 'Lucía'];
        expect(trackLabelMatches('Pista de Carlos Soto', 'Carlos Soto', all)).toBe(true);
        expect(trackLabelMatches('carlos', 'Carlos Soto', all)).toBe(true);
        expect(trackLabelMatches('LUCIA', 'Lucía', all)).toBe(true);
        expect(trackLabelMatches('Lucía', 'Carlos Soto', all)).toBe(false);
        expect(trackLabelMatches('', 'Lucía', all)).toBe(false);
    });
});

describe('the call page records only while its person speaks', () => {
    it('pauses in the silences and notes where each kept piece sits', async () => {
        let html = '';
        const res: any = { setHeader() {}, type() { return res; }, status() { return res; }, send(h: string) { html = h; } };
        renderCallPage({ query: { token: 't', appId: 'a', channel: 'c' } } as any, res);
        const script = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

        // A fake phone: a clock we move by hand, a microphone whose loudness we set,
        // and a recorder that only notes when it is paused.
        let now = 0;
        let loudness = 0.001;
        const timers: Array<{ fn: () => void; every: number; next: number; id: number }> = [];
        const messages: any[] = [];
        const recorderStates: string[] = [];
        class FakeRecorder {
            state = 'inactive';
            ondataavailable: any; onstop: any;
            static isTypeSupported() { return true; }
            start() { this.state = 'recording'; recorderStates.push('start'); }
            pause() { this.state = 'paused'; recorderStates.push(`pause@${now}`); }
            resume() { this.state = 'recording'; recorderStates.push(`resume@${now}`); }
            stop() { this.state = 'inactive'; this.ondataavailable?.({ data: { size: 10 } }); this.onstop?.(); }
        }
        class FakeAudioContext {
            state = 'running';
            createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: (d: Float32Array) => d.fill(loudness) }; }
            createMediaStreamSource() { return { connect() {} }; }
            resume() { return Promise.resolve(); }
            close() {}
        }
        const context: any = {
            AgoraRTC: { createClient: () => ({ on() {}, join: async () => {}, publish: async () => {}, leave: async () => {} }), createMicrophoneAudioTrack: async () => ({ getMediaStreamTrack: () => ({}), close() {}, setMuted() {} }) },
            document: { getElementById: () => ({ style: {}, textContent: '' }) },
            MediaRecorder: FakeRecorder, MediaStream: class {}, AudioContext: FakeAudioContext,
            Blob: class { constructor(public parts: any[]) {} },
            fetch: async () => ({ ok: true }),
            performance: { now: () => now },
            Date: class extends Date { constructor(...args: any[]) { super(...(args.length ? args : [1_700_000_000_000 + now])); } static now() { return 1_700_000_000_000 + now; } },
            setInterval: (fn: () => void, every: number) => { const id = timers.length + 1; timers.push({ fn, every, next: now + every, id }); return id; },
            clearInterval: (id: number) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
            setTimeout: () => 0, clearTimeout: () => {},
            console,
            Math, JSON, Object, Array, Number, Float32Array, Promise,
        };
        context.window = context;
        context.ReactNativeWebView = { postMessage: (m: string) => messages.push(JSON.parse(m)) };
        vm.createContext(context);
        vm.runInContext(script, context);
        await new Promise((r) => setImmediate(r)); // the call joins and the microphone opens

        const advance = (ms: number) => {
            const end = now + ms;
            while (true) {
                const due = timers.filter((t) => t.next <= end).sort((a, b) => a.next - b.next)[0];
                if (!due) break;
                now = due.next; due.next += due.every; due.fn();
            }
            now = end;
        };

        expect(context.startMeetingRecording('https://upload', 600)).toBe(true);
        loudness = 0.2; advance(2000); // speaks 2 s
        loudness = 0.001; advance(5000); // the other person talks for 5 s
        loudness = 0.2; advance(1000); // speaks again 1 s
        loudness = 0.001; advance(3000);
        await context.finishMeetingRecording();

        const uploaded = messages.find((m) => m.state === 'uploaded');
        expect(uploaded.pieces).toHaveLength(2);
        const [first, second] = uploaded.pieces;
        expect(first.at).toBe(0);
        expect(first.from).toBe(0);
        expect(first.len).toBeGreaterThan(2.5); // 2 s of voice plus the short wait before pausing
        expect(first.len).toBeLessThan(3.2);
        expect(second.at).toBeGreaterThan(6.9);
        expect(second.at).toBeLessThan(7.2);
        expect(second.from).toBeCloseTo(first.len, 3);
        expect(recorderStates.filter((s) => s.startsWith('pause'))).toHaveLength(2);
        expect(recorderStates.filter((s) => s.startsWith('resume'))).toHaveLength(1);
    });
});
