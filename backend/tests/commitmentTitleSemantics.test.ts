import { describe, expect, it } from 'vitest';
import { isGenericCommitmentTitleHint } from '../src/utils/commitmentTitleSemantics';

describe('isGenericCommitmentTitleHint', () => {
    it.each(['algo', 'Algo.', 'una cosa', 'something', 'un compromiso', 'recordatorio'])(
        'treats "%s" as naming no activity', (value) => {
            expect(isGenericCommitmentTitleHint(value)).toBe(true);
        },
    );

    it.each(['comprar algo para la cena', 'pagar la luz', 'dentista'])(
        'keeps "%s" as a real title', (value) => {
            expect(isGenericCommitmentTitleHint(value)).toBe(false);
        },
    );
});
