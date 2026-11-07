import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space } from './tokens';
import { fonts, type } from './typography';
import { SheetFill, sheetSurface } from './Sheet';

// Ping's own "are you sure?" card, in place of the system's white alert.
// Mount <ConfirmHost /> once; anywhere can then `await confirmAction(...)`,
// or `notify(...)` for a notice with a single button.

interface ConfirmRequest {
    title: string;
    message?: string;
    confirmLabel?: string;
    destructive?: boolean;
}

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void; notice?: boolean };

let show: ((request: Pending) => void) | null = null;

export function confirmAction(request: ConfirmRequest): Promise<boolean> {
    return new Promise((resolve) => {
        if (!show) return resolve(false);
        show({ ...request, resolve });
    });
}

/** A notice the person only acknowledges, in the same card. */
export function notify(request: { title: string; message?: string; buttonLabel?: string }): Promise<void> {
    return new Promise((resolve) => {
        if (!show) return resolve();
        show({
            title: request.title,
            message: request.message,
            confirmLabel: request.buttonLabel ?? 'Entendido',
            destructive: false,
            notice: true,
            resolve: () => resolve(),
        });
    });
}

export function ConfirmHost() {
    const [pending, setPending] = useState<Pending | null>(null);

    useEffect(() => {
        show = (request) => setPending((current) => {
            current?.resolve(false);
            return request;
        });
        return () => { show = null; };
    }, []);

    const answer = (ok: boolean) => {
        pending?.resolve(ok);
        setPending(null);
    };

    const destructive = pending?.destructive ?? true;
    const notice = !!pending?.notice;
    return (
        <Modal visible={!!pending} transparent animationType="fade" statusBarTranslucent onRequestClose={() => answer(false)}>
            <Pressable style={styles.scrim} onPress={() => answer(false)}>
                <Pressable style={styles.card} onPress={() => {}}>
                    <SheetFill />
                    <View style={[styles.icon, { backgroundColor: destructive ? colors.dangerTint : colors.accentTint }]}>
                        <Ionicons
                            name={notice ? 'checkmark-circle-outline' : destructive ? 'trash-outline' : 'help-circle-outline'}
                            size={22}
                            color={destructive ? colors.danger : colors.accentBright}
                        />
                    </View>
                    <Text style={styles.title}>{pending?.title}</Text>
                    {!!pending?.message && <Text style={styles.message}>{pending.message}</Text>}
                    <View style={styles.actions}>
                        {!notice && (
                            <TouchableOpacity style={[styles.button, styles.cancel]} onPress={() => answer(false)} accessibilityRole="button">
                                <Text style={styles.cancelText}>Cancelar</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: destructive ? colors.danger : colors.accent }]}
                            onPress={() => answer(true)}
                            accessibilityRole="button"
                        >
                            <Text style={styles.confirmText}>{pending?.confirmLabel ?? 'Eliminar'}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: space.xl },
    card: {
        ...sheetSurface,
        borderRadius: radius.xl,
        alignItems: 'center',
        paddingTop: space.xl,
        paddingHorizontal: space.xl,
        paddingBottom: space.lg,
    },
    icon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
    title: { ...type.title, textAlign: 'center' },
    message: { ...type.subhead, textAlign: 'center', marginTop: space.sm, lineHeight: 20 },
    actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xl, alignSelf: 'stretch' },
    button: { flex: 1, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    cancel: { backgroundColor: colors.glassRaised },
    cancelText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
    confirmText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.onAccent },
});
