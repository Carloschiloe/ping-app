import { vi } from 'vitest';

// Mock minimo y controlado del cliente fluido de supabase-js, suficiente
// para los servicios que esta fase toca (mensajes, conversaciones,
// participantes, autorizacion). No se conecta a ninguna base real.
//
// `queue` mapea nombre de tabla -> lista de respuestas { data, error, count }
// que se van entregando EN ORDEN cada vez que el codigo bajo prueba llama
// `.from(tabla)`. Si se agota la cola de una tabla, se repite la ultima
// respuesta configurada.
export function createSupabaseAdminMock(queue: Record<string, any[]>) {
    const cursors: Record<string, number> = {};
    const inserts: Record<string, any[]> = {};
    const updates: Record<string, any[]> = {};
    const eqCalls: Record<string, Array<[string, any]>> = {};
    const selectCalls: Record<string, any[]> = {};
    const orCalls: Record<string, string[]> = {};
    const textSearchCalls: Record<string, Array<[string, string, any]>> = {};
    const rpcCalls: Array<{ name: string; args: any }> = [];
    const rpcCursors: Record<string, number> = {};

    const from = vi.fn((table: string) => {
        const tableQueue = queue[table] || [];
        const idx = cursors[table] || 0;
        cursors[table] = idx + 1;
        const resolveValue = tableQueue[idx] ?? tableQueue[tableQueue.length - 1] ?? { data: null, error: null };

        const chain: any = {
            select: vi.fn((columns?: any) => {
                (selectCalls[table] = selectCalls[table] || []).push(columns);
                return chain;
            }),
            insert: vi.fn((payload: any) => {
                (inserts[table] = inserts[table] || []).push(payload);
                return chain;
            }),
            update: vi.fn((payload: any) => {
                (updates[table] = updates[table] || []).push(payload);
                return chain;
            }),
            delete: vi.fn(() => chain),
            eq: vi.fn((column: string, value: any) => {
                (eqCalls[table] = eqCalls[table] || []).push([column, value]);
                return chain;
            }),
            neq: vi.fn(() => chain),
            in: vi.fn(() => chain),
            or: vi.fn((filter: string) => {
                (orCalls[table] = orCalls[table] || []).push(filter);
                return chain;
            }),
            textSearch: vi.fn((column: string, query: string, options?: any) => {
                (textSearchCalls[table] = textSearchCalls[table] || []).push([column, query, options]);
                return chain;
            }),
            is: vi.fn(() => chain),
            not: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            range: vi.fn(() => chain),
            ilike: vi.fn(() => chain),
            gte: vi.fn(() => chain),
            lte: vi.fn(() => chain),
            gt: vi.fn(() => chain),
            lt: vi.fn(() => chain),
            single: vi.fn(() => Promise.resolve(resolveValue)),
            maybeSingle: vi.fn(() => Promise.resolve(resolveValue)),
            then: (resolve: any, reject?: any) => Promise.resolve(resolveValue).then(resolve, reject),
        };
        return chain;
    });

    return {
        from,
        rpc: vi.fn((name: string, args: any) => {
            rpcCalls.push({ name, args });
            const rpcQueue = queue[`rpc:${name}`] || [];
            const idx = rpcCursors[name] || 0;
            rpcCursors[name] = idx + 1;
            return Promise.resolve(
                rpcQueue[idx]
                ?? rpcQueue[rpcQueue.length - 1]
                ?? { data: null, error: null }
            );
        }),
        // Helpers de inspeccion para aserciones en los tests.
        getInsertCalls: (table: string) => inserts[table] || [],
        getUpdateCalls: (table: string) => updates[table] || [],
        getEqCalls: (table: string) => eqCalls[table] || [],
        getSelectCalls: (table: string) => selectCalls[table] || [],
        getOrCalls: (table: string) => orCalls[table] || [],
        getTextSearchCalls: (table: string) => textSearchCalls[table] || [],
        getCalledTables: () => from.mock.calls.map((c: any[]) => c[0]),
        getRpcCalls: () => rpcCalls,
    };
}

// Patron de delegado mutable: vi.mock se registra UNA vez por archivo de
// test (hoisted por vitest), pero cada test necesita su propia
// configuracion de respuestas. Se crea un mock "vacio" en el modulo y cada
// test reemplaza `current` con una instancia fresca via setSupabaseAdminMock.
let current = createSupabaseAdminMock({});
let currentStorage: any = {
    from: vi.fn(() => ({
        createSignedUrl: vi.fn(),
        createSignedUploadUrl: vi.fn(),
    })),
};

export function setSupabaseAdminMock(mock: ReturnType<typeof createSupabaseAdminMock>) {
    current = mock;
}

export function setSupabaseStorageMock(mock: any) {
    currentStorage = mock;
}

export function createSupabaseStorageMock(options: {
    read?: { data: any; error: any };
    upload?: { data: any; error: any };
    list?: { data: any; error: any };
    download?: { data: any; error: any };
} = {}) {
    const createSignedUrl = vi.fn(() => Promise.resolve(
        options.read ?? { data: { signedUrl: 'https://signed.invalid/read' }, error: null }
    ));
    const createSignedUploadUrl = vi.fn(() => Promise.resolve(
        options.upload ?? {
            data: { signedUrl: 'https://signed.invalid/upload', token: 'temporary-token' },
            error: null,
        }
    ));
    const list = vi.fn(() => Promise.resolve(
        options.list ?? {
            data: [{
                name: 'evidence.pdf',
                metadata: { size: 128, mimetype: 'application/pdf' },
            }],
            error: null,
        }
    ));
    const download = vi.fn(() => Promise.resolve(
        options.download ?? {
            data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/m4a' }),
            error: null,
        }
    ));
    const from = vi.fn(() => ({ createSignedUrl, createSignedUploadUrl, list, download }));
    return { from, createSignedUrl, createSignedUploadUrl, list, download };
}

export function supabaseAdminMockModule() {
    return {
        supabaseAdmin: {
            from: (...args: any[]) => current.from(...args),
            rpc: (...args: any[]) => current.rpc(...args),
            storage: {
                from: (...args: any[]) => currentStorage.from(...args),
            },
        },
    };
}
