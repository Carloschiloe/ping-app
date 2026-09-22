/**
 * Surface-neutral request contract for Ping Core consumers.
 *
 * This module intentionally has no React, Expo or network dependency. A
 * tablet, desktop shell or future device adapter can reuse the exact request
 * shape while the server remains the owner of routing, authorization and
 * execution semantics.
 */
export type AgentAdapterSurface = 'mobile_text' | 'mobile_voice' | 'web' | 'desktop' | 'tablet' | 'car' | 'device';
export type AgentAdapterChannel = 'mobile' | 'web' | 'desktop' | 'tablet' | 'car' | 'device';

export interface AgentSurfaceRequestInput {
    surface: AgentAdapterSurface;
    input?: string;
    voiceInputToken?: string;
    /** Signed provenance for a transcript the user has reviewed in the composer. */
    reviewedVoiceInputToken?: string;
    conversationId?: string;
    idempotencyKey?: string;
    readCapability?: 'commitment_count_v4';
}

export interface AgentSurfaceRequestContext {
    locale: string;
    timezone: string;
}

export function channelForSurface(surface: AgentAdapterSurface): AgentAdapterChannel {
    return surface === 'mobile_text' || surface === 'mobile_voice' ? 'mobile' : surface;
}

/**
 * The public Ping entrypoint must choose the device surface without exposing
 * internal brain/mode choices. Expo Device is the platform-owned source for
 * phone/tablet form factor; unknown devices conservatively use mobile text.
 */
type ExpoDeviceModule = {
    deviceType?: unknown;
    DeviceType?: { TABLET?: unknown };
};

function loadExpoDevice(): ExpoDeviceModule {
    try {
        // Runtime-only loading keeps this adapter usable in Node/Vitest where
        // expo-modules-core may not be installed, while native builds still
        // use Expo Device as the platform-owned form-factor source.
        return require('expo-device') as ExpoDeviceModule;
    } catch {
        return {};
    }
}

export function surfaceForDeviceType(deviceType: unknown, tabletType?: unknown): 'mobile_text' | 'tablet' {
    return deviceType !== undefined && deviceType === tabletType ? 'tablet' : 'mobile_text';
}

export function publicPingSurface(): 'mobile_text' | 'tablet' {
    const device = loadExpoDevice();
    return surfaceForDeviceType(device.deviceType, device.DeviceType?.TABLET);
}

export function surfaceForTurn(input: {
    voiceInputToken?: string;
    channel?: AgentAdapterChannel;
}): AgentAdapterSurface {
    if (input.voiceInputToken) return 'mobile_voice';
    if (input.channel && input.channel !== 'mobile') return input.channel;
    return 'mobile_text';
}

export function buildAgentSurfaceRequest(
    input: AgentSurfaceRequestInput,
    context: AgentSurfaceRequestContext,
): { body: Record<string, unknown>; headers: Record<string, string> } {
    const headers: Record<string, string> = input.idempotencyKey
        ? { 'Idempotency-Key': input.idempotencyKey }
        : {};

    if (input.voiceInputToken) return {
        body: { voiceInputToken: input.voiceInputToken },
        headers,
    };
    if (input.reviewedVoiceInputToken) return {
        body: { input: input.input?.trim(), reviewedVoiceInputToken: input.reviewedVoiceInputToken },
        headers,
    };

    const body: Record<string, unknown> = {
        input: input.input?.trim(),
        channel: channelForSurface(input.surface),
        timezone: context.timezone,
        locale: context.locale,
    };
    if (input.conversationId) body.conversationId = input.conversationId;
    if (input.reviewedVoiceInputToken) body.reviewedVoiceInputToken = input.reviewedVoiceInputToken;
    if (input.readCapability) body.readCapability = input.readCapability;
    return { body, headers };
}
import * as Device from 'expo-device';
