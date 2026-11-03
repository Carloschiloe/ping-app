import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useForgetFact, useRememberedFacts, type RememberedFact } from '../../api/queries';

import { colors } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { SheetFill, sheetSurface } from '../../design/Sheet';
interface MemorySheetProps {
    visible: boolean;
    onClose: () => void;
}

/** What Ping remembers about the user; each fact can be forgotten. */
export function MemorySheet({ visible, onClose }: MemorySheetProps) {
    const insets = useSafeAreaInsets();
    const { data: facts, isLoading, isError } = useRememberedFacts(visible);
    const forgetFact = useForgetFact();

    const confirmForget = (fact: RememberedFact) => {
        Alert.alert('¿Olvidar esto?', fact.text, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Olvidar',
                style: 'destructive',
                onPress: () => forgetFact.mutate(fact.id, {
                    onError: () => Alert.alert('No se pudo olvidar', 'Inténtalo de nuevo en un momento.'),
                }),
            },
        ]);
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity
                    activeOpacity={1}
                    style={[
                        styles.sheet,
                        {
                            paddingBottom: Math.max(insets.bottom, 24) + 12,
                        },
                    ]}
                >
                    <SheetFill />
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.text }]}>Lo que Ping recuerda</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close-circle" size={24} color={colors.textFaint} />
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.description, { color: colors.textSoft }]}>
                        Ping usa esto para entenderte mejor. Para agregar algo, dile «recuerda que…».
                    </Text>

                    {isLoading ? (
                        <ActivityIndicator color={colors.accentBright} style={styles.state} />
                    ) : isError ? (
                        <Text style={[styles.state, { color: colors.textFaint }]}>No pude cargar tus recuerdos. Inténtalo de nuevo.</Text>
                    ) : !facts || facts.length === 0 ? (
                        <Text style={[styles.state, { color: colors.textFaint }]}>Todavía no me has pedido que recuerde nada.</Text>
                    ) : (
                        <ScrollView style={styles.list}>
                            {facts.map((fact, index) => (
                                <View
                                    key={fact.id}
                                    style={[
                                        styles.factRow,
                                        index < facts.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
                                    ]}
                                >
                                    <Text style={[styles.factText, { color: colors.text }]}>{fact.text}</Text>
                                    <TouchableOpacity
                                        onPress={() => confirmForget(fact)}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        accessibilityLabel={`Olvidar: ${fact.text}`}
                                        disabled={forgetFact.isPending}
                                    >
                                        <Ionicons name="trash-outline" size={20} color={colors.danger} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>
                    )}
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: colors.scrim,
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 12,
        maxHeight: '80%',
        ...sheetSurface,
    },
    handle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.glassRaised,
        marginBottom: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    title: {
        fontSize: 18,
        fontFamily: fonts.bold,
    },
    closeBtn: {
        padding: 4,
    },
    description: { fontFamily: fonts.regular,
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
    },
    state: { fontFamily: fonts.regular,
        fontSize: 14,
        paddingVertical: 24,
        textAlign: 'center',
    },
    list: {
        flexGrow: 0,
    },
    factRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
    },
    factText: { fontFamily: fonts.regular,
        flex: 1,
        fontSize: 15,
        lineHeight: 21,
    },
});
