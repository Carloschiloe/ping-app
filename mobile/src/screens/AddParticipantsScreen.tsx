import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useUserSearch, useConversations, useAddGroupParticipants } from '../api/queries';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import type { AddParticipantsScreenProps } from '../navigation/types';

export default function AddParticipantsScreen() {
    const route = useRoute<AddParticipantsScreenProps['route']>();
    const navigation = useNavigation<AddParticipantsScreenProps['navigation']>();
    const { user } = useAuth();

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

    const displayResults = (searchResults || []).filter((u: any) => !excludeIds.has(u.id));

    return (
        <View style={styles.container}>
            <View style={styles.searchBox}>
                <Ionicons name="search" size={20} color="#9ca3af" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar por correo..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </View>

            {isSearching && <ActivityIndicator style={{ marginTop: 20 }} color="#1e3a5f" />}

            {!isSearching && searchQuery.length > 2 && displayResults.length === 0 && (
                <Text style={styles.emptyText}>No se encontraron usuarios nuevos</Text>
            )}

            <FlatList
                data={displayResults}
                keyExtractor={(item) => item.id}
                style={styles.list}
                renderItem={({ item }) => {
                    const isSelected = selectedUsers.some(su => su.id === item.id);
                    return (
                        <TouchableOpacity style={styles.userRow} activeOpacity={0.7} onPress={() => toggleUser(item)}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{item.email.substring(0, 2).toUpperCase()}</Text>
                            </View>
                            <Text style={styles.emailText}>{item.email}</Text>
                            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                {isSelected && <Ionicons name="checkmark" size={16} color="white" />}
                            </View>
                        </TouchableOpacity>
                    );
                }}
            />

            {selectedUsers.length > 0 && (
                <View style={styles.footer}>
                    <TouchableOpacity style={[styles.btn, isPending && { opacity: 0.6 }]} onPress={handleAdd} disabled={isPending}>
                        {isPending ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text style={styles.btnText}>Añadir {selectedUsers.length} participante(s)</Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },
    searchBox: {
        flexDirection: 'row', alignItems: 'center',
        margin: 16, paddingHorizontal: 16, height: 48,
        backgroundColor: '#f3f4f6', borderRadius: 24,
    },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 16, color: '#111827' },
    list: { flex: 1 },
    userRow: {
        flexDirection: 'row', alignItems: 'center', padding: 16,
        borderBottomWidth: 1, borderBottomColor: '#f3f4f6'
    },
    avatar: {
        width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e3a5f',
        alignItems: 'center', justifyContent: 'center', marginRight: 12
    },
    avatarText: { color: 'white', fontWeight: '700', fontSize: 16 },
    emailText: { flex: 1, fontSize: 16, color: '#374151' },
    checkbox: {
        width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#d1d5db',
        alignItems: 'center', justifyContent: 'center'
    },
    checkboxSelected: { backgroundColor: '#10b981', borderColor: '#10b981' },
    emptyText: { textAlign: 'center', marginTop: 20, color: '#6b7280', fontSize: 15 },
    footer: {
        padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: 'white'
    },
    btn: {
        backgroundColor: '#1e3a5f', paddingVertical: 14, borderRadius: 25, alignItems: 'center'
    },
    btnText: { color: 'white', fontSize: 16, fontWeight: '600' }
});
