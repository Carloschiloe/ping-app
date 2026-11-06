import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { apiClient } from '../api/client';

// "Descargar mis datos": a copy of what the person put into Ping, as a JSON
// file handed to the system share sheet (save to Files, Drive, mail…).
export async function exportMyData(): Promise<void> {
    const data = await apiClient.get('/user/data-export', { timeoutMs: 60_000 });
    const stamp = new Date().toISOString().slice(0, 10);
    const file = new File(Paths.cache, `mis-datos-vorian-${stamp}.json`);
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(data, null, 2));
    if (!(await isAvailableAsync())) throw new Error('Sharing is not available');
    await shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Mis datos de Vorian' });
}
