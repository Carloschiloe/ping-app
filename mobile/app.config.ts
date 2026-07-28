import type { ConfigContext, ExpoConfig } from 'expo/config';
import appJson from './app.json';

const STAGING_PROJECT_REF = 'oonijgmddgyymhrlnvuu';
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

    return {
        ...config,
        ...base,
        name: isStaging ? 'Ping Staging' : 'Ping',
        slug: 'ping',
        scheme: isStaging ? 'ping-staging' : 'ping',
        plugins,
        android: {
            ...base.android,
            package: isStaging ? 'com.carloschiloe.ping.staging' : 'com.carloschiloe.ping',
            versionCode: 1,
            permissions: [],
            blockedPermissions: blockedBetaPermissions,
        },
        extra: {
            ...base.extra,
            appVariant: variant,
            expectedSupabaseProjectRef: isStaging ? STAGING_PROJECT_REF : undefined,
        },
    };
};
