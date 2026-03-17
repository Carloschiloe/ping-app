import { supabase } from '../lib/supabase';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!configuredApiUrl && !__DEV__) {
    throw new Error('EXPO_PUBLIC_API_URL is required in production');
}

export const API_URL = configuredApiUrl || 'http://localhost:3000/api';

export const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
    };
};

export const apiClient = {
    get: async (endpoint: string) => {
        const headers = await getAuthHeaders();
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${API_URL.replace(/\/$/, '')}${cleanEndpoint}`;
        const response = await fetch(url, { headers });
        const responseText = await response.text();
        if (!response.ok) {
            throw new Error(`Error GET ${url} (${response.status})`);
        }
        try {
            return JSON.parse(responseText);
        } catch (e) {
            throw new Error('El servidor devolvió un formato inválido (no JSON).');
        }
    },
    delete: async (endpoint: string) => {
        const headers = await getAuthHeaders();
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${API_URL.replace(/\/$/, '')}${cleanEndpoint}`;
        const response = await fetch(url, { method: 'DELETE', headers });
        if (!response.ok) {
            throw new Error(`Error DELETE ${url} (${response.status})`);
        }
        return response.json().catch(() => ({ ok: true }));
    },
    post: async (endpoint: string, body: any) => {
        const headers = await getAuthHeaders();
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${API_URL.replace(/\/$/, '')}${cleanEndpoint}`;
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        const responseText = await response.text();

        if (!response.ok) {
            let errorMsg = `Error POST ${url} (${response.status})`;
            try {
                const errorJson = JSON.parse(responseText);
                errorMsg = errorJson.error || errorMsg;
            } catch (e) { }
            throw new Error(errorMsg);
        }

        try {
            return JSON.parse(responseText);
        } catch {
            throw new Error('El servidor devolvió un formato inválido (no JSON).');
        }
    },
    patch: async (endpoint: string, body: any) => {
        const headers = await getAuthHeaders();
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${API_URL.replace(/\/$/, '')}${cleanEndpoint}`;
        const response = await fetch(url, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Error PATCH ${url}`);
        }
        return response.json();
    },
};
