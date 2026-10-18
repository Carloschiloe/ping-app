// Keep unit-test imports deterministic without weakening production startup
// validation. Integration tests may provide their own environment variables
// before invoking Vitest; these defaults are intentionally non-routable.
process.env.NODE_ENV ??= 'test';
// Keep the application environment semantics used by local architecture
// tests. NODE_ENV=test already identifies this as a test process; changing
// PING_ENVIRONMENT would silently disable the explicit local durable-agent
// paths those tests are meant to exercise.
process.env.PING_ENVIRONMENT ??= 'local';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.ENCRYPTION_KEY ??= 'test-encryption-key-0123456789012345';

// Never let a developer or CI machine's ambient OpenAI credential turn a
// unit-test run into a networked/provider-dependent run. A test that truly
// needs a live provider must opt in explicitly and remain outside the
// default deterministic suite.
if (process.env.PING_ALLOW_LIVE_PROVIDER_TESTS !== 'true') {
    process.env.OPENAI_API_KEY = '';
}
