import AsyncStorage from '@react-native-async-storage/async-storage';
import { OFFLINE_QUEUE_KEY } from './synchronization';

export async function clearOfflineMessageQueue() {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
}
