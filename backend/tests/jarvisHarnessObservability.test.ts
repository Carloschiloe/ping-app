import { describe, expect, it } from 'vitest';

// The harness helpers are intentionally dependency-free and run in Node's ESM
// loader. This test never calls staging or OpenAI.
// @ts-expect-error The helper is a runtime-only .mjs harness module.
import {
  classifyTransportError,
  sanitizeDiagnosticText,
  summarizeExposedDiagnostics,
  summarizeSafeResponseHeaders,
  summarizeAgentDeviceTraces,
} from '../scripts/jarvis-harness-observability.mjs';

describe('Jarvis harness diagnostics', () => {
  it('redacts credentials, bearer tokens and token query parameters', () => {
    const value = sanitizeDiagnosticText(
      'Authorization: Bearer abc123 OPENAI_API_KEY=sk-live-secret?access_token=jwt-secret',
    );
    expect(value).not.toContain('abc123');
    expect(value).not.toContain('sk-live-secret');
    expect(value).not.toContain('jwt-secret');
    expect(value).toContain('[REDACTED]');
  });

  it('captures only safe transport headers', () => {
    const headers = new Headers({
      'content-type': 'application/json',
      'ratelimit-remaining': '17',
      authorization: 'Bearer must-not-be-recorded',
    });
    const safe = summarizeSafeResponseHeaders(headers);
    expect(safe.contentType).toBe('application/json');
    expect(safe.rateRemaining).toBe('17');
    expect(safe).not.toHaveProperty('authorization');
  });

  it('classifies timeout and sanitizes its message', () => {
    const result = classifyTransportError(Object.assign(new Error('request timed out; token=secret'), { name: 'TimeoutError' }));
    expect(result.class).toBe('timeout');
    expect(result.message).not.toContain('secret');
  });

  it('does not invent provider diagnostics when the public DTO omits them', () => {
    expect(summarizeExposedDiagnostics({ status: 'answered', answer: 'ok' })).toEqual({
      available: false,
      reason: 'public_response_omits_internal_diagnostics',
    });
  });

  it('preserves sanitized diagnostic fields if a staging response exposes them', () => {
    expect(summarizeExposedDiagnostics({ diagnostics: {
      schemaValid: false,
      fallbackReason: 'api_error',
      providerErrorClass: 'http',
      providerHttpStatus: 400,
      providerErrorCode: 'unsupported_parameter',
    } })).toEqual({
      available: true,
      source: 'payload',
      schemaValid: false,
      fallbackReason: 'api_error',
      providerErrorClass: 'http',
      providerHttpStatus: 400,
      providerErrorCode: 'unsupported_parameter',
    });
  });

  it('filters device traces by dialogue scope and keeps only structural fields', () => {
    const traces = summarizeAgentDeviceTraces({ traces: [
      { traceId: 'other', at: 'now', label: 'AGENT_DIALOGUE_SCOPE', data: { dialogueScopeKey: 'other' } },
      { traceId: 't1', at: 'now', label: 'AGENT_DIALOGUE_SCOPE', data: { dialogueScopeKey: 'scope-1' } },
      { traceId: 't1', at: 'now', label: 'AGENT_SEMANTIC_INTERPRETATION', data: { inputSource: 'llm_fallback', fallbackReason: 'api_error', schemaValid: true, rawInput: 'private text' } },
      { traceId: 't1', at: 'now', label: 'AGENT_SEMANTIC_V4_CORE_SHADOW', data: { providerFailure: true, fallbackReason: 'api_error', answer: 'private text' } },
      { traceId: 't1', at: 'now', label: 'AGENT_CONTEXT_RESULT', data: { intentType: 'read', rawInput: 'private text' } },
    ] }, 'scope-1');
    expect(traces).toEqual([
      { traceId: 't1', at: 'now', label: 'AGENT_SEMANTIC_INTERPRETATION', data: { inputSource: 'llm_fallback', fallbackReason: 'api_error', schemaValid: true } },
      { traceId: 't1', at: 'now', label: 'AGENT_SEMANTIC_V4_CORE_SHADOW', data: { providerFailure: true, fallbackReason: 'api_error' } },
      { traceId: 't1', at: 'now', label: 'AGENT_CONTEXT_RESULT', data: { intentType: 'read' } },
    ]);
    expect(JSON.stringify(traces)).not.toContain('private text');
  });
});
