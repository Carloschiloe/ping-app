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
    const rpcCalls: Array<{ name: string; args: any }> = [];

    const from = vi.fn((table: string) => {
        const tableQueue = queue[table] || [];
        const idx = cursors[table] || 0;
        cursors[table] = idx + 1;
        const resolveValue = tableQueue[idx] ?? tableQueue[tableQueue.length - 1] ?? { data: null, error: null };

        const chain: any = {
            select: vi.fn(() => chain),
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
            or: vi.fn(() => chain),
            is: vi.fn(() => chain),
            not: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            range: vi.fn(() => chain),
            ilike: vi.fn(() => chain),
            gte: vi.fn(() => chain),
            lte: vi.fn(() => chain),
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
            return Promise.resolve(rpcQueue[0] ?? { data: null, error: null });
        }),
        // Helpers de inspeccion para aserciones en los tests.
        getInsertCalls: (table: string) => inserts[table] || [],
        getUpdateCalls: (table: string) => updates[table] || [],
        getEqCalls: (table: string) => eqCalls[table] || [],
        getCalledTables: () => from.mock.calls.map((c: any[]) => c[0]),
        getRpcCalls: () => rpcCalls,
    };
}

// Patron de delegado mutable: vi.mock se registra UNA vez por archivo de
// test (hoisted por vitest), pero cada test necesita su propia
// configuracion de respuestas. Se crea un mock "vacio" en el modulo y cada
// test reemplaza `current` con una instancia fresca via setSupabaseAdminMock.
let current = createSupabaseAdminMock({});
let currentStorage = {
    from: vi.fn(() => ({
        createSignedUrl: vi.fn(),
        createSignedUploadUrl: vi.fn(),
    })),
};

export function setSupabaseAdminMock(mock: ReturnType<typeof createSupabaseAdminMock>) {
    current = mock;
}

export function setSupabaseStorageMock(mock: typeof currentStorage) {
    currentStorage = mock;
}

export function createSupabaseStorageMock(options: {
    read?: { data: any; error: any };
    upload?: { data: any; error: any };
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
    const from = vi.fn(() => ({ createSignedUrl, createSignedUploadUrl }));
    return { from, createSignedUrl, createSignedUploadUrl };
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
