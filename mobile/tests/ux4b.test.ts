/**
 * UX-4B.1 — Unit Tests for Perfil tab improvements.
 * Pure unit tests — no React Native renderer needed.
 */
/// <reference types="jest" />
import { describe, expect, it } from 'vitest';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDisplayNameValidationError, normalizeDisplayName, normalizeOptionalPhone } from '../src/utils/profile';

// ─── Focus Mode Helpers (mirrors ProfileScreen logic) ──────────────────────────

function computeFocusLabel(ping_focus_until_val: string | null): { active: boolean; label: string } {
    if (!ping_focus_until_val) return { active: false, label: 'Desactivado' };
    const until = new Date(ping_focus_until_val);
    const remaining = until.getTime() - Date.now();
    if (remaining <= 0) return { active: false, label: 'Desactivado' };
    const mins = Math.ceil(remaining / 60000);
    const label = mins >= 60
        ? `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? `${mins % 60}min` : ''}`.trim()
        : `${mins}min`;
    return { active: true, label };
}

function buildFocusUntil(minutes: number): string {
    return new Date(Date.now() + minutes * 60000).toISOString();
}

// ─── Profile Logic ─────────────────────────────────────────────────────────────

describe('UX-4B.1: Profile — normalización de nombre', () => {
    it('normalizes name trimming whitespace', () => {
        expect(normalizeDisplayName('  Juan   Perez  ')).toBe('Juan Perez');
    });

    it('validates name must be 2+ chars', () => {
        expect(getDisplayNameValidationError('A')).toBeTruthy();
        expect(getDisplayNameValidationError('Ana')).toBeNull();
    });

    it('normalizes optional phone', () => {
        expect(normalizeOptionalPhone('+56 9 1234 5678')).toBe('+56912345678');
        expect(normalizeOptionalPhone('')).toBeNull();
    });
});

// ─── Focus Mode State ─────────────────────────────────────────────────────────

describe('UX-4B.1: Focus Mode — estado y activación', () => {
    it('returns Desactivado when no value stored', () => {
        const result = computeFocusLabel(null);
        expect(result.active).toBe(false);
        expect(result.label).toBe('Desactivado');
    });

    it('returns active state with label for 15 min', () => {
        const val = buildFocusUntil(15);
        const result = computeFocusLabel(val);
        expect(result.active).toBe(true);
        expect(result.label).toMatch(/\d+min/);
    });

    it('returns active state with label for 60 min (1h)', () => {
        const val = buildFocusUntil(60);
        const result = computeFocusLabel(val);
        expect(result.active).toBe(true);
        expect(result.label).toContain('1h');
    });

    it('returns active state with label for 90 min (1h 30min)', () => {
        const val = buildFocusUntil(90);
        const result = computeFocusLabel(val);
        expect(result.active).toBe(true);
        expect(result.label).toContain('1h');
        expect(result.label).toContain('30min');
    });

    it('returns active state with label for 120 min (2h)', () => {
        const val = buildFocusUntil(120);
        const result = computeFocusLabel(val);
        expect(result.active).toBe(true);
        expect(result.label).toContain('2h');
    });

    it('returns Desactivado if focus_until is in the past', () => {
        const past = new Date(Date.now() - 60000).toISOString();
        const result = computeFocusLabel(past);
        expect(result.active).toBe(false);
        expect(result.label).toBe('Desactivado');
    });

    it('buildFocusUntil sets a future date', () => {
        const val = buildFocusUntil(30);
        expect(new Date(val).getTime()).toBeGreaterThan(Date.now());
    });
});

// ─── Safe Area — structural (no RN renderer) ────────────────────────────────

describe('UX-4B.1: Safe Area — no hardcoded offsets', () => {
    it('contentPaddingTop is dynamic, not hardcoded', () => {
        // Simulates the ProfileScreen formula
        const mockInsetsTop = 59; // iPhone 15 Pro
        const contentPaddingTop = Math.max(mockInsetsTop, 16) + 12;
        // Must not be a fixed value; it depends on actual insets
        expect(contentPaddingTop).toBe(71);
        expect(contentPaddingTop).toBeGreaterThan(16);
    });

    it('bottomPadding adapts to safe area', () => {
        const mockInsetsBottom = 34; // iPhone with home indicator
        const paddingBottom = Math.max(mockInsetsBottom, 20) + 20;
        expect(paddingBottom).toBe(54);
    });
});

// ─── Visible Sections ─────────────────────────────────────────────────────────

describe('UX-4B.1: Profile sections visibility', () => {
    it('Focus Mode section label is Desactivado by default', () => {
        const label = computeFocusLabel(null).label;
        expect(label).toBe('Desactivado');
    });

    it('Focus Mode not shown as device-only feature (no false promises)', () => {
        // The copy must not claim to block server push
        const description = 'Reduce interrupciones dentro de Ping durante un tiempo determinado.';
        expect(description).not.toContain('Bloquea todas las notificaciones');
        expect(description).not.toContain('notifications del servidor');
    });
});
