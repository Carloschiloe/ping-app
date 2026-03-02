import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, FlatList, TouchableOpacity,
    ActivityIndicator, StyleSheet, Alert, SectionList
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { useUserSearch, useCreateConversation } from '../api/queries';
import { apiClient } from '../api/client';

function normalizePhone(raw: string): string {
    let cleaned = raw.replace(/[^\d+]/g, '');
    if (!cleaned.startsWith('+')) {
        cleaned = '+56' + cleaned.replace(/^0/, '');
    }
    return cleaned;
}

export default function NewChatScreen({ navigation }: any) {
    const [query, setQuery] = useState('');
    const [pingContacts, setPingContacts] = useState<any[]>([]);
    const [contactsLoading, setContactsLoading] = useState(true);
    const { data: searchData, isLoading: searchLoading } = useUserSearch(query);
    const { mutate: createConversation, isPending } = useCreateConversation();

    useEffect(() => {
        loadContacts();
    }, []);

    const loadContacts = async () => {
        try {
            const { status } = await Contacts.requestPermissionsAsync();
            if (status !== 'granted') {
                setContactsLoading(false);
                return;
            }

            const { data } = await Contacts.getContactsAsync({
                fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
            });

            if (!data || data.length === 0) {
                setContactsLoading(false);
                return;
            }

            // Collect all phone numbers, normalized
            const phoneMap: Record<string, string> = {}; // phone → contact name
            data.forEach(contact => {
                contact.phoneNumbers?.forEach(pn => {
                    if (pn.number) {
                        const normalized = normalizePhone(pn.number);
                        phoneMap[normalized] = contact.name || normalized;
                    }
                });
            });

            // Ask backend which of these are on Ping
            const phones = Object.keys(phoneMap);
            if (phones.length === 0) {
                setContactsLoading(false);
                return;
            }

            const result = await apiClient.post('/users/sync-contacts', { phones });
            const matched = (result.users || []).map((u: any) => ({
                ...u,
                contactName: phoneMap[u.phone] || u.email,
            }));
            setPingContacts(matched);
        } catch (err) {
            console.warn('Contact sync failed:', err);
        } finally {
            setContactsLoading(false);
        }
    };

    const handleSelectUser = (user: any) => {
        createConversation(user.id, {
            onSuccess: ({ conversationId }) => {
                navigation.replace('Chat', { conversationId, otherUser: user });
            },
            onError: (err: any) => Alert.alert('Error', err.message),
        });
    };

    const UserRow = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.userRow}
            onPress={() => handleSelectUser(item)}
            disabled={isPending}
        >
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                    {(item.contactName || item.email).substring(0, 2).toUpperCase()}
                </Text>
            </View>
            <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.contactName || item.email}</Text>
                {item.contactName && <Text style={styles.userEmail}>{item.email}</Text>}
            </View>
        </TouchableOpacity>
    );

    const isSearching = query.length >= 2;
    const searchResults = searchData?.users || [];

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Nuevo chat</Text>
            </View>

            <View style={styles.searchBox}>
                <TextInput
                    style={styles.input}
                    placeholder="Buscar por email..."
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                />
            </View>

            {isSearching ? (
                // Email search results
                searchLoading
                    ? <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 24 }} />
                    : searchResults.length === 0
                        ? <View style={styles.empty}><Text style={styles.emptyText}>No se encontraron usuarios</Text></View>
                        : <FlatList data={searchResults} keyExtractor={u => u.id} renderItem={({ item }) => <UserRow item={item} />} />
            ) : (
                // Contacts on Ping
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        {contactsLoading ? 'Buscando contactos en Ping...' : `${pingContacts.length} contacto${pingContacts.length !== 1 ? 's' : ''} en Ping`}
                    </Text>
                    {contactsLoading ? (
                        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 24 }} />
                    ) : pingContacts.length === 0 ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyIcon}>👥</Text>
                            <Text style={styles.emptyTitle}>Ningún contacto usa Ping aún</Text>
                            <Text style={styles.emptyText}>
                                Invítalos a registrarse.{'\n'}También puedes buscar por email arriba.
                            </Text>
                        </View>
                    ) : (
                        <FlatList data={pingContacts} keyExtractor={u => u.id} renderItem={({ item }) => <UserRow item={item} />} />
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white', paddingTop: 56 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
    back: { padding: 8, marginRight: 8 },
    backText: { fontSize: 32, color: '#3b82f6', lineHeight: 32 },
    title: { fontSize: 20, fontWeight: '700', color: '#111' },
    searchBox: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    input: { backgroundColor: '#f3f4f6', padding: 14, borderRadius: 12, fontSize: 15 },
    section: { flex: 1 },
    sectionTitle: { paddingHorizontal: 20, paddingVertical: 12, fontSize: 13, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
    userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f7f7f7' },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    avatarText: { color: 'white', fontWeight: '700', fontSize: 16 },
    userInfo: { flex: 1 },
    userName: { fontSize: 15, fontWeight: '600', color: '#111' },
    userEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
    empty: { padding: 40, alignItems: 'center' },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyTitle: { fontSize: 17, fontWeight: '600', color: '#111', marginBottom: 8 },
    emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
});
