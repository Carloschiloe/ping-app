import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf-8');

describe('Chat feels alive and matches the app', () => {
    it('typing and recording show as an incoming bubble that moves', () => {
        const chat = read('screens/ChatScreen.tsx');
        expect(chat).toContain('<LiveActivityBubble');
        const bubble = read('components/LiveActivityBubble.tsx');
        expect(bubble).toContain('{recording ? <RecordingMic elapsed={elapsed} /> : <TypingDots />}');
        expect(bubble).toContain('backgroundColor: colors.bubbleThem');
    });

    it('a commitment without a date can get one from the chat card', () => {
        const card = read('components/GroupTaskCard.tsx');
        expect(card).toContain('accessibilityLabel="Poner fecha"');
        expect(card).toContain('(isAgreementProposal ? !!currentAgreementResponse : isOwner)');
        expect(card).toContain("await updateCommitment({ id, data: { due_at: newDateIso } });");
        expect(card).toContain('<RescheduleModal');
    });

    it('the + opens one panel with every option a single tap away', () => {
        const input = read('components/ChatInput.tsx');
        for (const label of ['Cámara', 'Galería', 'Video', 'Documento', 'Ubicación', 'Compromiso']) {
            expect(input).toContain(`label: '${label}'`);
        }
        expect(read('screens/ChatScreen.tsx')).toContain('onCreateCommitment={startNewCommitment}');
        const form = read('components/AISuggestionModal.tsx');
        expect(form).toContain("{kind === 'meeting' ? 'Reunión' : 'Tarea'}");
        expect(form).toContain('const missingTitle = !isCounterProposal && !suggestionData.title?.trim();');
        expect(form).toContain("'Sin fecha · toca para elegir'");
    });

    it('deleting a file or a message asks with Ping\'s own card, not the system alert', () => {
        for (const file of ['screens/SharedContentScreen.tsx', 'screens/SharedVisualContentScreen.tsx', 'screens/ChatScreen.tsx']) {
            expect(read(file), file).toContain('await confirmAction({');
        }
        expect(fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf-8')).toContain('<ConfirmHost />');
    });
});
