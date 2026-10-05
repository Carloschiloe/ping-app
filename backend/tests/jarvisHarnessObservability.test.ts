import { describe, expect, it } from 'vitest';

// The harness helpers are intentionally dependency-free and run in Node's ESM
// loader. This test never calls staging or OpenAI.
// @ts-expect-error The helper is a runtime-only .mjs harness module.
import {
  classifyTransportError,
  sanitizeDiagnosticText,
  summarizeExposedDiagnostics,
  summarizeSafeResponseHeaders,
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
      providerErrorCode: 'unsupported_parameter',
    } })).toEqual({
      available: true,
      source: 'payload',
      schemaValid: false,
      fallbackReason: 'api_error',
      providerErrorClass: 'http',
      providerErrorCode: 'unsupported_parameter',
    });
  });
});
