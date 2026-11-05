import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Alert, StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useDeleteAccount } from '../../api/queries';
import { colors } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { BaseSheet, sheetStyles } from '../safety/BaseSheet';

const CONFIRM_WORD = 'ELIMINAR';

const ERASED = [
    'Tu nombre, teléfono, correo, foto y portada',
    'Tu conversación con Ping y lo que le pediste recordar',
    'Tu calendario conectado, contactos guardados y avisos',
    'Tu acceso: ya no podrás entrar con esta cuenta',
];

/** Deletes the account after the person types the confirm word. */
export function DeleteAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const deleteAccount = useDeleteAccount();
    const queryClient = useQueryClient();
    const [typed, setTyped] = useState('');

    useEffect(() => {
        if (visible) setTyped('');
    }, [visible]);

    const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

    const submit = () => {
        if (!confirmed) return;
        deleteAccount.mutate(undefined, {
            onSuccess: async () => {
                onClose();
                queryClient.clear();
                await supabase.auth.signOut().catch(() => undefined);
                Alert.alert('Cuenta eliminada', 'Tus datos fueron borrados. Gracias por haber usado Ping.');
            },
            onError: () => Alert.alert('No se pudo eliminar', 'No se borró nada que no debiera. Inténtalo de nuevo en un momento.'),
        });
    };

    return (
        <BaseSheet
            visible={visible}
            onClose={onClose}
            title="Eliminar mi cuenta"
            description="Esto no se puede deshacer."
            actionLabel="Eliminar mi cuenta para siempre"
            onAction={submit}
            actionDisabled={!confirmed}
            busy={deleteAccount.isPending}
            danger
        >
            <Text style={sheetStyles.label}>Se borra</Text>
            {ERASED.map((line) => (
                <View key={line} style={styles.line}>
                    <View style={styles.dot} />
                    <Text style={styles.lineText}>{line}</Text>
                </View>
            ))}
            <Text style={sheetStyles.label}>Se mantiene</Text>
            <Text style={styles.lineText}>
                Los mensajes y compromisos que compartiste siguen visibles para las otras personas, como «Cuenta eliminada», sin tu nombre ni tu foto.
            </Text>
            <Text style={sheetStyles.label}>Escribe {CONFIRM_WORD} para confirmar</Text>
            <TextInput
                style={sheetStyles.input}
                placeholder={CONFIRM_WORD}
                placeholderTextColor={colors.textFaint}
                value={typed}
                onChangeText={setTyped}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel={`Escribe ${CONFIRM_WORD} para confirmar`}
            />
        </BaseSheet>
    );
}

const styles = StyleSheet.create({
    line: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
    dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.danger, marginTop: 8 },
    lineText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text },
});
