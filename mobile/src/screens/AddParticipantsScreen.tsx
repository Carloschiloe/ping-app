import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useUserSearch, useConversations, useAddGroupParticipants } from '../api/queries';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import type { AddParticipantsScreenProps } from '../navigation/types';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { Glass } from '../design/Glass';
import { ScreenHeader, avatarGradient } from '../design/ScreenHeader';

export default function AddParticipantsScreen() {
    const route = useRoute<AddParticipantsScreenProps['route']>();
    const navigation = useNavigation<AddParticipantsScreenProps['navigation']>();
    const { user } = useAuth();
    const insets = useSafeAreaInsets();

    const conversationId = route.params?.conversationId;

    // Get existing participants so we don't show them
    const { data: convData } = useConversations();
    const currentConv = convData?.conversations?.find((c: any) => c.id === conversationId);
    const existingMemberIds = currentConv?.groupMetadata?.participants?.map((p: any) => p.id) || [];
    // also exclude self just in case (though admin is already in existingMemberIds)
    const excludeIds = new Set([...existingMemberIds, user?.id]);

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUsers, setSelectedUsers] = useState<any[]>([]);

    const { data: searchResults, isLoading: isSearching } = useUserSearch(searchQuery);

    const { mutate: addParticipants, isPending } = useAddGroupParticipants(conversationId);

    const toggleUser = (u: any) => {
        if (selectedUsers.some(su => su.id === u.id)) {
            setSelectedUsers(prev => prev.filter(su => su.id !== u.id));
        } else {
            setSelectedUsers(prev => [...prev, u]);
        }
    };

    const handleAdd = () => {
        if (selectedUsers.length === 0) return;

        addParticipants(
            { newParticipantIds: selectedUsers.map(u => u.id) },
            {
                onSuccess: () => {
                    navigation.goBack();
                },
                onError: (err: any) => {
                    Alert.alert('Error', err.response?.data?.error || 'No se pudo añadir a los integrantes');
                }
            }
        );
    };

    const displayResults = (searchResults?.users || []).filter((u: any) => !excludeIds.has(u.id));

    return (
        <View style={styles.container}>
            <ScreenHeader title="Añadir integrantes" onBack={() => navigation.goBack()} />
            <Glass style={styles.searchBox}>
                <Ionicons name="search" size={17} color={colors.textFaint} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar por correo..."
                    placeholderTextColor={colors.textFaint}
                    selectionColor={colors.accent}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </Glass>

            {isSearching && <ActivityIndicator style={styles.loading} color={colors.accentBright} />}

            {!isSearching && searchQuery.length > 2 && displayResults.length === 0 && (
                <Text style={styles.emptyText}>No se encontraron usuarios nuevos</Text>
            )}

            <FlatList
                data={displayResults}
                keyExtractor={(item) => item.id}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item, index }) => {
                    const isSelected = selectedUsers.some(su => su.id === item.id);
                    const displayName = item.full_name || item.email;
                    const first = index === 0;
                    const last = index === displayResults.length - 1;
                    return (
                        <View style={[first && styles.bandFirst, last && styles.bandLast]}>
                            <Glass style={[StyleSheet.absoluteFill, styles.bandGlass]} intensity={22} tint={isSelected ? colors.accentTint : colors.glassTintLight} />
                            <TouchableOpacity style={styles.userRow} activeOpacity={0.7} onPress={() => toggleUser(item)} accessibilityState={{ selected: isSelected }}>
                                <LinearGradient colors={avatarGradient(displayName)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                                    <Text style={styles.avatarText}>{displayName.substring(0, 2).toUpperCase()}</Text>
                                </LinearGradient>
                                <View style={styles.userIdentity}>
                                    <Text style={styles.nameText} numberOfLines={1}>{displayName}</Text>
                                    {!!item.full_name && <Text style={styles.emailText} numberOfLines={1}>{item.email}</Text>}
                                </View>
                                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                    {isSelected && <Ionicons name="checkmark" size={15} color={colors.onAccent} />}
                                </View>
                            </TouchableOpacity>
                            {!last && <View pointerEvents="none" style={styles.bandSeparator} />}
                        </View>
                    );
                }}
            />

            {selectedUsers.length > 0 && (
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
                    <TouchableOpacity style={[styles.btn, isPending && styles.btnBusy]} onPress={handleAdd} disabled={isPending} activeOpacity={0.85}>
                        <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        {isPending ? (
                            <ActivityIndicator color={colors.onAccent} />
                        ) : (
                            <Text style={styles.btnText}>
                                Añadir {selectedUsers.length} {selectedUsers.length === 1 ? 'participante' : 'participantes'}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        margin: space.lg,
        paddingHorizontal: 14,
        height: 46,
        borderRadius: radius.md,
    },
    searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
    loading: { marginTop: space.xl },
    list: { flex: 1 },
    bandGlass: { borderWidth: 0 },
    bandFirst: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
    bandLast: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder },
    bandSeparator: { position: 'absolute', left: 78, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
    userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, paddingVertical: space.md },
    avatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    avatarText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.silver },
    userIdentity: { flex: 1, minWidth: 0 },
    nameText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
    emailText: { ...type.caption, color: colors.textFaint, marginTop: 2 },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: colors.textFaint,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
    emptyText: { ...type.subhead, textAlign: 'center', marginTop: space.xl },
    footer: { paddingHorizontal: space.xl, paddingTop: space.md },
    btn: { height: 52, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    btnBusy: { opacity: 0.6 },
    btnText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
});
