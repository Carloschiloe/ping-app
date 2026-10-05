const SECRET_VALUE_PATTERNS = [
  /(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi,
  /(bearer\s+)[^\s,;]+/gi,
  /((?:OPENAI_API_KEY|SUPABASE_(?:ANON_KEY|SERVICE_ROLE_KEY)|RENDER_[A-Z0-9_]+|DATABASE_URL|ACCESS_TOKEN|REFRESH_TOKEN|API_KEY|SECRET)\s*[:=]\s*)[^\s,;]+/gi,
  /((?:[?&]|\b)(?:access_token|refresh_token|token|api_key|apikey|key|secret|authorization)\s*=\s*)[^&\s]+/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

export function sanitizeDiagnosticText(value) {
  let text = typeof value === 'string' ? value : String(value ?? '');
  for (const pattern of SECRET_VALUE_PATTERNS) text = text.replace(pattern, '$1[REDACTED]');
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function headerValue(headers, names) {
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) return sanitizeDiagnosticText(value);
  }
  return null;
}

export function summarizeSafeResponseHeaders(headers) {
  return {
    contentType: headerValue(headers, ['content-type']),
    contentLength: headerValue(headers, ['content-length']),
    retryAfter: headerValue(headers, ['retry-after']),
    rateLimit: headerValue(headers, ['ratelimit-limit', 'x-ratelimit-limit']),
    rateRemaining: headerValue(headers, ['ratelimit-remaining', 'x-ratelimit-remaining']),
    rateReset: headerValue(headers, ['ratelimit-reset', 'x-ratelimit-reset']),
    requestId: headerValue(headers, ['x-request-id', 'request-id']),
  };
}

export function classifyTransportError(error) {
  const name = sanitizeDiagnosticText(error?.name || 'Error');
  const code = sanitizeDiagnosticText(error?.code || error?.cause?.code || '');
  const message = sanitizeDiagnosticText(error?.message || error?.cause?.message || String(error));
  const timeout = name === 'TimeoutError' || name === 'AbortError' || code === 'UND_ERR_CONNECT_TIMEOUT'
    || /timeout|timed out|aborted/i.test(message);
  return {
    class: timeout ? 'timeout' : 'network_error',
    name,
    code: code || null,
    message,
  };
}

export function summarizeExposedDiagnostics(payload) {
  const candidates = [payload?.diagnostics, payload?.response?.diagnostics, payload?.meta?.diagnostics];
  const diagnostics = candidates.find((item) => item && typeof item === 'object');
  if (!diagnostics) return { available: false, reason: 'public_response_omits_internal_diagnostics' };
  return {
    available: true,
    source: candidates.indexOf(diagnostics) === 0 ? 'payload' : candidates.indexOf(diagnostics) === 1 ? 'response' : 'meta',
    schemaValid: typeof diagnostics.schemaValid === 'boolean' ? diagnostics.schemaValid : null,
    fallbackReason: typeof diagnostics.fallbackReason === 'string' ? sanitizeDiagnosticText(diagnostics.fallbackReason) : null,
    providerErrorClass: typeof diagnostics.providerErrorClass === 'string' ? sanitizeDiagnosticText(diagnostics.providerErrorClass) : null,
    providerErrorCode: typeof diagnostics.providerErrorCode === 'string' ? sanitizeDiagnosticText(diagnostics.providerErrorCode) : null,
  };
}

export function incrementCounter(map, key) {
  map[key] = (map[key] || 0) + 1;
  return map;
}
