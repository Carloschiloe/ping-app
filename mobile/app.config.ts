import type { ConfigContext, ExpoConfig } from 'expo/config';
import appJson from './app.json';

const STAGING_PROJECT_REF = 'oonijgmddgyymhrlnvuu';
const isPrivateOrLocalHost = (hostname: string) =>
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '10.0.2.2'
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
const blockedBetaPermissions = [
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.READ_CONTACTS',
    'android.permission.WRITE_CONTACTS',
    'android.permission.READ_CALENDAR',
    'android.permission.WRITE_CALENDAR',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_MEDIA_VIDEO',
    'android.permission.READ_MEDIA_AUDIO',
];

export default ({ config }: ConfigContext): ExpoConfig => {
    const variant = process.env.APP_VARIANT === 'production' ? 'production' : 'staging';
    const isStaging = variant === 'staging';
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
        version: isStaging ? '1.0.3' : base.version,
        // Preserve the slug bound to extra.eas.projectId. Staging and
        // production remain separate Android applications through package ID.
        slug: base.slug,
        scheme: isStaging ? 'ping-staging' : 'ping',
        plugins: isStaging ? [...plugins, 'expo-web-browser'] : plugins,
        android: {
            ...base.android,
            package: isStaging ? 'com.carloschiloe.ping.staging' : 'com.carloschiloe.ping',
            versionCode: isStaging ? 4 : 1,
            permissions: [],
            blockedPermissions: blockedBetaPermissions,
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
            expectedSupabaseProjectRef: isStaging ? STAGING_PROJECT_REF : undefined,
        },
    };
};
