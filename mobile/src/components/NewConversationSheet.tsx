import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import Reanimated, { SlideInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { SheetFill, sheetSurface } from '../design/Sheet';

type Option = {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    detail: string;
    onPress: () => void;
};

type NewConversationSheetProps = {
    visible: boolean;
    onClose: () => void;
    onNewChat: () => void;
    onNewGroup: () => void;
};

// What the "+" on the chat list opens: start a chat with one person or a group.
export function NewConversationSheet({ visible, onClose, onNewChat, onNewGroup }: NewConversationSheetProps) {
    const insets = useSafeAreaInsets();
    const options: Option[] = [
        { icon: 'chatbubble-outline', label: 'Nuevo chat', detail: 'Escríbele a uno de tus contactos', onPress: onNewChat },
        { icon: 'people-outline', label: 'Nuevo grupo', detail: 'Reúne a varias personas', onPress: onNewGroup },
    ];

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel="Cerrar" />
                <Reanimated.View entering={SlideInDown.duration(320)} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}>
                    <SheetFill />
                    <View style={styles.handle} />
                    <Text style={styles.title}>Nueva conversación</Text>
                    {options.map((option) => (
                        <TouchableOpacity
                            key={option.label}
                            style={styles.option}
                            onPress={() => { onClose(); option.onPress(); }}
                            activeOpacity={0.75}
                        >
                            <View style={styles.optionIcon}>
                                <Ionicons name={option.icon} size={21} color={colors.accentBright} />
                            </View>
                            <View style={styles.optionBody}>
                                <Text style={styles.optionLabel}>{option.label}</Text>
                                <Text style={styles.optionDetail}>{option.detail}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.cancel} onPress={onClose}>
                        <Text style={styles.cancelText}>Cancelar</Text>
                    </TouchableOpacity>
                </Reanimated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
    sheet: {
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        paddingTop: space.sm,
        paddingHorizontal: space.lg,
        ...sheetSurface,
    },
    handle: {
        alignSelf: 'center',
        width: 38,
        height: 5,
        borderRadius: 3,
        backgroundColor: colors.glassBorder,
        marginBottom: space.md,
    },
    title: { ...type.title, marginBottom: space.md, marginLeft: space.xs },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        marginBottom: space.sm,
        borderRadius: radius.lg,
        backgroundColor: colors.glassRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    optionIcon: {
        width: 42,
        height: 42,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentTint,
    },
    optionBody: { flex: 1 },
    optionLabel: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
    optionDetail: { ...type.subhead, fontSize: 13, marginTop: 2 },
    cancel: { alignItems: 'center', paddingVertical: 14, marginTop: space.xs },
    cancelText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textSoft },
});
