import { createClientMessageId } from '../utils/synchronization';

export type CaptureSurface = 'conversation' | 'quick_capture';

export interface CaptureMetadata {
    source: CaptureSurface;
    capturedAt: string;
    initiatedBy: 'user_action';
}

export interface CaptureRequest {
    text: string;
    clientMessageId: string;
    meta: {
        capture: CaptureMetadata;
    };
}

export function buildCaptureMetadata(
    source: CaptureSurface,
    capturedAt = new Date().toISOString(),
): { capture: CaptureMetadata } {
    return {
        capture: {
            source,
            capturedAt,
            initiatedBy: 'user_action',
        },
    };
}

export function buildCaptureRequest(
    text: string,
    source: CaptureSurface,
    capturedAt?: string,
): CaptureRequest {
    const normalizedText = text.trim();
    if (!normalizedText) throw new Error('capture_text_required');

    return {
        text: normalizedText,
        clientMessageId: createClientMessageId(),
        meta: buildCaptureMetadata(source, capturedAt),
    };
}
