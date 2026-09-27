import fs from 'node:fs';
import path from 'node:path';

export const LEDGER_CAPTURE_VERSION = 1 as const;

export interface LedgerNotUsed {
    status: 'NOT_USED';
    reason: string;
}

export const NOT_USED = (reason: string): LedgerNotUsed => ({ status: 'NOT_USED', reason });

export interface M7LedgerEnvelope {
    envelopeVersion: typeof LEDGER_CAPTURE_VERSION;
    conversationId: string;
    turnIndex: number;
    humanUtterance: string;
    runtimeFingerprint: Record<string, unknown>;
    clock: string;
    timezone: string;
    dialogueStateBefore: unknown;
    ledgerStateBefore: unknown;
    semanticV4Raw: unknown;
    semanticV4Normalized: unknown;
    legacySemanticRaw: unknown | LedgerNotUsed;
    legacySemanticNormalized: unknown | LedgerNotUsed;
    objectiveInterpreterInput: unknown | LedgerNotUsed;
    objectiveInterpreterOutput: unknown | LedgerNotUsed;
    temporalInputs: unknown | LedgerNotUsed;
    temporalOutputs: unknown | LedgerNotUsed;
    entityResolverInputs: unknown | LedgerNotUsed;
    entityResolverOutputs: unknown | LedgerNotUsed;
    featureFlags: Record<string, unknown>;
    coreInput: unknown;
    dialogueStateAfter: unknown;
    ledgerStateAfter: unknown;
    currentObjective: unknown;
    currentVersion: number | null;
    pendingConfirmationTarget: unknown;
    disposition: unknown;
    planShape: unknown;
}

const REQUIRED_FIELDS: Array<keyof M7LedgerEnvelope> = [
    'envelopeVersion', 'conversationId', 'turnIndex', 'humanUtterance',
    'runtimeFingerprint', 'clock', 'timezone', 'dialogueStateBefore', 'ledgerStateBefore',
    'semanticV4Raw', 'semanticV4Normalized', 'legacySemanticRaw', 'legacySemanticNormalized',
    'objectiveInterpreterInput', 'objectiveInterpreterOutput', 'temporalInputs', 'temporalOutputs',
    'entityResolverInputs', 'entityResolverOutputs', 'featureFlags', 'coreInput',
    'dialogueStateAfter', 'ledgerStateAfter', 'currentObjective', 'currentVersion',
    'pendingConfirmationTarget', 'disposition', 'planShape',
];

export function assertLedgerEnvelopeComplete(value: unknown): asserts value is M7LedgerEnvelope {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('CAPTURE_ENVELOPE_INCOMPLETE=root_not_object');
    }
    const record = value as Record<string, unknown>;
    const missing = REQUIRED_FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(record, field));
    if (missing.length > 0) throw new Error(`CAPTURE_ENVELOPE_INCOMPLETE=${missing.join(',')}`);
    if (record.envelopeVersion !== LEDGER_CAPTURE_VERSION) throw new Error('CAPTURE_ENVELOPE_INCOMPLETE=version');
    if (typeof record.conversationId !== 'string' || typeof record.turnIndex !== 'number') {
        throw new Error('CAPTURE_ENVELOPE_INCOMPLETE=identity');
    }
}

export function createLedgerEnvelope(input: Omit<M7LedgerEnvelope, 'envelopeVersion' | 'dialogueStateAfter' | 'ledgerStateAfter' | 'currentObjective' | 'currentVersion' | 'pendingConfirmationTarget' | 'disposition' | 'planShape'>): M7LedgerEnvelope {
    return {
        envelopeVersion: LEDGER_CAPTURE_VERSION,
        ...input,
        dialogueStateAfter: NOT_USED('pending_core_evaluation'),
        ledgerStateAfter: NOT_USED('pending_core_evaluation'),
        currentObjective: NOT_USED('pending_core_evaluation'),
        currentVersion: null,
        pendingConfirmationTarget: NOT_USED('pending_core_evaluation'),
        disposition: NOT_USED('pending_core_evaluation'),
        planShape: NOT_USED('pending_core_evaluation'),
    };
}

export function completeLedgerEnvelope(
    envelope: M7LedgerEnvelope,
    result: Pick<M7LedgerEnvelope, 'dialogueStateAfter' | 'ledgerStateAfter' | 'currentObjective' | 'currentVersion' | 'pendingConfirmationTarget' | 'disposition' | 'planShape'>,
): M7LedgerEnvelope {
    const completed = { ...envelope, ...result };
    assertLedgerEnvelopeComplete(completed);
    return completed;
}

function ensureSafeArtifactRoot(root: string): string {
    const absolute = path.resolve(root);
    if (absolute === path.parse(absolute).root) throw new Error('LEDGER_ARTIFACT_ROOT_UNSAFE');
    return absolute;
}

export function writeLedgerEnvelope(root: string, filename: string, envelope: M7LedgerEnvelope): string {
    assertLedgerEnvelopeComplete(envelope);
    const directory = ensureSafeArtifactRoot(root);
    fs.mkdirSync(directory, { recursive: true });
    const target = path.join(directory, filename);
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    const body = `${JSON.stringify(envelope, null, 2)}\n`;
    const fd = fs.openSync(temporary, 'wx');
    try {
        fs.writeSync(fd, body, undefined, 'utf8');
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    fs.renameSync(temporary, target);
    return target;
}

export function readLedgerEnvelope(filePath: string): M7LedgerEnvelope {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    assertLedgerEnvelopeComplete(parsed);
    return parsed;
}

export function stableLedgerProjection(value: any): Record<string, unknown> {
    return {
        dialogueStateAfter: value?.dialogueStateAfter ?? null,
        ledgerStateAfter: value?.ledgerStateAfter ?? null,
        currentObjective: value?.currentObjective ?? null,
        currentVersion: value?.currentVersion ?? null,
        pendingConfirmationTarget: value?.pendingConfirmationTarget ?? null,
        disposition: value?.disposition ?? null,
        planShape: value?.planShape ?? null,
    };
}

export function containsForbiddenRuntimeSource(value: unknown): string | null {
    const serialized = JSON.stringify(value);
    if (/OPENAI_API_KEY|authorization|Bearer\s+sk-|SUPABASE_SERVICE_ROLE_KEY/i.test(serialized)) return 'secret';
    return null;
}
