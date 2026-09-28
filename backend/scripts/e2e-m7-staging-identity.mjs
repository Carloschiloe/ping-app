export function isReusableIdentityEligible(profile, authUser, now = Date.now()) {
  if (!profile?.id || !profile?.email || !authUser || authUser.id !== profile.id) return false;
  if (authUser.deleted_at) return false;

  const bannedUntil = authUser.banned_until;
  if (!bannedUntil || bannedUntil === 'none') return true;

  const expiry = Date.parse(bannedUntil);
  return Number.isFinite(expiry) && expiry <= now;
}

export function selectReusableIdentity(profiles, authUsers, now = Date.now()) {
  const usersById = new Map((authUsers ?? []).map((user) => [user?.id, user]));
  return (profiles ?? []).find((profile) => (
    isReusableIdentityEligible(profile, usersById.get(profile?.id), now)
  )) ?? null;
}
