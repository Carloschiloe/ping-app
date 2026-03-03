import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
console.warn(`[DEBUG] API_URL: ${API_URL}`);

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
        const url = `${API_URL}${endpoint}`;
        console.log(`[apiClient] POST ${url}`, body);
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        const responseText = await response.text();
        console.log(`[apiClient] Response Status: ${response.status}`);
        // console.log(`[apiClient] Response Body: ${responseText.substring(0, 200)}...`);

        if (!response.ok) {
            let errorMsg = `Error POST ${endpoint} (${response.status})`;
            try {
                const errorJson = JSON.parse(responseText);
                errorMsg = errorJson.error || errorMsg;
            } catch (e) { }
            throw new Error(errorMsg);
        }

        try {
            return JSON.parse(responseText);
        } catch (e: any) {
            console.error(`[apiClient] JSON Parse Error: ${e.message}. Raw: ${responseText.substring(0, 100)}`);
            // Debug Alert to see the HTML error page
            if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html')) {
                Alert.alert('Debug API', `El servidor devolvió HTML (404/500). Comienzo: ${responseText.substring(0, 100)}`);
            }
            throw new Error('El servidor devolvió un formato inválido (no JSON).');
        }
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
