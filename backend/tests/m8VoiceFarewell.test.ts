import { describe, expect, it } from 'vitest';
import { isVoiceFarewell, M8_VOICE_FAREWELL_BROWSER_SOURCE } from '../src/services/m8VoiceFarewell';
import { getM8LiveVoiceClientHtml } from '../src/services/m8LiveVoiceClient.service';

const GOODBYES = ['Chao Vorian', 'chao', 'Gracias, eso es todo.', 'Listo, gracias. Chao!', 'Cierra', 'cierra la conversación', 'Termina', 'Adiós', 'Hasta luego Vorian', 'nada más, gracias', 'ok, nos vemos', 'Corta la llamada', 'Chao, ciérrate', 'chao cierrate vorian', 'Listo, apágate', 'Ciérrate por favor', 'Ya, chao, gracias', 'Eso nomás quería saber. Chau.', 'Salgas, ciérrate, yo terminé de hablar contigo.', 'Ciérrate, ya terminé de hablar contigo', 'ok gracias, eso era todo', 'apágate vorian', 'Bueno, chao Vorian, gracias.', 'ciérrate ya'];
const NOT_GOODBYES = ['Cierra el compromiso con Juan', 'termina la reunión a las cinco', 'gracias', '¿Qué tengo mañana?', 'chao con el almuerzo de mañana, cancélalo', '', 'apaga la luz del living a las 8', 'Chao, y recuérdame mañana llamar a Juan', 'Fíjate qué tengo mañana', 'Termina la tarea de informe', 'cierra la venta con Pedro el lunes'];

describe('closing the live voice by voice', () => {
    it('recognises a short goodbye and nothing that only contains the word', () => {
        for (const text of GOODBYES) expect(isVoiceFarewell(text), text).toBe(true);
        for (const text of NOT_GOODBYES) expect(isVoiceFarewell(text), text).toBe(false);
    });

    it('the voice page runs the same check', () => {
        const browser = new Function(`${M8_VOICE_FAREWELL_BROWSER_SOURCE}; return isVoiceFarewell;`)() as (value: unknown) => boolean;
        for (const text of [...GOODBYES, ...NOT_GOODBYES]) expect(browser(text), text).toBe(isVoiceFarewell(text));
    });

    it('the page answers a goodbye and closes instead of asking the assistant', () => {
        process.env.PING_ENVIRONMENT = 'production';
        process.env.M8_LIVE_VOICE_ENABLED = 'true';
        process.env.M8_LIVE_VOICE_MODEL = 'gpt-realtime-2.1';
        process.env.OPENAI_API_KEY = 'test-only-key';
        const html = getM8LiveVoiceClientHtml();
        expect(html).toContain('if(isVoiceFarewell(selectedInput)){sayFarewell(event.call_id);return}');
        // A goodbye is never sent ahead to the assistant.
        expect(html).toContain('const prefetchCore=(input,turnId)=>{if(isVoiceFarewell(input))return;');
        // The app takes the person back to the chat list.
        expect(html).toContain("farewellPending=true;post({type:'farewell'});");
        // Opened from the day's summary, it is said instead of the usual hello.
        expect(html).toContain("createResponse(briefing?'daily_briefing':'greeting','none',briefing||");
        expect(html).toContain("if(event.type==='output_audio_buffer.stopped'&&farewellPending)setTimeout(stop,300);");
        const script = html.slice(html.indexOf('(function(){'), html.lastIndexOf('})();') + 5);
        expect(() => new Function(script)).not.toThrow();
    });
});
