import { useQuery } from '@tanstack/react-query';
import { resolvePrivateFileUrl } from '../lib/privateFiles';

const AVATAR_URL_FRESH_MS = 45_000;
const AVATAR_URL_CACHE_MS = 60_000;

export function useProfileAvatarUrl(
    profileId?: string | null,
    legacyAvatarUrl?: string | null
) {
    const privateAvatar = useQuery({
        queryKey: ['private-profile-avatar', profileId],
        queryFn: () => resolvePrivateFileUrl('profile', profileId!),
        enabled: Boolean(profileId) && !legacyAvatarUrl,
        retry: false,
        staleTime: AVATAR_URL_FRESH_MS,
        gcTime: AVATAR_URL_CACHE_MS,
        refetchOnWindowFocus: false,
    });

    return legacyAvatarUrl || privateAvatar.data?.signedUrl || null;
}


export async function getFreshProfileAvatarUrl(
    profileId?: string | null,
    legacyAvatarUrl?: string | null
) {
    if (legacyAvatarUrl) return legacyAvatarUrl;
    if (!profileId) return null;

    try {
        const { signedUrl } = await resolvePrivateFileUrl('profile', profileId);
        return signedUrl;
    } catch {
        return null;
    }
}
