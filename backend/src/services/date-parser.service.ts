import * as chrono from 'chrono-node';

export interface ParsedDateResult {
    date: Date;
    textRef: string; // The exact text matched e.g "el viernes a las 15:00"
}

export const parseDateFromText = (text: string, referenceDate: Date = new Date()): ParsedDateResult | null => {
    // chrono-node handles multiple languages. We use the Spanish parser primarily.
    // chrono.es parses Spanish text.

    // Note: For MVP we pick the first parsed date found.
    const results = chrono.es.parse(text, referenceDate, { forwardDate: true });

    if (results.length > 0) {
        const result = results[0];
        return {
            date: result.start.date(),
            textRef: result.text
        };
    }

    // Fallback to casual or default if explicit "es" didn't pick up some edge cases.
    const casualResults = chrono.parse(text, referenceDate, { forwardDate: true });
    if (casualResults.length > 0) {
        const result = casualResults[0];
        return {
            date: result.start.date(),
            textRef: result.text
        };
    }

    return null;
};
