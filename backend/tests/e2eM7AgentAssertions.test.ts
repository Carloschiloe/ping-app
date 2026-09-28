import { describe, expect, it } from 'vitest';
import { assertStrongM7Sequence } from '../scripts/e2e-m7-agent-assertions.mjs';

function turn(sequence: number, objective: Record<string, unknown> | null, kind: string) {
  return {
    status: 200,
    response: { kind },
    checkpoint: { turnSequence: sequence, activeObjective: objective },
  };
}

const objective = (entity: string, time: string) => ({
  objectiveType: 'create_commitment_or_proposal',
  entityHints: [entity],
  desiredOutcome: entity,
  timeHint: time,
});

describe('M7 staging semantic assertions', () => {
  it('accepts an isolated objective switch, return, correction and safe follow-ups', () => {
    const turns = [
      turn(1, objective('revisión del inventario', 'jueves'), 'plan'),
      turn(2, objective('llamada al proveedor', 'viernes'), 'plan'),
      turn(3, objective('llamada al proveedor', 'viernes'), 'clarification'),
      turn(4, objective('revisión del inventario', 'jueves'), 'response'),
      turn(5, objective('revisión del inventario', 'lunes siguiente'), 'plan'),
      turn(6, objective('revisión del inventario', 'lunes siguiente'), 'plan'),
      turn(7, objective('revisión del inventario', 'lunes siguiente'), 'clarification'),
      turn(8, objective('revisión del inventario', 'lunes siguiente'), 'clarification'),
    ];
    expect(assertStrongM7Sequence(turns)).toEqual({ ok: true });
  });

  it('rejects stale slots after a real objective switch', () => {
    const turns = [
      turn(1, objective('revisión del inventario', 'jueves'), 'plan'),
      turn(2, objective('llamada al proveedor jueves', 'viernes'), 'plan'),
      turn(3, objective('llamada al proveedor jueves', 'viernes'), 'clarification'),
      turn(4, objective('llamada al proveedor', 'viernes'), 'response'),
      turn(5, objective('llamada al proveedor', 'lunes'), 'plan'),
      turn(6, objective('llamada al proveedor', 'lunes'), 'plan'),
      turn(7, objective('llamada al proveedor', 'lunes'), 'clarification'),
      turn(8, objective('llamada al proveedor', 'lunes'), 'clarification'),
    ];
    expect(() => assertStrongM7Sequence(turns)).toThrow(/Turn 4/);
  });
});
