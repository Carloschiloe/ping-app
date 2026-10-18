import type { ConfigContext, ExpoConfig } from 'expo/config';
import appJson from './app.json';

const EAS_PROJECT_ID = '0baf032d-de1a-49e7-9181-a5897927fb11';
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
    const m8LiveVoiceEnabled = process.env.EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED === 'true';
    const base = appJson.expo as ExpoConfig;
    const plugins = (base.plugins || []).filter((plugin) => {
        const name = Array.isArray(plugin) ? plugin[0] : plugin;
        return name !== 'expo-camera';
    });

    return {
        ...config,
        ...base,
        name: isStaging ? 'Ping Staging' : 'Ping',
        version: isStaging ? '1.0.3' : '1.0.1',
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
        plugins: isStaging ? [...plugins, 'expo-web-browser'] : plugins,
        android: {
            ...base.android,
            package: isStaging ? 'com.carloschiloe.ping.staging' : 'com.carloschiloe.ping',
            versionCode: isStaging ? 4 : 6,
            permissions: m8LiveVoiceEnabled
                ? [
                    'android.permission.RECORD_AUDIO',
                    'android.permission.MODIFY_AUDIO_SETTINGS',
                    'android.permission.READ_CONTACTS',
                    'android.permission.WRITE_CONTACTS',
                ]
                : [],
            blockedPermissions: m8LiveVoiceEnabled
                ? blockedBetaPermissions.filter((permission) =>
                    permission !== 'android.permission.RECORD_AUDIO'
                    && permission !== 'android.permission.MODIFY_AUDIO_SETTINGS'
                    && permission !== 'android.permission.READ_CONTACTS'
                    && permission !== 'android.permission.WRITE_CONTACTS')
                : blockedBetaPermissions,
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
        },
    };
};
