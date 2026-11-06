import { describe, expect, it } from 'vitest';
import { AGENT_SUGGESTED_STARTERS, chatStarters } from '../src/utils/agentChat';

describe('chatStarters', () => {
    it('without a chat, keeps the general examples', () => {
        expect(chatStarters()).toEqual([...AGENT_SUGGESTED_STARTERS]);
    });

    it('from a direct chat, asks about that person', () => {
        const starters = chatStarters({ kind: 'direct', name: 'Laura' });
        expect(starters).toContain('¿Qué quedó pendiente con Laura?');
        expect(starters).toContain('¿Qué me prometió Laura?');
        expect(starters).toHaveLength(4);
    });

    it('from a group, names the group', () => {
        expect(chatStarters({ kind: 'group', name: 'Abastecimiento' })[0]).toBe('¿Qué quedó pendiente en Abastecimiento?');
    });

    it('leads with the most pressing commitment and shortens a long title', () => {
        const starters = chatStarters({ kind: 'direct', name: 'Laura', focus: 'Enviar la cotización del proyecto de ampliación de la bodega norte' });
        expect(starters[0].startsWith('¿Cómo va «Enviar la cotización')).toBe(true);
        expect(starters[0].endsWith('…»?')).toBe(true);
        expect(starters).toHaveLength(4);
    });

    it('in Para mí, speaks of what the user wrote down', () => {
        expect(chatStarters({ kind: 'self' })[0]).toBe('¿Qué tengo anotado aquí que siga pendiente?');
    });
});
