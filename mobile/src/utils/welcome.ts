import AsyncStorage from '@react-native-async-storage/async-storage';

// The three welcome pages show once per person on this phone, right after
// the account is ready and before Ping asks for any permission.

const keyFor = (userId: string) => `ping.welcome.v3:${userId}`;

export async function hasSeenWelcome(userId: string): Promise<boolean> {
    try {
        return (await AsyncStorage.getItem(keyFor(userId))) === 'seen';
    } catch {
        // If storage can't be read, don't block the app behind the welcome.
        return true;
    }
}

export async function markWelcomeSeen(userId: string): Promise<void> {
    try {
        await AsyncStorage.setItem(keyFor(userId), 'seen');
    } catch {
        // Seeing it again next time is harmless.
    }
}
