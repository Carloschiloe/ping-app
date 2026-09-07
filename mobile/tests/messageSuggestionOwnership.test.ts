import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// COMMITMENT UX + ACTOR-AWARE SUGGESTIONS — SUGGESTION OWNERSHIP TESTS
// (sección 21 del ticket). Ningún renderer de componentes existe en este
// repo (mobile/vitest.config.ts: environment 'node', sólo tests/**/*.test.ts
// -- ver decisión ya documentada ahí) -- se certifica el CABLEADO real vía
// el mismo patrón de source-text ya establecido en
// commitmentPrimaryAction.test.ts, nunca una prueba "de mentira" que no lea
// el código real.
const MESSAGE_ITEM_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/MessageItem.tsx'),
    'utf-8',
);

describe('sección 1/3/4 del ticket: hallazgo físico real -- "Agendar" duplicado bajo el mensaje de Carlos en el teléfono de Alejandra', () => {
    it('el gate del botón Agendar ahora exige isMe (autoría, sección 3) -- nunca "message contains date -> everybody gets Agendar"', () => {
        expect(MESSAGE_ITEM_SRC).toMatch(/const canInitiateSuggestion = isMe && tasksForThisMessage\.length === 0;/);
    });

    it('el botón Agendar se gatea con canInitiateSuggestion, nunca sólo con meta?.suggestedTask (el bug original)', () => {
        expect(MESSAGE_ITEM_SRC).toMatch(/\{meta\?\.suggestedTask && canInitiateSuggestion && \(/);
        // El patrón viejo (sin canInitiateSuggestion) ya no debe existir.
        expect(MESSAGE_ITEM_SRC).not.toMatch(/\{meta\?\.suggestedTask && \(\s*<TouchableOpacity/);
    });

    it('tasksForThisMessage se computa UNA sola vez y se reutiliza para la card de abajo -- nunca dos filtros independientes que puedan desincronizarse', () => {
        expect(MESSAGE_ITEM_SRC).toMatch(/const tasksForThisMessage = groupTasks\.filter\(\(t: any\) => t\.message_id === item\.id\);/);
        expect(MESSAGE_ITEM_SRC).toMatch(/const tasks = tasksForThisMessage;/);
    });

    it('sección 4 (materialization rule): canInitiateSuggestion exige tasksForThisMessage.length === 0 -- una vez materializada, el CTA original desaparece para CUALQUIER actor, incluido el propio autor', () => {
        // canInitiateSuggestion = isMe && tasksForThisMessage.length === 0
        // ya certificado arriba -- este test documenta explícitamente que
        // la condición aplica sin importar isMe una vez que existe una
        // proposal/commitment real para este mensaje.
        const match = MESSAGE_ITEM_SRC.match(/const canInitiateSuggestion = (.+);/);
        expect(match?.[1]).toContain('tasksForThisMessage.length === 0');
    });
});

describe('sección 6 del ticket: "Guardar para mí" NUNCA se implementa en este ticket', () => {
    it('no existe ningún flujo nuevo de "guardar para mí" en MessageItem.tsx', () => {
        expect(MESSAGE_ITEM_SRC.toLowerCase()).not.toContain('guardar para mí');
        expect(MESSAGE_ITEM_SRC.toLowerCase()).not.toContain('guardar para mi');
    });
});
