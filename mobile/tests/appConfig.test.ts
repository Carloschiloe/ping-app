// PING — MOBILE ATTACHMENT POLICY CONSUMPTION (final): getAppConfig() is
// mobile's ONLY way to know the message-attachment size limit. There is NO
// second, locally-invented numeric maximum anywhere in this module — when
// no value has ever been successfully fetched, the policy is explicitly
// "unknown" (maxMessageAttachmentBytes: null), never a guessed number like
// 50MB. Cache freshness is TTL-based (CACHE_TTL_MS): a fresh cached value
// is served with zero network calls; once stale, the next call revalidates
// and awaits the result before resolving. A failed revalidation NEVER
// overwrites a valid last-known-good cache. The backend/Storage post-upload
// verification remains authoritative regardless of what this module ever
// returns — a stale, unknown, or wrong-in-mobile's-favor value can only
// ever affect a LOCAL preflight message, never what the backend actually
// accepts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const get = vi.fn();
vi.mock('../src/api/client', () => ({
    apiClient: { get: (...args: unknown[]) => get(...args) },
}));

import { clearAppConfigCache, getAppConfig, getCachedMaxMessageAttachmentBytes } from '../src/lib/appConfig';

describe('appConfig.ts source — no hardcoded numeric attachment-size fallback', () => {
    it('no contiene un segundo máximo de adjuntos definido localmente (ej. 50MB) en el código fuente', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'lib', 'appConfig.ts'),
            'utf-8'
        );

        // No debe existir ninguna constante numérica en bytes que represente
        // un máximo de adjunto (52428800, 50 * 1024 * 1024, etc.) — sólo el
        // TTL de cache (un intervalo de tiempo, no un tamaño de archivo) y
        // el valor real recibido de la red pueden aparecer.
        expect(src).not.toMatch(/52428800/);
        expect(src).not.toMatch(/50\s*\*\s*1024\s*\*\s*1024/);
        expect(src).not.toMatch(/FALLBACK.*MAX.*BYTES/i);
        expect(src).not.toMatch(/CONSERVATIVE.*FALLBACK.*BYTES/i);
    });
});

describe('appConfig — fetch/cache/freshness/fallback contract', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearAppConfigCache();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // (2) first successful fetch supplies policy
    it('la primera consulta exitosa entrega el valor real del backend', async () => {
        get.mockResolvedValue({ limits: { maxMessageAttachmentBytes: 52428800 } });

        const config = await getAppConfig();

        expect(config.limits.maxMessageAttachmentBytes).toBe(52428800);
        expect(get).toHaveBeenCalledWith('/config');
    });

    // (3) cached value used while fresh
    it('mientras el cache está fresco (dentro del TTL), no se vuelve a consultar la red', async () => {
        get.mockResolvedValue({ limits: { maxMessageAttachmentBytes: 52428800 } });
        await getAppConfig();

        await vi.advanceTimersByTimeAsync(60_000); // 1 min < TTL
        const config = await getAppConfig();

        expect(config.limits.maxMessageAttachmentBytes).toBe(52428800);
        expect(get).toHaveBeenCalledTimes(1);
    });

    // (4) stale value triggers revalidation
    it('una vez vencido el TTL, la siguiente consulta SÍ revalida contra la red', async () => {
        get.mockResolvedValue({ limits: { maxMessageAttachmentBytes: 52428800 } });
        await getAppConfig();
        expect(get).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(6 * 60 * 1000); // > TTL (5 min)
        await getAppConfig();

        expect(get).toHaveBeenCalledTimes(2);
    });

    // (5) failed revalidation retains last-known-good
    it('si la revalidación tras vencer el TTL falla, se conserva el último valor válido conocido (no se pierde ni se reemplaza por uno inventado)', async () => {
        get.mockResolvedValueOnce({ limits: { maxMessageAttachmentBytes: 52428800 } });
        await getAppConfig();

        await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
        get.mockRejectedValueOnce(new Error('Network request failed'));
        const config = await getAppConfig();

        expect(config.limits.maxMessageAttachmentBytes).toBe(52428800);
    });

    it('una respuesta malformada durante la revalidación tampoco reemplaza el último valor válido conocido', async () => {
        get.mockResolvedValueOnce({ limits: { maxMessageAttachmentBytes: 52428800 } });
        await getAppConfig();

        await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
        get.mockResolvedValueOnce({ unexpected: 'shape' });
        const config = await getAppConfig();

        expect(config.limits.maxMessageAttachmentBytes).toBe(52428800);
    });

    // (6) no prior value + fetch failure => policy unknown, no false local rejection
    it('sin valor previo y con la consulta fallando, la política es explícitamente desconocida (null), nunca un número inventado', async () => {
        get.mockRejectedValue(new Error('Network request failed'));

        const config = await getAppConfig();

        expect(config.limits.maxMessageAttachmentBytes).toBeNull();
    });

    it('sin valor previo y con una respuesta malformada, la política también es desconocida (null)', async () => {
        get.mockResolvedValue({ unexpected: 'shape' });

        const config = await getAppConfig();

        expect(config.limits.maxMessageAttachmentBytes).toBeNull();
    });

    it('llamadas concurrentes antes de que resuelva la primera comparten un único fetch en curso', async () => {
        let resolveGet: (value: unknown) => void;
        get.mockReturnValue(new Promise((resolve) => { resolveGet = resolve; }));

        const first = getAppConfig();
        const second = getAppConfig();
        resolveGet!({ limits: { maxMessageAttachmentBytes: 52428800 } });
        await Promise.all([first, second]);

        expect(get).toHaveBeenCalledTimes(1);
    });

    it('forceRefresh revalida incluso con cache todavía fresco', async () => {
        get.mockResolvedValue({ limits: { maxMessageAttachmentBytes: 52428800 } });
        await getAppConfig();

        await getAppConfig({ forceRefresh: true });

        expect(get).toHaveBeenCalledTimes(2);
    });

    // (7) changed backend policy is eventually consumed
    it('un cambio real de política en el backend se termina reflejando tras vencer el TTL (revalidación eventual, no instantánea)', async () => {
        get.mockResolvedValueOnce({ limits: { maxMessageAttachmentBytes: 52428800 } });
        const first = await getAppConfig();
        expect(first.limits.maxMessageAttachmentBytes).toBe(52428800);

        // Backend cambia la política mientras el cache mobile sigue fresco:
        // dentro del TTL, mobile NO debe verlo todavía (fetch wasteful
        // evitado, no cada render).
        get.mockResolvedValueOnce({ limits: { maxMessageAttachmentBytes: 104857600 } });
        await vi.advanceTimersByTimeAsync(60_000);
        const stillCached = await getAppConfig();
        expect(stillCached.limits.maxMessageAttachmentBytes).toBe(52428800);
        expect(get).toHaveBeenCalledTimes(1);

        // Tras vencer el TTL, la siguiente consulta revalida y adopta el
        // nuevo valor real.
        await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
        const updated = await getAppConfig();
        expect(updated.limits.maxMessageAttachmentBytes).toBe(104857600);
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('getCachedMaxMessageAttachmentBytes es síncrono, nunca dispara red, y es null hasta el primer fetch exitoso', async () => {
        expect(getCachedMaxMessageAttachmentBytes()).toBeNull();
        expect(get).not.toHaveBeenCalled();

        get.mockResolvedValue({ limits: { maxMessageAttachmentBytes: 99999 } });
        await getAppConfig();

        expect(getCachedMaxMessageAttachmentBytes()).toBe(99999);
    });
});
