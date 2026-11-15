// Audio tests with SYNTHETIC voices (made with a text-to-speech model), never
// real people. Two steps, both opt-in because they cost money:
//
// 1) Make the audio once (OpenAI text-to-speech, one voice per person):
//    MEETING_AUDIO_MAKE=1 MEETING_AUDIO_DIR=/ruta npx vitest run tests/meetingAudio.real.test.ts
// 2) Transcribe the same files with each provider, score them, and run the
//    full chain (transcript → analysis) when MEETING_AUDIO_ANALYZE is set:
//    MEETING_AUDIO_STT="openai:gpt-transcribe,google:gemini-3.5-flash-lite" \
//    MEETING_AUDIO_ANALYZE="google:gemini-3.5-flash-lite" MEETING_AUDIO_DIR=/ruta npx vitest run tests/meetingAudio.real.test.ts
import { describe, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MEETING_CASES, MEETING_NOW, MEETING_TIME_ZONE, MEETING_USER, longMeetingCases, type MeetingCase } from './fixtures/meetingBench';
import { keyTermsKept, scoreCase, speakerAccuracy, totals, wordErrorRate } from './support/meetingScorer';
import { GeminiTranscriber, mergeTrackTranscripts, transcriberFor, transcriptAsDialogue } from '../src/services/meetings/meetingTranscription';
import { analyzeMeeting } from '../src/services/meetings/meetingAnalysis';
import { parseLlmTarget } from '../src/services/meetings/meetingLlm';
import { llmCost, transcriptionCost } from '../src/services/meetings/meetingPrices';

const SHORT_AUDIO_CASES = ['m01', 'm03', 'm09', 'm10', 'm11', 'm12', 'm19', 'm26', 'm31', 'm38', 'm45', 'm49'];
// MEETING_AUDIO_CASES=all speaks every meeting (to join them into one long recording).
const AUDIO_CASES = process.env.MEETING_AUDIO_CASES === 'all' ? MEETING_CASES.map((c) => c.id) : SHORT_AUDIO_CASES;
const NOISY_CASES = process.env.MEETING_AUDIO_CASES === 'all' ? [] : ['m11', 'm38', 'm45'];
// Names, figures and dates each recording must keep.
const KEY_TERMS: Record<string, string[]> = {
    m01: ['Paula', 'miércoles', 'viernes'], m03: ['Jorge', 'Rivas', 'mañana'], m09: ['Rancagua', 'pasado mañana', 'fin de mes'],
    m10: ['presupuesto', 'mañana'], m11: ['4 de diciembre', 'Valentina', 'Rodrigo', 'Camila', 'catering', 'lunes 23'],
    m12: ['SII', 'boletas', 'viernes'], m19: ['450', 'viernes'], m26: ['Ana', 'Luis', 'factura', 'jueves'],
    m31: ['turnos', 'lunes'], m38: ['210', 'Hugo', 'jueves'], m45: ['5%', '1 de diciembre', 'Lorena', 'Bruno', 'miércoles 25'],
    m49: ['Joaquín', 'jueves', 'seminario'],
};
const FEMALE = new Set(['Paula', 'Lucía', 'Valentina', 'Camila', 'Daniela', 'Ana', 'Carolina', 'Lorena', 'Elisa', 'Paz']);
const FEMALE_VOICES = ['coral', 'nova', 'shimmer', 'sage'];
const MALE_VOICES = ['ash', 'echo', 'verse', 'ballad'];
const USER_VOICE = 'onyx'; // Carlos keeps one voice in every recording

const dir = process.env.MEETING_AUDIO_DIR || path.join(process.cwd(), '.meeting-audio');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';

/** "m07", or "L50" for the 50 meetings joined in one recording. */
function caseFor(caseId: string): MeetingCase {
    if (/^L\d+$/.test(caseId)) return longMeetingCases(Number(caseId.slice(1)))[0];
    return MEETING_CASES.find((c) => c.id === caseId)!;
}

function turns(caseId: string) {
    const testCase = caseFor(caseId);
    return testCase.transcript.split('\n').map((line) => {
        const at = line.indexOf(':');
        return { speaker: line.slice(0, at).trim(), text: line.slice(at + 1).trim() };
    });
}

/** Only the terms someone actually says (a name used just as the speaker tag is never heard). */
function spokenTerms(caseId: string): string[] {
    const spoken = turns(caseId).map((t) => t.text).join(' ');
    return (KEY_TERMS[caseId] || []).filter((term) => keyTermsKept([term], spoken).lost.length === 0);
}

function wavHeader(bytes: number, rate = 24_000): Buffer {
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVE', 8); h.write('fmt ', 12);
    h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
    h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(bytes, 40);
    return h;
}

describe.skipIf(process.env.MEETING_AUDIO_MAKE !== '1')('make synthetic meeting audio', () => {
    it('speaks each script with one voice per person', async () => {
        fs.mkdirSync(dir, { recursive: true });
        const apiKey = process.env.OPENAI_API_KEY!;
        let characters = 0;
        for (const id of AUDIO_CASES) {
            const out = path.join(dir, `${id}.m4a`);
            if (fs.existsSync(out)) continue;
            const voices = new Map<string, string>();
            let f = 0; let m = 0;
            const chunks: Buffer[] = [];
            const spoken: Array<{ speaker: string; offset: number; pcm: Buffer }> = [];
            let offset = 0;
            for (const turn of turns(id)) {
                if (!voices.has(turn.speaker)) voices.set(turn.speaker, turn.speaker === MEETING_USER ? USER_VOICE : FEMALE.has(turn.speaker) ? FEMALE_VOICES[f++ % 4] : MALE_VOICES[m++ % 4]);
                characters += turn.text.length;
                const response = await fetch('https://api.openai.com/v1/audio/speech', {
                    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini-tts', voice: voices.get(turn.speaker), input: turn.text, response_format: 'pcm',
                        instructions: 'Habla en español de Chile, con acento chileno natural, en una conversación de trabajo por teléfono. Ritmo normal, sin sonar a locutor.',
                    }),
                });
                if (!response.ok) throw new Error(`tts ${response.status}: ${(await response.text()).slice(0, 200)}`);
                const voice = Buffer.from(await response.arrayBuffer());
                spoken.push({ speaker: turn.speaker, offset, pcm: voice });
                const gap = Buffer.alloc(24_000 * 2 * 0.35);
                chunks.push(voice, gap);
                offset += voice.length + gap.length;
            }
            const pcm = Buffer.concat(chunks);
            // One file per person, silent while the others talk: what Agora's
            // "individual" recording mode (or each phone recording its own
            // microphone) would give.
            if (process.env.MEETING_AUDIO_TRACKS === '1') {
                const trackDir = path.join(dir, 'tracks', id);
                fs.mkdirSync(trackDir, { recursive: true });
                for (const person of new Set(spoken.map((x) => x.speaker))) {
                    const track = Buffer.alloc(pcm.length);
                    for (const x of spoken.filter((y) => y.speaker === person)) x.pcm.copy(track, x.offset);
                    const trackWav = path.join(trackDir, `${person}.wav`);
                    fs.writeFileSync(trackWav, Buffer.concat([wavHeader(track.length), track]));
                    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', trackWav, '-ac', '1', '-ar', '48000', '-c:a', 'aac', '-b:a', '48k', path.join(trackDir, `${person}.m4a`)]);
                    fs.unlinkSync(trackWav);
                }
            }
            const wav = path.join(dir, `${id}.wav`);
            fs.writeFileSync(wav, Buffer.concat([wavHeader(pcm.length), pcm]));
            // Same format Agora's cloud recording gives: AAC, mono, 48 kHz.
            execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '48000', '-c:a', 'aac', '-b:a', '48k', out]);
            if (NOISY_CASES.includes(id)) {
                execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', wav, '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.06:sample_rate=24000',
                    '-filter_complex', '[0][1]amix=inputs=2:duration=first:weights=1 1,highpass=f=300,lowpass=f=3400', '-ac', '1', '-ar', '48000', '-c:a', 'aac', '-b:a', '48k', path.join(dir, `${id}-ruido.m4a`)]);
            }
            fs.unlinkSync(wav);
            fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ synthetic: true, voices: Object.fromEntries(voices), turns: turns(id) }, null, 2));
        }
        console.log(JSON.stringify({ madeIn: dir, characters }));
    }, 1_800_000);
});

describe.skipIf(!process.env.MEETING_AUDIO_STT)('transcribe the synthetic audio with each provider', () => {
    it('measures errors, who-said-what, kept terms, speed and cost', async () => {
        const specs = process.env.MEETING_AUDIO_STT!.split(',').map((s) => s.trim()).filter(Boolean);
        const analyzeSpec = process.env.MEETING_AUDIO_ANALYZE?.trim();
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.m4a')).sort();
        for (const spec of specs) {
            const transcriber = transcriberFor(spec);
            const rows: any[] = [];
            for (const file of files) {
                const id = file.replace(/(-ruido)?\.m4a$/, '');
                const testCase = caseFor(id);
                const bytes = fs.readFileSync(path.join(dir, file));
                const seconds = Number(execFileSync(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(dir, file)]).toString().trim());
                try {
                    const result = await transcriber.transcribe({ bytes, mimeType: 'audio/mp4', fileName: file, languageHint: 'es', speakerHints: testCase.participants });
                    const ref = turns(id);
                    const wer = wordErrorRate(ref.map((t) => t.text).join(' '), result.text);
                    const row: any = {
                        file, seconds, latencyMs: result.latencyMs, wer: wer.wer,
                        speakers: speakerAccuracy(ref, result.segments), lost: keyTermsKept(spokenTerms(id), result.text).lost,
                        costUsd: result.usage?.inputTokens ? llmCost(spec, result.usage.inputTokens, result.usage.outputTokens || 0) : transcriptionCost(spec, seconds),
                        usage: result.usage, text: transcriptAsDialogue(result),
                    };
                    if (analyzeSpec) {
                        const run = await analyzeMeeting({ transcript: transcriptAsDialogue(result), userName: MEETING_USER, participants: testCase.participants, now: new Date(MEETING_NOW), timeZone: MEETING_TIME_ZONE, title: testCase.title }, [parseLlmTarget(analyzeSpec)]);
                        row.score = scoreCase(testCase, run.analysis);
                        row.analysisCostUsd = llmCost(analyzeSpec.split('@')[0], run.inputTokens, run.outputTokens);
                    }
                    rows.push(row);
                } catch (error: any) {
                    rows.push({ file, seconds, error: String(error?.message || error).slice(0, 300) });
                }
            }
            const ok = rows.filter((r) => !r.error);
            const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
            const totalSeconds = ok.reduce((a, r) => a + r.seconds, 0);
            const words = (r: any) => r.text.split(/\s+/).length;
            const summary: any = {
                provider: spec, files: rows.length, errors: rows.length - ok.length,
                werAvg: avg(ok.map((r) => r.wer)), werWeighted: ok.length ? ok.reduce((a, r) => a + r.wer * words(r), 0) / ok.reduce((a, r) => a + words(r), 0) : null,
                werClean: avg(ok.filter((r) => !r.file.includes('ruido')).map((r) => r.wer)), werNoisy: avg(ok.filter((r) => r.file.includes('ruido')).map((r) => r.wer)),
                speakerAccuracy: avg(ok.map((r) => r.speakers).filter((v) => v !== null)),
                termsLost: ok.flatMap((r) => r.lost.map((t: string) => `${r.file}:${t}`)),
                latencyMsPerAudioMinute: totalSeconds ? ok.reduce((a, r) => a + r.latencyMs, 0) / (totalSeconds / 60) : null,
                costPerAudioMinuteUsd: totalSeconds && ok[0]?.costUsd !== null ? ok.reduce((a, r) => a + (r.costUsd || 0), 0) / (totalSeconds / 60) : null,
            };
            if (analyzeSpec) summary.chain = { analysis: analyzeSpec, ...totals(ok.map((r) => r.score), [...MEETING_CASES, ...longMeetingCases(50)]) };
            fs.writeFileSync(path.join(dir, `stt-${spec.replace(/[^a-z0-9.-]+/gi, '_')}${analyzeSpec ? '+analisis' : ''}.json`), JSON.stringify({ summary, rows }, null, 2));
            console.log(JSON.stringify(summary));
        }
    }, 3_600_000);
});

describe.skipIf(!process.env.MEETING_AUDIO_TRACKS_STT)('one recording per person, transcribed and put back in order', () => {
    it('names each speaker from the track, not from guessing voices', async () => {
        const specs = process.env.MEETING_AUDIO_TRACKS_STT!.split(',').map((s) => s.trim()).filter(Boolean);
        const analyzeSpec = process.env.MEETING_AUDIO_ANALYZE?.trim() || 'openai:gpt-6-luna@low';
        const ids = fs.readdirSync(path.join(dir, 'tracks')).sort();
        for (const spec of specs) {
            // "google-joint:<model>": all tracks in one request to Gemini.
            const joint = spec.startsWith('google-joint:') ? new GeminiTranscriber(spec.slice('google-joint:'.length)) : null;
            const transcriber = joint || transcriberFor(spec);
            const rows: any[] = [];
            for (const id of ids) {
                const testCase = caseFor(id);
                const trackDir = path.join(dir, 'tracks', id);
                try {
                    const started = Date.now();
                    let seconds = 0;
                    const files = fs.readdirSync(trackDir).filter((f) => f.endsWith('.m4a'));
                    for (const file of files) seconds += Number(execFileSync(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(trackDir, file)]).toString().trim());
                    const merged = joint
                        ? await joint.transcribeTracks(files.map((file) => ({ speaker: file.replace(/\.m4a$/, ''), bytes: fs.readFileSync(path.join(trackDir, file)), mimeType: 'audio/mp4', fileName: file })))
                        : mergeTrackTranscripts(await Promise.all(files.map(async (file) => ({
                            speaker: file.replace(/\.m4a$/, ''),
                            transcript: await transcriber.transcribe({ bytes: fs.readFileSync(path.join(trackDir, file)), mimeType: 'audio/mp4', fileName: file, languageHint: 'es' }),
                        }))));
                    const ref = turns(id);
                    const run = await analyzeMeeting({ transcript: transcriptAsDialogue(merged), userName: MEETING_USER, participants: testCase.participants, now: new Date(MEETING_NOW), timeZone: MEETING_TIME_ZONE, title: testCase.title }, [parseLlmTarget(analyzeSpec)]);
                    rows.push({
                        id, billedSeconds: seconds, latencyMs: Date.now() - started,
                        wer: wordErrorRate(ref.map((t) => t.text).join(' '), merged.text).wer,
                        // Errors per person, which ignores the order the turns came back in.
                        werByPerson: (() => {
                            const people = [...new Set(ref.map((t) => t.speaker))];
                            const errs = people.map((who) => wordErrorRate(ref.filter((t) => t.speaker === who).map((t) => t.text).join(' '), merged.segments.filter((x) => x.speaker === who).map((x) => x.text).join(' ')));
                            return errs.reduce((a, e) => a + e.wer * e.words, 0) / Math.max(1, errs.reduce((a, e) => a + e.words, 0));
                        })(),
                        usage: merged.usage,
                        speakers: speakerAccuracy(ref, merged.segments),
                        costUsd: transcriptionCost(spec, seconds), text: transcriptAsDialogue(merged), score: scoreCase(testCase, run.analysis),
                    });
                } catch (error: any) {
                    rows.push({ id, error: String(error?.message || error).slice(0, 300) });
                }
            }
            const ok = rows.filter((r) => !r.error);
            const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
            const summary = {
                provider: spec, mode: 'una pista por persona', cases: rows.length, errors: rows.length - ok.length,
                werAvg: avg(ok.map((r) => r.wer)), werByPersonAvg: avg(ok.map((r) => r.werByPerson)), speakerAccuracy: avg(ok.map((r) => r.speakers).filter((v) => v !== null)),
                chain: { analysis: analyzeSpec, ...totals(ok.map((r) => r.score), MEETING_CASES) },
            };
            fs.writeFileSync(path.join(dir, `pistas-${spec.replace(/[^a-z0-9.-]+/gi, '_')}.json`), JSON.stringify({ summary, rows }, null, 2));
            console.log(JSON.stringify(summary));
        }
    }, 3_600_000);
});
