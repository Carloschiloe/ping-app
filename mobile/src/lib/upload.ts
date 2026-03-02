import { supabase } from './supabase';

export async function uploadToSupabase(uri: string, bucket: string, mimeType: string, filenameOverride?: string): Promise<string | null> {
    try {
        let ext = 'bin';
        if (mimeType.includes('audio')) ext = 'm4a';
        else if (mimeType.includes('video')) ext = 'mp4';
        else if (mimeType.includes('image')) ext = 'jpg';
        else if (filenameOverride) {
            const parts = filenameOverride.split('.');
            if (parts.length > 1) ext = parts[parts.length - 1];
        } else {
            const parts = uri.split('.');
            if (parts.length > 1) ext = parts[parts.length - 1];
        }

        const path = filenameOverride ? `${Date.now()}_${filenameOverride.replace(/\s+/g, '_')}` : `${Date.now()}.${ext}`;

        // React Native compatible upload using FormData
        const formData = new FormData();
        formData.append('file', { uri, name: path, type: mimeType } as any);

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

        const res = await fetch(
            `${supabaseUrl}/storage/v1/object/${bucket}/${path}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-upsert': 'true',
                },
                body: formData,
            }
        );

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Upload failed: ${err}`);
        }

        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
    } catch (e) {
        console.error('[Upload]', e);
        return null;
    }
}
