export const MEDIA_UPLOADS_ENABLED = false;

export async function uploadToSupabase(uri: string, bucket: string, mimeType: string, filenameOverride?: string): Promise<string | null> {
    void uri;
    void bucket;
    void mimeType;
    void filenameOverride;
    console.warn('[Upload] Media uploads are temporarily disabled pending private Storage authorization');
    return null;
}
