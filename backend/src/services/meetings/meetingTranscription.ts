// Turns a meeting recording into text with who said what. One small adapter
// per company; all return the same MeetingTranscript, so the rest of Vorian
// never knows which one was used. Keys come only from the environment.
import { MeetingProviderError, MeetingTranscriber, MeetingTranscript, TranscriptSegment } from './meetingTypes';

type Audio = Parameters<MeetingTranscriber['transcribe']>[0];

const key = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw new MeetingProviderError('provider_not_configured', false, `Missing ${name}`);
    return value;
};

async function failFrom(response: Response, provider: string): Promise<never> {
    const body = (await response.text().catch(() => '')).slice(0, 300);
    const s = response.status;
    const retryable = s === 408 || s === 409 || s === 429 || s >= 500;
    throw new MeetingProviderError(s === 429 ? 'provider_rate_limited' : s === 402 ? 'provider_no_credit' : retryable ? 'provider_unavailable' : 'provider_rejected', retryable, `${provider} ${s}: ${body}`);
}

const joinText = (segments: TranscriptSegment[]) => segments.map((s) => s.text.trim()).filter(Boolean).join(' ');

/** Words with a speaker each → one segment per change of speaker. */
function groupWords(items: Array<{ speaker: string | null; text: string; start: number | null; end: number | null }>): TranscriptSegment[] {
    const out: TranscriptSegment[] = [];
    for (const w of items) {
        const last = out[out.length - 1];
        if (last && last.speaker === w.speaker) {
            last.text += w.text;
            last.endMs = w.end;
        } else out.push({ speaker: w.speaker, text: w.text, startMs: w.start, endMs: w.end });
    }
    return out.map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ').trim() }));
}

const ms = (seconds: unknown) => (typeof seconds === 'number' ? Math.round(seconds * 1000) : null);

// ---------- OpenAI and companies with the same audio door (Groq, Mistral) ----------

export class OpenAiStyleTranscriber implements MeetingTranscriber {
    readonly id: string;
    readonly diarizes: boolean;
    constructor(private readonly provider: 'openai' | 'groq' | 'mistral', private readonly model: string) {
        this.id = `${provider}:${model}`;
        this.diarizes = model.includes('diarize');
    }

    async transcribe(audio: Audio): Promise<MeetingTranscript> {
        const base = { openai: 'https://api.openai.com/v1', groq: 'https://api.groq.com/openai/v1', mistral: 'https://api.mistral.ai/v1' }[this.provider];
        const apiKey = key({ openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', mistral: 'MISTRAL_API_KEY' }[this.provider]);
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(audio.bytes)], { type: audio.mimeType }), audio.fileName);
        form.append('model', this.model);
        if (audio.languageHint) form.append('language', audio.languageHint);
        if (this.diarizes) {
            form.append('response_format', 'diarized_json');
            form.append('chunking_strategy', 'auto');
        } else if (this.model === 'whisper-1' || this.provider === 'groq') {
            form.append('response_format', 'verbose_json');
        } else {
            form.append('response_format', 'json');
        }
        if (!this.diarizes && audio.speakerHints?.length) form.append('prompt', `Participantes: ${audio.speakerHints.join(', ')}.`);
        const started = Date.now();
        const response = await fetch(`${base}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form });
        if (!response.ok) await failFrom(response, this.provider);
        const data: any = await response.json();
        const segments: TranscriptSegment[] = (data.segments || []).map((s: any) => ({
            speaker: s.speaker ?? null, text: String(s.text || ''), startMs: ms(s.start), endMs: ms(s.end),
        }));
        const text = String(data.text || joinText(segments)).trim();
        if (!text) throw new MeetingProviderError('empty_transcript', false);
        return {
            text, segments: segments.length ? segments : [{ speaker: null, text, startMs: null, endMs: null }],
            language: data.language ?? null, durationSec: typeof data.duration === 'number' ? data.duration : null,
            provider: this.provider, model: this.model, latencyMs: Date.now() - started,
            usage: data.usage ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens, audioSeconds: data.usage.seconds } : null,
        };
    }
}

// ---------- Google Gemini (audio sent to the model, asked for who said what) ----------

export class GeminiTranscriber implements MeetingTranscriber {
    readonly id: string;
    readonly diarizes = true;
    constructor(private readonly model: string) { this.id = `google:${model}`; }

    /**
     * Every person's own track in one request: the model hears them in sync
     * and writes the conversation in order, with the name taken from the
     * track, so nobody has to guess voices.
     */
    async transcribeTracks(tracks: Array<{ speaker: string; bytes: Buffer; mimeType: string; fileName: string }>): Promise<MeetingTranscript> {
        const apiKey = key('GEMINI_API_KEY');
        const names = tracks.map((t) => t.speaker).join(', ');
        const parts: any[] = [];
        for (const t of tracks) {
            parts.push({ text: `Pista de ${t.speaker}:` });
            parts.push({ inline_data: { mime_type: t.mimeType, data: t.bytes.toString('base64') } });
        }
        parts.push({ text: `Estas ${tracks.length} pistas son la misma llamada, sincronizadas desde el segundo 0. Cada pista es el micrófono de una persona (${names}); en su pista solo se oye a esa persona. Transcribe la conversación completa en español, palabra por palabra, en el orden en que se habló, intercalando a las personas según el momento en que hablan. El hablante de cada turno es el nombre de la pista donde se oye. Devuelve solo JSON: {"segments":[{"speaker":"...","start":"mm:ss","text":"..."}]}` });
        const body = { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 65_536 } };
        const started = Date.now();
        let segments: TranscriptSegment[] = [];
        let data: any = null;
        for (let attempt = 0; attempt < 2 && !segments.length; attempt += 1) {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body),
            });
            if (!response.ok) await failFrom(response, 'google');
            data = await response.json();
            segments = parseGeminiSegments((data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join(''));
        }
        const text = joinText(segments);
        if (!text) throw new MeetingProviderError('empty_transcript', true);
        const usage = data.usageMetadata || {};
        return {
            text, segments, language: 'es', durationSec: null, provider: 'google', model: this.model, latencyMs: Date.now() - started,
            usage: { inputTokens: usage.promptTokenCount, outputTokens: usage.candidatesTokenCount },
        };
    }

    async transcribe(audio: Audio): Promise<MeetingTranscript> {
        const apiKey = key('GEMINI_API_KEY');
        const names = audio.speakerHints?.length ? ` Los participantes son: ${audio.speakerHints.join(', ')}. Usa sus nombres si queda claro quién habla; si no, "Hablante 1", "Hablante 2".` : ' Etiqueta a cada voz como "Hablante 1", "Hablante 2".';
        const prompt = `Transcribe esta reunión en español, palabra por palabra, sin resumir ni corregir lo que dicen. Separa por turnos de habla.${names} Devuelve solo JSON: {"segments":[{"speaker":"...","text":"..."}]}`;
        const started = Date.now();
        // Google takes at most 20 MB inside the request (about 40 minutes of
        // call audio once encoded); longer recordings go up as a file first.
        const uploaded = audio.bytes.length > GEMINI_INLINE_LIMIT_BYTES ? await uploadGeminiFile(apiKey, audio) : null;
        const media = uploaded
            ? { file_data: { mime_type: audio.mimeType, file_uri: uploaded.uri } }
            : { inline_data: { mime_type: audio.mimeType, data: audio.bytes.toString('base64') } };
        const body = {
            contents: [{ role: 'user', parts: [media, { text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 65_536 },
        };
        try {
        // The model sometimes answers in another JSON shape or not at all:
        // read the usual shapes, and ask once more before giving up.
        let segments: TranscriptSegment[] = [];
        let data: any = null;
        let problem = '';
        for (let attempt = 0; attempt < 2 && !segments.length; attempt += 1) {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body),
            });
            if (!response.ok) await failFrom(response, 'google');
            data = await response.json();
            const raw = (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
            problem = `finish=${data.candidates?.[0]?.finishReason ?? 'none'} block=${data.promptFeedback?.blockReason ?? 'none'} chars=${raw.length}`;
            segments = parseGeminiSegments(raw);
        }
        const text = joinText(segments);
        if (!text) throw new MeetingProviderError('empty_transcript', true, problem);
        const usage = data.usageMetadata || {};
        return {
            text, segments, language: 'es', durationSec: null, provider: 'google', model: this.model, latencyMs: Date.now() - started,
            usage: { inputTokens: usage.promptTokenCount, outputTokens: usage.candidatesTokenCount },
        };
        } finally {
            if (uploaded) await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploaded.name}`, { method: 'DELETE', headers: { 'x-goog-api-key': apiKey } }).catch(() => undefined);
        }
    }
}

export const GEMINI_INLINE_LIMIT_BYTES = Number(process.env.MEETING_GEMINI_INLINE_LIMIT_BYTES || 14 * 1024 * 1024);

/** Google's file upload: start, send the bytes, wait until the file is ready. */
async function uploadGeminiFile(apiKey: string, audio: Audio): Promise<{ uri: string; name: string }> {
    const start = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
        method: 'POST',
        headers: {
            'x-goog-api-key': apiKey, 'Content-Type': 'application/json',
            'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': String(audio.bytes.length), 'X-Goog-Upload-Header-Content-Type': audio.mimeType,
        },
        body: JSON.stringify({ file: { display_name: audio.fileName } }),
    });
    if (!start.ok) await failFrom(start, 'google');
    const uploadUrl = start.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new MeetingProviderError('provider_unavailable', true, 'google upload: no url');
    const sent = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Length': String(audio.bytes.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
        body: new Uint8Array(audio.bytes),
    });
    if (!sent.ok) await failFrom(sent, 'google');
    let file: any = (await sent.json() as any).file;
    for (let i = 0; file?.state === 'PROCESSING' && i < 60; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        const poll = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, { headers: { 'x-goog-api-key': apiKey } });
        if (!poll.ok) await failFrom(poll, 'google');
        file = await poll.json();
    }
    if (!file?.uri || file.state === 'FAILED') throw new MeetingProviderError('provider_unavailable', true, `google upload: ${file?.state}`);
    return { uri: file.uri, name: file.name };
}

export function parseGeminiSegments(raw: string): TranscriptSegment[] {
    let parsed: any;
    try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')); } catch { return []; }
    const list = Array.isArray(parsed) ? parsed : parsed?.segments || parsed?.turns || parsed?.transcript || parsed?.transcription || [];
    if (typeof list === 'string') return [{ speaker: null, text: list, startMs: null, endMs: null }];
    if (!Array.isArray(list)) return [];
    return list.map((s: any) => ({
        speaker: s?.speaker ?? s?.hablante ?? null, text: String(s?.text ?? s?.texto ?? ''), startMs: null, endMs: null,
    })).filter((s: TranscriptSegment) => s.text.trim());
}

// ---------- Deepgram ----------

export class DeepgramTranscriber implements MeetingTranscriber {
    readonly id: string;
    readonly diarizes = true;
    constructor(private readonly model = 'nova-3') { this.id = `deepgram:${model}`; }

    async transcribe(audio: Audio): Promise<MeetingTranscript> {
        const params = new URLSearchParams({ model: this.model, language: audio.languageHint || 'es', diarize: 'true', punctuate: 'true', smart_format: 'true', utterances: 'true' });
        const started = Date.now();
        const response = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
            method: 'POST', headers: { Authorization: `Token ${key('DEEPGRAM_API_KEY')}`, 'Content-Type': audio.mimeType }, body: new Uint8Array(audio.bytes),
        });
        if (!response.ok) await failFrom(response, 'deepgram');
        const data: any = await response.json();
        const segments: TranscriptSegment[] = (data.results?.utterances || []).map((u: any) => ({
            speaker: u.speaker === undefined ? null : `speaker_${u.speaker}`, text: u.transcript, startMs: ms(u.start), endMs: ms(u.end),
        }));
        const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || joinText(segments);
        if (!text) throw new MeetingProviderError('empty_transcript', false);
        return {
            text, segments, language: audio.languageHint || 'es', durationSec: data.metadata?.duration ?? null,
            provider: 'deepgram', model: this.model, latencyMs: Date.now() - started, usage: { audioSeconds: data.metadata?.duration },
        };
    }
}

// ---------- AssemblyAI ----------

export class AssemblyAiTranscriber implements MeetingTranscriber {
    readonly id: string;
    readonly diarizes = true;
    constructor(private readonly model = 'universal', private readonly pollMs = 2_000, private readonly maxWaitMs = 600_000) { this.id = `assemblyai:${model}`; }

    async transcribe(audio: Audio): Promise<MeetingTranscript> {
        const headers = { Authorization: key('ASSEMBLYAI_API_KEY') };
        const started = Date.now();
        const upload = await fetch('https://api.assemblyai.com/v2/upload', { method: 'POST', headers, body: new Uint8Array(audio.bytes) });
        if (!upload.ok) await failFrom(upload, 'assemblyai');
        const { upload_url } = await upload.json() as any;
        const create = await fetch('https://api.assemblyai.com/v2/transcript', {
            method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_url: upload_url, language_code: audio.languageHint || 'es', speaker_labels: true, speech_model: this.model }),
        });
        if (!create.ok) await failFrom(create, 'assemblyai');
        const { id } = await create.json() as any;
        for (;;) {
            if (Date.now() - started > this.maxWaitMs) throw new MeetingProviderError('provider_timeout', true);
            await new Promise((resolve) => setTimeout(resolve, this.pollMs));
            const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, { headers });
            if (!poll.ok) await failFrom(poll, 'assemblyai');
            const data: any = await poll.json();
            if (data.status === 'error') throw new MeetingProviderError('provider_rejected', false, String(data.error).slice(0, 300));
            if (data.status !== 'completed') continue;
            const segments: TranscriptSegment[] = (data.utterances || []).map((u: any) => ({ speaker: u.speaker ?? null, text: u.text, startMs: u.start ?? null, endMs: u.end ?? null }));
            return {
                text: data.text || joinText(segments), segments, language: data.language_code ?? null, durationSec: data.audio_duration ?? null,
                provider: 'assemblyai', model: this.model, latencyMs: Date.now() - started, usage: { audioSeconds: data.audio_duration },
            };
        }
    }
}

// ---------- ElevenLabs ----------

export class ElevenLabsTranscriber implements MeetingTranscriber {
    readonly id: string;
    readonly diarizes = true;
    constructor(private readonly model = 'scribe_v2') { this.id = `elevenlabs:${model}`; }

    async transcribe(audio: Audio): Promise<MeetingTranscript> {
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(audio.bytes)], { type: audio.mimeType }), audio.fileName);
        form.append('model_id', this.model);
        form.append('language_code', 'spa');
        form.append('diarize', 'true');
        const started = Date.now();
        const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key('ELEVENLABS_API_KEY') }, body: form });
        if (!response.ok) await failFrom(response, 'elevenlabs');
        const data: any = await response.json();
        const segments = groupWords((data.words || []).filter((w: any) => w.type !== 'audio_event').map((w: any) => ({
            speaker: w.speaker_id ?? null, text: w.text, start: ms(w.start), end: ms(w.end),
        })));
        const text = String(data.text || joinText(segments)).trim();
        if (!text) throw new MeetingProviderError('empty_transcript', false);
        return { text, segments, language: data.language_code ?? null, durationSec: null, provider: 'elevenlabs', model: this.model, latencyMs: Date.now() - started, usage: null };
    }
}

/** "openai:gpt-transcribe", "groq:whisper-large-v3-turbo", "deepgram:nova-3"... */
export function transcriberFor(spec: string): MeetingTranscriber {
    const [provider, model] = [spec.slice(0, spec.indexOf(':')), spec.slice(spec.indexOf(':') + 1)];
    switch (provider) {
        case 'openai': case 'groq': case 'mistral': return new OpenAiStyleTranscriber(provider, model);
        case 'google': return new GeminiTranscriber(model);
        case 'deepgram': return new DeepgramTranscriber(model);
        case 'assemblyai': return new AssemblyAiTranscriber(model);
        case 'elevenlabs': return new ElevenLabsTranscriber(model);
        default: throw new MeetingProviderError('unknown_provider', false, spec);
    }
}

/** Tries each transcriber in order; moves on only when the failure is the provider's, not the audio's. */
export async function transcribeWithFallback(audio: Audio, transcribers: MeetingTranscriber[]): Promise<MeetingTranscript & { tried: string[] }> {
    const tried: string[] = [];
    let lastError: unknown = new MeetingProviderError('no_transcribers', false);
    for (const transcriber of transcribers) {
        tried.push(transcriber.id);
        try { return { ...(await transcriber.transcribe(audio)), tried }; } catch (error) {
            lastError = error;
            if (error instanceof MeetingProviderError && error.code === 'empty_transcript' && !error.retryable) break;
        }
    }
    throw lastError;
}

/** Transcript as "Name: text" lines, the way the analysis reads it. */
export function transcriptAsDialogue(transcript: MeetingTranscript): string {
    if (transcript.segments.every((s) => !s.speaker)) return transcript.text;
    return transcript.segments.map((s) => `${s.speaker || '?'}: ${s.text.trim()}`).join('\n');
}

/**
 * One transcript per person (each recorded on their own track, so the name
 * comes from who owns the track) put back into one conversation in time
 * order. Needs transcribers that return times (Whisper on OpenAI or Groq,
 * Deepgram, AssemblyAI, ElevenLabs); without times each person's lines stay
 * in one block, which is still right about who said what.
 */
export function mergeTrackTranscripts(tracks: Array<{ speaker: string; transcript: MeetingTranscript }>): MeetingTranscript {
    const segments = tracks.flatMap(({ speaker, transcript }) => transcript.segments
        .filter((s) => s.text.trim())
        .map((s) => ({ ...s, speaker })));
    segments.sort((a, b) => (a.startMs ?? Number.MAX_SAFE_INTEGER) - (b.startMs ?? Number.MAX_SAFE_INTEGER));
    // Neighbouring pieces from the same person read as one turn.
    const merged: TranscriptSegment[] = [];
    for (const s of segments) {
        const last = merged[merged.length - 1];
        if (last && last.speaker === s.speaker) { last.text = `${last.text.trim()} ${s.text.trim()}`; last.endMs = s.endMs; } else merged.push({ ...s, text: s.text.trim() });
    }
    const first = tracks[0]?.transcript;
    return {
        text: joinText(merged), segments: merged, language: first?.language ?? null,
        durationSec: Math.max(0, ...tracks.map((t) => t.transcript.durationSec || 0)) || null,
        provider: first?.provider || 'unknown', model: first?.model || 'unknown',
        latencyMs: Math.max(0, ...tracks.map((t) => t.transcript.latencyMs)),
        usage: null,
    };
}
