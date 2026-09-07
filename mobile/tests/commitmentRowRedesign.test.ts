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
const TODAY_ITEM_ROW_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/hoy/TodayItemRow.tsx'), 'utf-8',
);
const GROUP_TASK_CARD_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/GroupTaskCard.tsx'), 'utf-8',
);

describe('sección 19: ambas filas usan el MISMO helper canónico, nunca un roleLabel()/rowLabel() reimplementado', () => {
    it('CommitmentRow.tsx importa y usa getActorPresentation', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/import \{ getActorPresentation \} from '\.\.\/\.\.\/utils\/actorPresentation'/);
        expect(COMMITMENT_ROW_SRC).toMatch(/const presentation = getActorPresentation\(/);
    });
    it('TodayItemRow.tsx importa y usa getActorPresentation', () => {
        expect(TODAY_ITEM_ROW_SRC).toMatch(/import \{ getActorPresentation \} from '\.\.\/\.\.\/utils\/actorPresentation'/);
        expect(TODAY_ITEM_ROW_SRC).toMatch(/const presentation = getActorPresentation\(c, currentUserId\);/);
    });
    it('el "← Carlos"/"→ Alejandra" arrow-glyph hardcodeado ya NO existe en CommitmentRow.tsx (sección 13: ambigüedad real reportada)', () => {
        expect(COMMITMENT_ROW_SRC).not.toMatch(/const roleLabel = \(\)/);
        expect(COMMITMENT_ROW_SRC).not.toContain('`← ${');
        expect(COMMITMENT_ROW_SRC).not.toContain('`→ ${');
    });
    it('el rowLabel() genérico ("Mía"/"Encargada") ya NO existe en TodayItemRow.tsx', () => {
        expect(TODAY_ITEM_ROW_SRC).not.toMatch(/const rowLabel = /);
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
    it('TodayItemRow.tsx: mismo patrón -- labelChip eliminado como estilo/uso real', () => {
        expect(TODAY_ITEM_ROW_SRC).not.toMatch(/styles\.labelChip|labelChip:\s*\{/);
    });
    it('ambas filas tienen una metaLine y una statusLine propias, fuera de titleRow', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/styles\.metaLine/);
        expect(COMMITMENT_ROW_SRC).toMatch(/styles\.statusLine/);
        expect(TODAY_ITEM_ROW_SRC).toMatch(/styles\.metaLine/);
        expect(TODAY_ITEM_ROW_SRC).toMatch(/styles\.statusLine/);
    });
    it('el botón/badge primario ya no vive en la misma fila horizontal que el título -- actionsRow es un bloque aparte, debajo', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/styles\.actionsRow/);
        expect(TODAY_ITEM_ROW_SRC).toMatch(/styles\.actionsRow/);
        // El viejo "actions" (título + botón en la misma fila horizontal) ya no existe como contenedor de renderPrimaryAction junto al título.
        expect(COMMITMENT_ROW_SRC).not.toMatch(/<View style=\{styles\.actions\}>/);
        expect(TODAY_ITEM_ROW_SRC).not.toMatch(/<View style=\{styles\.actions\}>/);
    });
});

describe('sección 17: menú de overflow Android usa Modal real (mismo primitivo ya probado en GroupTaskCard.tsx), nunca el View absolutamente posicionado dentro de la fila', () => {
    it('CommitmentRow.tsx usa <Modal ... visible={Platform.OS !== \'ios\' && menuVisible}>', () => {
        expect(COMMITMENT_ROW_SRC).toMatch(/<Modal visible=\{Platform\.OS !== 'ios' && menuVisible\}/);
        expect(COMMITMENT_ROW_SRC).not.toMatch(/position: 'absolute',\s*right: 16,\s*top: 36/);
    });
    it('TodayItemRow.tsx usa <Modal visible={menuVisible}>', () => {
        expect(TODAY_ITEM_ROW_SRC).toMatch(/<Modal visible=\{menuVisible\}/);
        expect(TODAY_ITEM_ROW_SRC).not.toMatch(/position: 'absolute',\s*right: 0,\s*top: 32/);
    });
    it('ambos menús preservan exactamente las mismas acciones (sección 17: "Do NOT redesign navigation")', () => {
        expect(TODAY_ITEM_ROW_SRC).toMatch(/Ver conversación/);
        expect(TODAY_ITEM_ROW_SRC).toMatch(/Ver en Compromisos/);
        expect(COMMITMENT_ROW_SRC).toMatch(/Ver detalle/);
        expect(COMMITMENT_ROW_SRC).toMatch(/Ver conversación/);
    });
});

describe('sección 15: GroupTaskCard.tsx nunca elipsa Responsable/Propone a 1 línea, ni las comprime contra un badge en la misma fila horizontal', () => {
    it('assigneeText/requesterText ahora usan numberOfLines={2}, nunca 1', () => {
        expect(GROUP_TASK_CARD_SRC).toMatch(/styles\.assigneeText,[^\n]*\]\} numberOfLines=\{2\}/);
        expect(GROUP_TASK_CARD_SRC).toMatch(/styles\.requesterText,[^\n]*\]\} numberOfLines=\{2\}/);
    });
    it('footerRow (fila horizontal texto+badges) ya no existe -- footerColumn (vertical, badges debajo) lo reemplaza', () => {
        expect(GROUP_TASK_CARD_SRC).not.toMatch(/styles\.footerRow/);
        expect(GROUP_TASK_CARD_SRC).toMatch(/styles\.footerColumn/);
    });
});

describe('sección 18: exactamente cuatro tabs, nunca modificado (Chats | Hoy | Compromisos | Perfil)', () => {
    it('ninguno de los archivos tocados en este ticket declara una nueva screen/tab', () => {
        for (const src of [COMMITMENT_ROW_SRC, TODAY_ITEM_ROW_SRC, GROUP_TASK_CARD_SRC]) {
            expect(src).not.toMatch(/createBottomTabNavigator|Tab\.Screen/);
        }
    });
});
