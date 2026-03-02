import { supabase } from '../lib/supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

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
        const response = await fetch(`${API_URL}${endpoint}`, { headers });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Error GET ${endpoint}`);
        }
        return response.json();
    },
    post: async (endpoint: string, body: any) => {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Error POST ${endpoint}`);
        }
        return response.json();
    },
    patch: async (endpoint: string, body: any) => {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Error PATCH ${endpoint}`);
        }
        return response.json();
    },
    delete: async (endpoint: string) => {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'DELETE',
            headers,
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Error DELETE ${endpoint}`);
        }
        return response.json();
    }
};
