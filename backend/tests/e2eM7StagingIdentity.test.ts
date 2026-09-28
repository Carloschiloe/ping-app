import { describe, expect, it } from 'vitest';
import { isReusableIdentityEligible, selectReusableIdentity } from '../scripts/e2e-m7-staging-identity.mjs';

describe('staging E2E reusable identity selection', () => {
  const now = Date.parse('2026-09-28T15:00:00.000Z');

  it('rejects banned and deleted auth users', () => {
    const profile = { id: 'user-1', email: 'ping-beta-e2e-1@example.invalid' };
    expect(isReusableIdentityEligible(profile, { id: 'user-1', banned_until: '2026-09-29T00:00:00.000Z' }, now)).toBe(false);
    expect(isReusableIdentityEligible(profile, { id: 'user-1', deleted_at: '2026-09-27T00:00:00.000Z' }, now)).toBe(false);
  });

  it('accepts an unbanned auth user and an expired ban', () => {
    const profile = { id: 'user-1', email: 'ping-beta-e2e-1@example.invalid' };
    expect(isReusableIdentityEligible(profile, { id: 'user-1', banned_until: null }, now)).toBe(true);
    expect(isReusableIdentityEligible(profile, { id: 'user-1', banned_until: '2026-09-27T00:00:00.000Z' }, now)).toBe(true);
  });

  it('selects the first eligible profile without changing the fixture set', () => {
    const profiles = [
      { id: 'banned', email: 'ping-beta-e2e-banned@example.invalid' },
      { id: 'ready', email: 'ping-beta-e2e-ready@example.invalid' },
    ];
    const selected = selectReusableIdentity(profiles, [
      { id: 'banned', banned_until: '2026-09-29T00:00:00.000Z' },
      { id: 'ready', banned_until: null },
    ], now);
    expect(selected).toEqual(profiles[1]);
  });
});
