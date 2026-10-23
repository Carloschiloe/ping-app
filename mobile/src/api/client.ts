import { supabase } from '../lib/supabase';

export const API_REQUEST_TIMEOUT_MS = 15_000;
// Agent turns may include durable admission, retrieval, semantic fallback and
// response synthesis. They remain bounded on the backend, but must not share
// the short budget used by ordinary CRUD calls; otherwise a valid answer can
// be cancelled on the device while the server is still processing it.
export const AGENT_TURN_REQUEST_TIMEOUT_MS = 45_000;

export interface ApiRequestOptions {
    timeoutMs?: number;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = API_REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error('Network request timed out');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!configuredApiUrl && !__DEV__) {
    throw new Error('EXPO_PUBLIC_API_URL is required in production');
}

export const API_URL = configuredApiUrl || 'http://localhost:3000/api';

// Screens can mount and revalidate at the same time (for example after a
// realtime event and a navigation focus). Share the same GET promise instead
// of sending duplicate authenticated requests to the API.
const inFlightGetRequests = new Map<string, Promise<unknown>>();

export class ApiError extends Error {
    constructor(
        message: string,
        public readonly status: number | null,
        public readonly resultUnknown: boolean,
        public readonly code?: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
    };
};

export const apiClient = {
    get: async (endpoint: string, options: ApiRequestOptions = {}) => {
        const headers = await getAuthHeaders();
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${API_URL.replace(/\/$/, '')}${cleanEndpoint}`;
        const key = `${url}|${headers.Authorization || ''}`;
        const existingRequest = inFlightGetRequests.get(key);
        if (existingRequest) return existingRequest;

        const request = (async () => {
            const response = await fetchWithTimeout(url, { headers }, options.timeoutMs);
            const responseText = await response.text();
            if (!response.ok) {
                throw new Error(`Error GET ${url} (${response.status})`);
            }
            try {
                return JSON.parse(responseText);
            } catch {
                throw new Error('El servidor devolvió un formato inválido (no JSON).');
            }
        })();

        inFlightGetRequests.set(key, request);
        try {
            return await request;
        } finally {
            if (inFlightGetRequests.get(key) === request) {
                inFlightGetRequests.delete(key);
            }
        }
    },
    delete: async (endpoint: string, options: ApiRequestOptions = {}) => {
        const headers = await getAuthHeaders();
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${API_URL.replace(/\/$/, '')}${cleanEndpoint}`;
        const response = await fetchWithTimeout(url, { method: 'DELETE', headers }, options.timeoutMs);
        if (!response.ok) {
            throw new Error(`Error DELETE ${url} (${response.status})`);
        }
        return response.json().catch(() => ({ ok: true }));
    },
    post: async (
        endpoint: string,
        body: any,
        extraHeaders: Record<string, string> = {},
        options: ApiRequestOptions = {},
    ) => {
        const headers = await getAuthHeaders();
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${API_URL.replace(/\/$/, '')}${cleanEndpoint}`;
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { ...headers, ...extraHeaders },
            body: JSON.stringify(body),
        }, options.timeoutMs);

        const responseText = await response.text();

        if (!response.ok) {
            let errorMsg = `Error POST ${url} (${response.status})`;
            let errorCode: string | undefined;
            try {
                const errorJson = JSON.parse(responseText);
                // Two response shapes exist across the backend: some
                // controllers respond directly with { error: '...' }, while
                // requests that flow through validateRequest/AppError/
                // globalErrorHandler (e.g. Zod validation failures, most
                // AppError throws) respond with { status, message, requestId,
                // errors? }. Only reading `error` silently discarded the
                // second shape's real message/validation detail, collapsing
                // every such failure into the generic fallback below —
                // preserve whichever field the backend actually sent.
                errorMsg = errorJson.message || errorJson.error || errorMsg;
                errorCode = typeof errorJson.failureCode === 'string' ? errorJson.failureCode : undefined;
            } catch { }
            throw new ApiError(errorMsg, response.status, false, errorCode);
        }

        try {
            return JSON.parse(responseText);
        } catch {
            throw new Error('El servidor devolvió un formato inválido (no JSON).');
        }
    },
    patch: async (endpoint: string, body: any, options: ApiRequestOptions = {}) => {
        const headers = await getAuthHeaders();
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${API_URL.replace(/\/$/, '')}${cleanEndpoint}`;
        const response = await fetchWithTimeout(url, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(body),
        }, options.timeoutMs);
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Error PATCH ${url}`);
        }
        return response.json();
    },
};
