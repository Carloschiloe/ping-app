import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { apiClient } from '../api/client';

// Tells the owner's admin panel which phone the app runs on and what failed
// inside it. A random id kept on the phone tells installs apart; never a
// hardware id, and never what the person wrote.

const INSTALL_KEY = 'vorian.install-id';
const MAX_REPORTS_PER_RUN = 5;

let installId: Promise<string> | null = null;
let greetedUserId: string | null = null;
const reported = new Set<string>();

function randomId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 24; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

export function getInstallId(): Promise<string> {
    installId ??= AsyncStorage.getItem(INSTALL_KEY)
        .then(async (saved) => {
            if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved;
            const fresh = randomId();
            await AsyncStorage.setItem(INSTALL_KEY, fresh);
            return fresh;
        })
        .catch(() => randomId());
    return installId;
}

function platformName(): 'android' | 'ios' | 'web' | 'other' {
    return Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web' ? Platform.OS : 'other';
}

function appVersion(): string | null {
    return Constants.expoConfig?.version ?? null;
}

/** Once per signed-in person per app run. Never blocks or fails the app. */
export async function sayHello(userId: string): Promise<void> {
    if (greetedUserId === userId) return;
    greetedUserId = userId;
    try {
        await apiClient.post('/app/hello', {
            installId: await getInstallId(),
            platform: platformName(),
            appVersion: appVersion(),
            osVersion: String(Platform.Version ?? '').slice(0, 40) || null,
        });
    } catch {
        greetedUserId = null;
    }
}

/** Reports a crash or failure, a few per app run, each kind once. */
export function reportAppError(error: unknown, location?: string): void {
    const err = error as { name?: string; message?: string; stack?: string } | undefined;
    const title = `${err?.name && err.name !== 'Error' ? `${err.name}: ` : ''}${err?.message || String(error) || 'Error'}`.slice(0, 200);
    const key = `${location ?? ''}|${title}`;
    if (reported.has(key) || reported.size >= MAX_REPORTS_PER_RUN) return;
    reported.add(key);
    void apiClient.post('/app/errors', {
        title,
        detail: err?.stack ? err.stack.split('\n').slice(0, 8).join('\n').slice(0, 2000) : null,
        location: location ?? null,
        appVersion: appVersion(),
        platform: platformName(),
    }).catch(() => undefined);
}

/** Sends crashes the app could not handle, then lets them continue as before. */
export function installCrashReporter(): void {
    const errorUtils = (globalThis as any).ErrorUtils;
    if (!errorUtils?.getGlobalHandler || (globalThis as any).__vorianCrashReporter) return;
    (globalThis as any).__vorianCrashReporter = true;
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
        reportAppError(error, isFatal ? 'Cierre inesperado' : 'Error en la app');
        previous?.(error, isFatal);
    });
}
