import type { ConfigContext, ExpoConfig } from 'expo/config';
import appJson from './app.json';

const STAGING_PROJECT_REF = 'oonijgmddgyymhrlnvuu';
const EAS_PROJECT_ID = '0baf032d-de1a-49e7-9181-a5897927fb11';
const isPrivateOrLocalHost = (hostname: string) =>
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '10.0.2.2'
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
const blockedBetaPermissions = [
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.WRITE_CONTACTS',
    'android.permission.READ_CALENDAR',
    'android.permission.WRITE_CALENDAR',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_MEDIA_VIDEO',
    'android.permission.READ_MEDIA_AUDIO',
    'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
];

export default ({ config }: ConfigContext): ExpoConfig => {
    const variant = process.env.APP_VARIANT === 'staging' ? 'staging' : 'production';
    const isStaging = variant === 'staging';
    const m8LiveVoiceEnabled = process.env.EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED === 'true';
    const base = appJson.expo as ExpoConfig;
    const plugins = (base.plugins || []).filter((plugin) => {
        const name = Array.isArray(plugin) ? plugin[0] : plugin;
        return name !== 'expo-camera';
    });

    if (isStaging && process.env.EXPO_PUBLIC_SUPABASE_PROJECT_REF
        && process.env.EXPO_PUBLIC_SUPABASE_PROJECT_REF !== STAGING_PROJECT_REF) {
        throw new Error(`Staging builds must use Supabase ${STAGING_PROJECT_REF}`);
    }
    if (isStaging && process.env.EAS_BUILD === 'true') {
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const apiUrl = process.env.EXPO_PUBLIC_API_URL;
        if (!supabaseUrl || new URL(supabaseUrl).hostname !== `${STAGING_PROJECT_REF}.supabase.co`) {
            throw new Error(`Staging EAS builds must use Supabase ${STAGING_PROJECT_REF}`);
        }
        if (!apiUrl) {
            throw new Error('Staging EAS builds require EXPO_PUBLIC_API_URL');
        }
        const parsedApiUrl = new URL(apiUrl);
        if (parsedApiUrl.protocol !== 'https:' || isPrivateOrLocalHost(parsedApiUrl.hostname)) {
            throw new Error('Staging EAS builds require a public HTTPS staging backend');
        }
    }

    return {
        ...config,
        ...base,
        name: isStaging ? 'Ping Staging' : 'Ping',
        version: isStaging ? '1.0.3' : '1.0.2',
        runtimeVersion: { policy: 'appVersion' },
        updates: {
            url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
            checkAutomatically: 'ON_LOAD',
            fallbackToCacheTimeout: 0,
        },
        // Preserve the slug bound to extra.eas.projectId. Staging and
        // production remain separate Android applications through package ID.
        slug: base.slug,
        scheme: isStaging ? 'ping-staging' : 'ping',
        plugins: [
            ...plugins,
            ['expo-media-library', {
                // Ping only writes an explicitly selected image/video to the
                // device gallery. It never needs to read the user's library.
                granularPermissions: [],
                photosPermission: false,
                savePhotosPermission: 'Ping necesita permiso para guardar el archivo que elegiste.',
            }],
            ...(isStaging ? ['expo-web-browser'] : []),
        ],
        android: {
            ...base.android,
            package: isStaging ? 'com.carloschiloe.ping.staging' : 'com.carloschiloe.ping',
            versionCode: isStaging ? 4 : 7,
            // Contacts and camera are read/capture capabilities used by the
            // product. Media selection itself uses Android's system picker and
            // must not request READ_MEDIA_* permissions.
            permissions: [
                'android.permission.CAMERA',
                'android.permission.READ_CONTACTS',
                ...(m8LiveVoiceEnabled ? [
                    'android.permission.RECORD_AUDIO',
                    'android.permission.MODIFY_AUDIO_SETTINGS',
                ] : []),
            ],
            blockedPermissions: [
                ...(m8LiveVoiceEnabled
                    ? blockedBetaPermissions.filter((permission) =>
                        permission !== 'android.permission.RECORD_AUDIO'
                        && permission !== 'android.permission.MODIFY_AUDIO_SETTINGS')
                    : blockedBetaPermissions),
                ...(m8LiveVoiceEnabled ? ['android.permission.WRITE_CONTACTS'] : []),
            ],
        },
        ios: {
            ...base.ios,
            ...(isStaging ? {
                bundleIdentifier: 'com.carloschiloe.ping.staging',
                buildNumber: '4',
            } : {}),
        },
        extra: {
            ...base.extra,
            appVariant: variant,
            buildLabel: isStaging ? 'STAGING 1.0.3 (4) · AUTH UI V1' : undefined,
            m8LiveVoiceEnabled,
            expectedSupabaseProjectRef: isStaging ? STAGING_PROJECT_REF : undefined,
        },
    };
};
