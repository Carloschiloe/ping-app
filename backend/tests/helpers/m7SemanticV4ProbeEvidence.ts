import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { NormalizedSemanticTurnV4 } from '../../src/types/agentTurnCommit';
import type { SemanticV4Diagnostics } from '../../src/services/canonicalSemanticProducer.service';

export interface SanitizedProbeEvidence {
    model: string;
    caseId: string;
    semanticResult: {
        kind: NormalizedSemanticTurnV4['kind'];
        domain: NormalizedSemanticTurnV4['domain'];
        objectiveType: string | null;
        source: NormalizedSemanticTurnV4['source'];
        confidence: number;
    };
    diagnostics: {
        providerRequestSucceeded: boolean;
        providerErrorClass: SemanticV4Diagnostics['providerErrorClass'];
        httpStatus: number | null;
        providerErrorCode: string | null;
        providerErrorMessage: string | null;
        finishReason: string | null;
        refusalPresent: boolean;
        contentPresent: boolean;
        contentLength: number;
        schemaValid: boolean;
        parseFailure: SemanticV4Diagnostics['failure'];
        normalizationSucceeded: boolean;
        fallbackReason: SemanticV4Diagnostics['fallbackReason'];
        latencyMs: number;
        inputTokens: number | null;
        outputTokens: number | null;
        reasoningTokens: number | null;
    };
}

export function toSanitizedProbeEvidence(
    model: string,
    caseId: string,
    semantic: NormalizedSemanticTurnV4,
    diagnostics: SemanticV4Diagnostics,
): SanitizedProbeEvidence {
    return {
        model,
        caseId,
        semanticResult: {
            kind: semantic.kind,
            domain: semantic.domain,
            objectiveType: semantic.objectiveType,
            source: semantic.source,
            confidence: semantic.confidence,
        },
        diagnostics: {
            providerRequestSucceeded: diagnostics.providerRequestSucceeded,
            providerErrorClass: diagnostics.providerErrorClass,
            httpStatus: diagnostics.providerHttpStatus,
            providerErrorCode: diagnostics.providerErrorCode,
            providerErrorMessage: diagnostics.providerErrorMessage,
            finishReason: diagnostics.finishReason,
            refusalPresent: diagnostics.refusalPresent,
            contentPresent: diagnostics.contentPresent,
            contentLength: diagnostics.contentLength,
            schemaValid: diagnostics.schemaValid,
            parseFailure: diagnostics.failure,
            normalizationSucceeded: diagnostics.normalizationSuccess,
            fallbackReason: diagnostics.fallbackReason,
            latencyMs: diagnostics.latencyMs,
            inputTokens: diagnostics.usage.inputTokens,
            outputTokens: diagnostics.usage.outputTokens,
            reasoningTokens: diagnostics.usage.reasoningTokens,
        },
    };
}

export async function writeSanitizedProbeEvidence(path: string, evidence: SanitizedProbeEvidence): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}
