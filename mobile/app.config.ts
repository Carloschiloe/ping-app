import type { ConfigContext, ExpoConfig } from 'expo/config';
import appJson from './app.json';

const EAS_PROJECT_ID = '0baf032d-de1a-49e7-9181-a5897927fb11';
const blockedPermissions = [
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.WRITE_CONTACTS',
    'android.permission.READ_CALENDAR',
    'android.permission.WRITE_CALENDAR',
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_MEDIA_VIDEO',
    'android.permission.READ_MEDIA_AUDIO',
    'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
];

export default ({ config }: ConfigContext): ExpoConfig => {
    const m8LiveVoiceEnabled = process.env.EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED === 'true';
    const base = appJson.expo as ExpoConfig;
    const plugins = (base.plugins || []).filter((plugin) => {
        const name = Array.isArray(plugin) ? plugin[0] : plugin;
        return name !== 'expo-camera';
    });

    return {
        ...config,
        ...base,
        name: 'Ping',
        version: '1.0.3',
        runtimeVersion: { policy: 'appVersion' },
        updates: {
            url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
            checkAutomatically: 'ON_LOAD',
            fallbackToCacheTimeout: 0,
        },
        slug: base.slug,
        scheme: 'ping',
        plugins: [
            ...plugins,
            ['expo-media-library', {
                // Ping only writes an explicitly selected image/video to the
                // device gallery. It never needs to read the user's library.
                granularPermissions: [],
                photosPermission: false,
                savePhotosPermission: 'Ping necesita permiso para guardar el archivo que elegiste.',
            }],
            './plugins/withRequiredMicrophonePermission',
        ],
        android: {
            ...base.android,
            package: 'com.carloschiloe.ping',
            // Native permission changes require a real Android update. Keep
            // the production version code monotonic so the final APK can be
            // installed over the current production baseline.
            versionCode: 17,
            // Contacts and camera are read/capture capabilities used by the
            // product. Media selection itself uses Android's system picker and
            // must not request READ_MEDIA_* permissions.
            // Microphone access is a core capability of the installed app:
            // chat audio recording and Ping Voz both use it. It must be part
            // of every production manifest; an OTA update cannot add a new
            // Android permission to an already-installed APK.
            permissions: [
                'android.permission.CAMERA',
                'android.permission.READ_CONTACTS',
                'android.permission.RECORD_AUDIO',
                'android.permission.MODIFY_AUDIO_SETTINGS',
                'android.permission.POST_NOTIFICATIONS',
                'android.permission.ACCESS_FINE_LOCATION',
                'android.permission.ACCESS_COARSE_LOCATION',
            ],
            blockedPermissions: [
                ...blockedPermissions.filter((permission) =>
                    permission !== 'android.permission.RECORD_AUDIO'
                    && permission !== 'android.permission.MODIFY_AUDIO_SETTINGS'),
            ],
        },
        ios: {
            ...base.ios,
        },
        extra: {
            ...base.extra,
            // Expo Go does not load the EAS profile env block. Keep the main
            // Ping voice capability visible there while preserving an
            // explicit false value for builds that intentionally disable it.
            m8LiveVoiceEnabled: m8LiveVoiceEnabled || process.env.EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED === undefined,
        },
    };
};
