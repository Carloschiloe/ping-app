import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recorded: Array<{ feature: string; model: string; usage: any }> = [];
vi.mock('../src/services/aiUsage.service', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../src/services/aiUsage.service')>()),
    recordAiUsage: (row: any) => { recorded.push(row); },
}));
vi.mock('../src/services/voiceSettings.service', () => ({ getVoiceSettings: async () => ({ voice: 'marin', speed: 1 }) }));

import { buildGeminiSetup, createGeminiLiveSession, GEMINI_LIVE_WS_URL, GEMINI_SAY_PREFIX } from '../src/services/m8LiveVoiceGemini.service';
import { getM8LiveVoiceGeminiClientHtml } from '../src/services/m8LiveVoiceGeminiClient.service';
import { getM8LiveVoiceClientHtml } from '../src/services/m8LiveVoiceClient.service';
import { recordLiveVoiceUsage } from '../src/services/m8LiveVoice.service';
import { costFor } from '../src/services/aiUsage.service';

const request = { voiceSessionId: '22222222-2222-4222-8222-222222222222', deviceSessionId: '33333333-3333-4333-8333-333333333333', timezone: 'America/Santiago' };

beforeEach(() => {
    process.env.PING_ENVIRONMENT = 'production';
    process.env.M8_LIVE_VOICE_ENABLED = 'true';
    process.env.GEMINI_API_KEY = 'test-only-gemini-key';
    recorded.length = 0;
});
afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
});

describe("Google's live voice", () => {
    it('locks Vorian instructions, the one tool, the chosen voice and a short history into the setup', () => {
        const setup = buildGeminiSetup(request, 'gemini-3.8-live', 'Aoede');
        expect(setup.model).toBe('models/gemini-3.8-live');
        expect(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
        expect(setup.tools[0].functionDeclarations.map((f) => f.name)).toEqual(['ping_core_turn']);
        expect(setup.tools[0].functionDeclarations[0].parameters.required).toEqual(['input', 'intent']);
        expect(setup.contextWindowCompression).toEqual({ triggerTokens: 1000, slidingWindow: { targetTokens: 500 } });
        const text = setup.systemInstruction.parts[0].text;
        expect(text).toContain('di únicamente authorizedText');
        expect(text).toContain(GEMINI_SAY_PREFIX);
        expect(text).toContain('America/Santiago');
    });

    it('mints a one-use pass with the setup inside, and never hands out the key', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: 'auth_tokens/pass-123' }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const result = await createGeminiLiveSession({ request, voice: 'Sulafat' });
        expect(result).toEqual({ token: 'auth_tokens/pass-123', model: 'gemini-3.8-live', url: GEMINI_LIVE_WS_URL, provider: 'gemini_live_ws' });
        expect(JSON.stringify(result)).not.toContain('test-only-gemini-key');
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/auth_tokens');
        expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-only-gemini-key');
        const body = JSON.parse(String(init.body));
        expect(body.uses).toBe(1);
        expect(Date.parse(body.newSessionExpireTime) - Date.now()).toBeLessThanOrEqual(60_000);
        expect(body.bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Sulafat');
    });

    it('fails cleanly without the key or when Google refuses, so the page falls back to OpenAI', async () => {
        delete process.env.GEMINI_API_KEY;
        await expect(createGeminiLiveSession({ request, voice: 'Aoede' })).rejects.toMatchObject({ statusCode: 503 });
        process.env.GEMINI_API_KEY = 'test-only-gemini-key';
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), { status: 403 })));
        await expect(createGeminiLiveSession({ request, voice: 'Aoede' })).rejects.toMatchObject({ statusCode: 503 });
    });

    it("prices Google's spending with Google's list, not OpenAI's", () => {
        recordLiveVoiceUsage('user-1', 'voz_en_vivo', {
            input_tokens: 1500, output_tokens: 120,
            input_token_details: { text_tokens: 1000, audio_tokens: 500 },
            output_token_details: { text_tokens: 20, audio_tokens: 100 },
        }, 'gemini');
        expect(recorded[0].model).toBe('gemini-3.8-live');
        expect(recorded[0].usage).toMatchObject({ inputTokens: 1000, audioInputTokens: 500, outputTokens: 20, audioOutputTokens: 100 });
        // 1000×0.75 + 500×3 + 20×4.5 + 100×12 = 3540 per million.
        expect(costFor('gemini-3.8-live', recorded[0].usage)).toBeCloseTo(0.00354, 8);
    });

    it('serves a page that only plays what Vorian Core authorised and falls back to OpenAI if Google cannot start', () => {
        const html = getM8LiveVoiceGeminiClientHtml('gemini-test-nonce');
        const script = html.slice(html.indexOf('(function(){'), html.lastIndexOf('})();') + 5);
        expect(() => new Function(script)).not.toThrow();
        expect(html).toContain('nonce="gemini-test-nonce"');
        // Same screen as the OpenAI page.
        expect(html).toContain('<canvas id="orb" class="aura"');
        expect(html).toContain("const auraMode=");
        // The pass comes from the server; the key is never in the page.
        expect(html).toContain("/agent/voice/live/gemini/session");
        expect(html).toContain("?access_token='+encodeURIComponent(result.token)");
        expect(html).not.toContain('GEMINI_API_KEY');
        // Audio is played only after Vorian Core's answer (or a greeting) was handed to Google.
        expect(html).toContain("if(speechAllowed){speechStarted=true;playChunk(data)}else if(!droppedAudio){droppedAudio=true;telemetry('error',{detailCode:'audio_before_core_result'");
        expect(html).toContain('response:{core_presentation:presentation}');
        expect(html).toContain(`parts:[{text:SAY+' '+text}]`);
        // Goodbyes by meaning or by phrase, as on the OpenAI page.
        expect(html).toContain("if(args?.intent==='end_conversation'||isVoiceFarewell(selected)){sayFarewell(");
        // Spending is reported as Google's.
        expect(html).toContain("kind:'voz_en_vivo',provider:'gemini'");
        // Google could not start: the same conversation continues with OpenAI.
        expect(html).toContain("location.replace(location.pathname+'?provider=openai')");
        expect(html).toContain("if(!connected&&fallbackToOpenAI(");
    });

    it('keeps the OpenAI page as it was', () => {
        const html = getM8LiveVoiceClientHtml('openai-test-nonce');
        expect(html).toContain("dc=pc.createDataChannel('oai-events')");
        expect(html).not.toContain('gemini');
    });
});
