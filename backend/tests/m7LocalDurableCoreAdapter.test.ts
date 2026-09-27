import { describe, expect, it } from 'vitest';
import { runLocalDurableCoreValidation } from '../certification/m7-local-durable-core-validation';

describe('M-7 local durable Core boundary', () => {
    it('reuses production V4 adapter, high-fidelity resolver and disposition with durable A-B-A state', async () => {
        const report = await runLocalDurableCoreValidation();
        expect(report.stateBoundaryIdentified).toBe(true);
        expect(report.productionCoreReused).toBe(true);
        expect(report.currentVersionCorrect).toBe(true);
        expect(report.staleSlotReappearance).toBe(false);
        expect(report.confirmationTargetCorrect).toBe(true);
        expect(report.objectiveSwitchIsolated).toBe(true);
        expect(report.returnToObjectiveCorrect).toBe(true);
        expect(report.ambiguityDoesNotAssume).toBe(true);
        expect(report.correctionReplacesActiveValue).toBe(true);
        expect(report.confirmationBindsCurrentVersion).toBe(true);
        expect(report.noCrossObjectiveSlotLeakage).toBe(true);
        expect(report.noStalePendingFieldAfterSwitch).toBe(true);
        expect(report.reloadContinuity).toBe(true);
        expect(report.staleVersionDetected).toBe(true);
        expect(report.wrongConfirmationTargetDetected).toBe(true);
        expect(report.crossObjectiveWriteDetected).toBe(true);
        expect(report.captureVsReplay).toBe(true);
        expect(report.replay1VsReplay2).toBe(true);
        expect(report.shadowFailures).toBe(0);
        expect(report.sideEffects).toBe(0);
    });
});
