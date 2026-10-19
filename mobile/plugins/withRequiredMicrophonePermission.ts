import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';

/**
 * Expo's declarative permission list and expo-audio both normally contribute
 * RECORD_AUDIO. Keep this final manifest guard because Android Settings only
 * exposes a permission that is physically present in the installed APK.
 */
const withRequiredMicrophonePermission: ConfigPlugin = (config) => withAndroidManifest(
    config,
    (manifestConfig) => {
        const permissions = manifestConfig.modResults.manifest['uses-permission'] || [];
        const alreadyDeclared = permissions.some((permission) =>
            permission?.$?.['android:name'] === 'android.permission.RECORD_AUDIO'
        );

        if (!alreadyDeclared) {
            permissions.push({
                $: { 'android:name': 'android.permission.RECORD_AUDIO' },
            });
        }

        manifestConfig.modResults.manifest['uses-permission'] = permissions;
        return manifestConfig;
    },
);

export default withRequiredMicrophonePermission;
