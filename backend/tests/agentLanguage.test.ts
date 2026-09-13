import { describe, expect, it } from 'vitest';
import { detectAgentLanguage } from '../src/utils/agentLanguage';

// PING — AGENT RESPONSE LANGUAGE CONSISTENCY. detectAgentLanguage is the
// SINGLE canonical detector shared by agentResponseSynthesizer.service.ts
// (read/query path) and agentPlanner.service.ts (write/planning path) --
// moved here from the synthesizer's own private detectTemplateLanguage so
// both layers reuse the exact same logic, never a second localization
// subsystem. These tests certify the detector directly; the planning-path
// integration (the actual root cause of the physical failure) is certified
// separately in agentPlanner.test.ts against the real physical fixture.
describe('detectAgentLanguage — locale is the primary signal, utterance regex only the fallback', () => {
    it('locale="es-CL" -> "es" regardless of utterance content', () => {
        expect(detectAgentLanguage('Delete everything', 'es-CL')).toBe('es');
    });

    it('locale="en-US" -> "en" regardless of utterance content', () => {
        expect(detectAgentLanguage('Borra todo', 'en-US')).toBe('en');
    });

    it('any "es-*" locale subtag resolves to "es", never hardcoded to one country', () => {
        expect(detectAgentLanguage('x', 'es-MX')).toBe('es');
        expect(detectAgentLanguage('x', 'es-AR')).toBe('es');
        expect(detectAgentLanguage('x', 'es')).toBe('es');
    });

    it('any "en-*" locale subtag resolves to "en"', () => {
        expect(detectAgentLanguage('x', 'en-GB')).toBe('en');
        expect(detectAgentLanguage('x', 'en')).toBe('en');
    });

    it('no locale, Spanish utterance -> "es" via the regex fallback', () => {
        expect(detectAgentLanguage('Borra definitivamente todos mis compromisos y elimina todos sus registros históricos')).toBe('es');
    });

    it('no locale, English utterance -> "en" via the regex fallback', () => {
        expect(detectAgentLanguage('Permanently delete all my commitments and erase all their historical records')).toBe('en');
    });

    it('no locale, a tie between both signals -> Spanish wins (never silently English)', () => {
        // "el" (Spanish) and "the" (English) both present -- an actual TIE
        // between the two positive signals, not an absence of signal.
        expect(detectAgentLanguage('the el')).toBe('es');
    });

    it('unrecognized locale (neither es-* nor en-*) falls back to the utterance regex, never throws', () => {
        expect(detectAgentLanguage('Borra sobre la mesa', 'fr-FR')).toBe('es');
        expect(detectAgentLanguage('What is the plan', 'fr-FR')).toBe('en');
    });
});
