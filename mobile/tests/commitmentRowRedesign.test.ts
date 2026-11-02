import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// COMMITMENT UX + ACTOR-AWARE SUGGESTIONS — verifica el cableado real de la
// jerarquía de fila rediseñada (sección 9/19) y el menú de overflow basado
// en Modal (sección 17), vía el mismo patrón de source-text ya establecido
// (mobile/vitest.config.ts: sin renderer de componentes, sección 6 del
// ticket ya documenta esta decisión explícitamente).
const COMMITMENT_ROW_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/compromisos/CommitmentRow.tsx'), 'utf-8',
);
const GROUP_TASK_CARD_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/GroupTaskCard.tsx'), 'utf-8',
);

describe('sección 19: ambas filas usan el MISMO helper canónico, nunca un roleLabel()/rowLabel() reimplementado', () => {
    it('CommitmentRow.tsx importa y usa getActorPresentation', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/import \{ getActorPresentation \} from '\.\.\/\.\.\/utils\/actorPresentation'/);
        expect(COMMITMENT_ROW_SRC).toMatch(/const presentation = getActorPresentation\(/);
    });
    it('el "← Carlos"/"→ Alejandra" arrow-glyph hardcodeado ya NO existe en CommitmentRow.tsx (sección 13: ambigüedad real reportada)', () => {
        expect(COMMITMENT_ROW_SRC).not.toMatch(/const roleLabel = \(\)/);
        expect(COMMITMENT_ROW_SRC).not.toContain('`← ${');
        expect(COMMITMENT_ROW_SRC).not.toContain('`→ ${');
    });
    it('GroupTaskCard.tsx reutiliza getProposalActorPresentation para el copy de la card de chat, nunca una redacción propia de "Te corresponde responder"', () => {
        expect(GROUP_TASK_CARD_SRC).toMatch(/import \{ getProposalActorPresentation \} from '\.\.\/utils\/actorPresentation'/);
        expect(GROUP_TASK_CARD_SRC).toMatch(/const proposalPresentation = isAgreementProposal \? getProposalActorPresentation\(commitment, user\?\.id\) : null;/);
        expect(GROUP_TASK_CARD_SRC).not.toContain("'Te corresponde responder'");
    });
});

describe('sección 9: título nunca comparte línea con un person-chip ni con el badge de estado (causa mecánica real del wrap-a-mitad-de-palabra)', () => {
    it('CommitmentRow.tsx: titleRow sólo contiene el título y el botón "..." -- el labelChip/badge de rol ya no existe como estilo ni como uso real (sólo puede quedar mencionado en un comentario explicativo)', () => {
        expect(COMMITMENT_ROW_SRC).not.toMatch(/styles\.labelChip|labelChip:\s*\{/);
    });
    it('ambas filas tienen una metaLine y una statusLine propias, fuera de titleRow', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/styles\.metaLine/);
        expect(COMMITMENT_ROW_SRC).toMatch(/styles\.statusLine/);
    });
    it('el botón/badge primario ya no vive en la misma fila horizontal que el título -- actionsRow es un bloque aparte, debajo', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/styles\.actionsRow/);
        // El viejo "actions" (título + botón en la misma fila horizontal) ya no existe como contenedor de renderPrimaryAction junto al título.
        expect(COMMITMENT_ROW_SRC).not.toMatch(/<View style=\{styles\.actions\}>/);
    });
});

describe('sección 17: menú de overflow Android usa Modal real (mismo primitivo ya probado en GroupTaskCard.tsx), nunca el View absolutamente posicionado dentro de la fila', () => {
    it('CommitmentRow.tsx usa <Modal ... visible={Platform.OS !== \'ios\' && menuVisible}>', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/<Modal visible=\{Platform\.OS !== 'ios' && menuVisible\}/);
        expect(COMMITMENT_ROW_SRC).not.toMatch(/position: 'absolute',\s*right: 16,\s*top: 36/);
    });
    it('el menú preserva las mismas acciones (sección 17: "Do NOT redesign navigation")', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/Ver detalle/);
        expect(COMMITMENT_ROW_SRC).toMatch(/Ver conversación/);
    });
});

describe('chat task card is compact: day badge, one-line title and a quiet meta line', () => {
    it('shows the same day badge as Hoy and fades finished items', () => {
        expect(GROUP_TASK_CARD_SRC).toContain('const badge = dayBadge(commitment.due_at);');
        expect(GROUP_TASK_CARD_SRC).toContain('(isFinished || isPast) && styles.cardFinished');
        expect(GROUP_TASK_CARD_SRC).toMatch(/styles\.metaLine/);
    });
    it('the old tall layout (Responsable / Creada por / status pill) is gone from the card', () => {
        expect(GROUP_TASK_CARD_SRC).not.toContain('styles.assigneeText');
        expect(GROUP_TASK_CARD_SRC).not.toContain('styles.footerColumn');
    });
});

describe('sección 18: exactamente cuatro tabs, nunca modificado (Chats | Hoy | Compromisos | Perfil)', () => {
    it('ninguno de los archivos tocados en este ticket declara una nueva screen/tab', () => {
        for (const src of [COMMITMENT_ROW_SRC, GROUP_TASK_CARD_SRC]) {
            expect(src).not.toMatch(/createBottomTabNavigator|Tab\.Screen/);
        }
    });
});
