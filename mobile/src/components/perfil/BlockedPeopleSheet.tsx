import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useBlockedPeople, useSetBlocked, type BlockedPerson } from '../../api/queries';
import { colors } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { BaseSheet } from '../safety/BaseSheet';

/** People the user blocked; each one can be unblocked. */
export function BlockedPeopleSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const { data: people, isLoading, isError } = useBlockedPeople(visible);
    const setBlocked = useSetBlocked();

    const confirmUnblock = (person: BlockedPerson) => {
        const name = person.full_name || 'esta persona';
        Alert.alert(`¿Desbloquear a ${name}?`, 'Podrá volver a escribirte y llamarte.', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Desbloquear',
                onPress: () => setBlocked.mutate({ userId: person.id, blocked: false }, {
                    onError: () => Alert.alert('No se pudo desbloquear', 'Inténtalo de nuevo en un momento.'),
                }),
            },
        ]);
    };

    return (
        <BaseSheet
            visible={visible}
            onClose={onClose}
            title="Personas bloqueadas"
            description="No pueden escribirte ni llamarte en su chat contigo."
        >
            {isLoading ? (
                <ActivityIndicator color={colors.accentBright} style={styles.state} />
            ) : isError ? (
                <Text style={styles.state}>No pude cargar la lista. Inténtalo de nuevo.</Text>
            ) : !people?.length ? (
                <Text style={styles.state}>No has bloqueado a nadie.</Text>
            ) : people.map((person, index) => (
                <View key={person.id} style={[styles.row, index < people.length - 1 && styles.rowDivider]}>
                    <Text style={styles.name} numberOfLines={1}>{person.full_name || 'Sin nombre'}</Text>
                    <TouchableOpacity onPress={() => confirmUnblock(person)} disabled={setBlocked.isPending} hitSlop={8} accessibilityLabel={`Desbloquear a ${person.full_name || 'esta persona'}`}>
                        <Text style={styles.unblock}>Desbloquear</Text>
                    </TouchableOpacity>
                </View>
            ))}
        </BaseSheet>
    );
}

const styles = StyleSheet.create({
    state: { fontFamily: fonts.regular, fontSize: 14, color: colors.textFaint, paddingVertical: 24, textAlign: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
    name: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
    unblock: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentBright },
});
