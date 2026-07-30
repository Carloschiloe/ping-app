import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, FlatList, TouchableOpacity,
    ActivityIndicator, StyleSheet, Alert, Platform, Share
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

function isPhoneNumber(q: string) {
    return /^[+\d\s\-()]{7,}$/.test(q.trim());
}

const AVATAR_COLORS = ['#0a84ff', '#30d158', '#ff6b35', '#bf5af2', '#ff9f0a'];
function avatarColor(str: string) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function NewChatScreen({ navigation }: any) {
    const [query, setQuery] = useState('');
    const [pingContacts, setPingContacts] = useState<any[]>([]);
    const [contactsLoading, setContactsLoading] = useState(true);
    const [invitationText, setInvitationText] = useState('');
    const [invitationBusy, setInvitationBusy] = useState(false);
    const { data: searchData, isLoading: searchLoading } = useUserSearch(query);
    const { mutate: createConversation, isPending } = useCreateConversation();

    useEffect(() => { loadContacts(); }, []);

    const loadContacts = async () => {
        try {
            const { status } = await Contacts.requestPermissionsAsync();
            if (status !== 'granted') { setContactsLoading(false); return; }

            const { data } = await Contacts.getContactsAsync({
                fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
            });

            const phoneMap: Record<string, string> = {};
            data?.forEach(contact => {
                contact.phoneNumbers?.forEach(pn => {
                    if (pn.number) phoneMap[normalizePhone(pn.number)] = contact.name || normalizePhone(pn.number);
                });
            });

            const phones = Object.keys(phoneMap);
            if (phones.length === 0) { setContactsLoading(false); return; }

            const result = await apiClient.post('/users/sync-contacts', { phones });
            setPingContacts((result.users || []).map((u: any) => ({
                ...u, contactName: phoneMap[u.phone] || u.email,
            })));
        } catch (err) {
            console.warn('Contact sync failed', err);
        } finally {
            setContactsLoading(false);
        }
    };

    const handleSelectUser = (user: any) => {
        createConversation(user.id, {
            onSuccess: ({ conversationId }) =>
                navigation.replace('Chat', { conversationId, otherUser: user }),
            onError: (err: any) => Alert.alert('Error', err.message),
        });
    };

    const handleCreateInvitation = async () => {
        const inviteeEmail = query.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail)) {
            Alert.alert('Escribe su correo', 'Usa el mismo correo con que la otra persona se registró en Ping.');
            return;
        }

        setInvitationBusy(true);
        try {
            const result = await apiClient.post('/conversation-invitations', { inviteeEmail });
            await Share.share({
                title: 'Invitación a Ping',
                message: [
                    'Quiero conversar contigo en Ping.',
                    'Abre Ping, entra en “Nuevo chat” y pega este código:',
                    result.token,
                    'El código vence en 15 minutos y sólo funciona con tu cuenta.',
                ].join('\n\n'),
            });
        } catch (error: any) {
            Alert.alert('No se pudo crear', error?.message || 'Revisa el correo e inténtalo nuevamente.');
        } finally {
            setInvitationBusy(false);
        }
    };

    const handleAcceptInvitation = async () => {
        const token = invitationText.match(/PING1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
        if (!token) {
            Alert.alert('Código no válido', 'Copia y pega el código completo que recibiste.');
            return;
        }

        setInvitationBusy(true);
        try {
            const result = await apiClient.post('/conversation-invitations/accept', { token });
            setInvitationText('');
            navigation.replace('Chat', { conversationId: result.conversationId });
        } catch (error: any) {
            Alert.alert('No se pudo unir', error?.message || 'Pide una invitación nueva.');
        } finally {
            setInvitationBusy(false);
        }
    };

    const UserRow = ({ item }: { item: any }) => {
        const label = item.full_name || item.contactName || item.email || item.phone;
        const sub = label !== item.email ? item.email : item.phone;
        const color = avatarColor(label);
        return (
            <TouchableOpacity style={styles.row} onPress={() => handleSelectUser(item)} disabled={isPending} activeOpacity={0.7}>
                <View style={[styles.avatar, { backgroundColor: color }]}>
                    <Text style={styles.avatarText}>{label.substring(0, 2).toUpperCase()}</Text>
                </View>
                <View style={styles.info}>
                    <Text style={styles.name}>{label}</Text>
                    {sub && <Text style={styles.sub}>{sub}</Text>}
                </View>
                <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
        );
    };

    const isSearching = query.length >= 2;
    const results = searchData?.users || [];

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Nuevo chat</Text>
            </View>

            {/* Search input */}
            <View style={styles.searchWrap}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar por nombre, email o teléfono..."
                    placeholderTextColor="#9ca3af"
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                    autoFocus
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')}>
                        <Text style={styles.clearBtn}>✕</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.invitationCard}>
                <Text style={styles.invitationTitle}>Conectar con otra persona</Text>
                <Text style={styles.invitationHint}>
                    Escribe arriba su correo registrado y comparte una invitación privada.
                </Text>
                <TouchableOpacity
                    style={[
                        styles.inviteButton,
                        (!query.includes('@') || invitationBusy) && styles.buttonDisabled,
                    ]}
                    onPress={handleCreateInvitation}
                    disabled={!query.includes('@') || invitationBusy}
                >
                    <Text style={styles.inviteButtonText}>
                        {invitationBusy ? 'Procesando…' : 'Compartir invitación'}
                    </Text>
                </TouchableOpacity>

                <View style={styles.invitationDivider} />
                <Text style={styles.invitationHint}>¿Recibiste una invitación? Pégala aquí.</Text>
                <View style={styles.acceptRow}>
                    <TextInput
                        style={styles.invitationInput}
                        placeholder="Código PING1…"
                        placeholderTextColor="#9ca3af"
                        value={invitationText}
                        onChangeText={setInvitationText}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <TouchableOpacity
                        style={[
                            styles.acceptButton,
                            (!invitationText.trim() || invitationBusy) && styles.buttonDisabled,
                        ]}
                        onPress={handleAcceptInvitation}
                        disabled={!invitationText.trim() || invitationBusy}
                    >
                        <Text style={styles.acceptButtonText}>Unirme</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {isSearching ? (
                // Search results
                searchLoading ? (
                    <ActivityIndicator size="large" color="#0a84ff" style={{ marginTop: 32 }} />
                ) : results.length === 0 ? (
                    <View style={styles.empty}>
                        <Text style={styles.emptyIcon}>🔍</Text>
                        <Text style={styles.emptyTitle}>Sin resultados</Text>
                        <Text style={styles.emptyText}>
                            {isPhoneNumber(query)
                                ? 'Ese número no está registrado en Ping aún'
                                : 'No se encontró ningún usuario con ese email'}
                        </Text>
                    </View>
                ) : (
                    <>
                        <Text style={styles.sectionLabel}>RESULTADOS ({results.length})</Text>
                        <FlatList data={results} keyExtractor={u => u.id} renderItem={({ item }) => <UserRow item={item} />} />
                    </>
                )
            ) : (
                // Contacts already on Ping
                <>
                    <Text style={styles.sectionLabel}>
                        {contactsLoading ? 'BUSCANDO CONTACTOS...' : `EN PING (${pingContacts.length})`}
                    </Text>
                    {contactsLoading ? (
                        <ActivityIndicator size="large" color="#0a84ff" style={{ marginTop: 32 }} />
                    ) : pingContacts.length === 0 ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyIcon}>👥</Text>
                            <Text style={styles.emptyTitle}>Ningún contacto en Ping</Text>
                            <Text style={styles.emptyText}>
                                Invítalos a registrarse o busca por email/teléfono arriba.
                            </Text>
                        </View>
                    ) : (
                        <FlatList data={pingContacts} keyExtractor={u => u.id} renderItem={({ item }) => <UserRow item={item} />} />
                    )}
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },

    // Header
    header: {
        backgroundColor: '#1e3a5f', flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 16, paddingBottom: 16,
    },
    back: { padding: 8, marginRight: 4 },
    backText: { fontSize: 32, color: 'white', lineHeight: 32, fontWeight: '300' },
    title: { fontSize: 20, fontWeight: '700', color: 'white' },

    // Search
    searchWrap: {
        flexDirection: 'row', alignItems: 'center',
        margin: 16, backgroundColor: 'white', borderRadius: 14,
        paddingHorizontal: 14, paddingVertical: 10,
        shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
    },
    searchIcon: { fontSize: 16, marginRight: 8 },
    searchInput: { flex: 1, fontSize: 15, color: '#111' },
    clearBtn: { fontSize: 16, color: '#9ca3af', paddingLeft: 8 },
    invitationCard: {
        marginHorizontal: 16,
        marginBottom: 14,
        padding: 14,
        borderRadius: 14,
        backgroundColor: '#eef2ff',
        borderWidth: 1,
        borderColor: '#c7d2fe',
    },
    invitationTitle: { fontSize: 15, fontWeight: '700', color: '#1e3a8a' },
    invitationHint: { fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 },
    inviteButton: {
        marginTop: 10,
        borderRadius: 10,
        backgroundColor: '#3346e8',
        paddingVertical: 10,
        alignItems: 'center',
    },
    inviteButtonText: { color: 'white', fontSize: 14, fontWeight: '700' },
    invitationDivider: { height: 1, backgroundColor: '#c7d2fe', marginVertical: 12 },
    acceptRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    invitationInput: {
        flex: 1,
        minWidth: 0,
        borderRadius: 10,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        paddingHorizontal: 10,
        paddingVertical: 9,
        fontSize: 12,
        color: '#111827',
    },
    acceptButton: {
        borderRadius: 10,
        backgroundColor: '#1e3a8a',
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    acceptButtonText: { color: 'white', fontSize: 13, fontWeight: '700' },
    buttonDisabled: { opacity: 0.45 },

    // Section label
    sectionLabel: {
        paddingHorizontal: 20, paddingVertical: 8,
        fontSize: 11, fontWeight: '600', color: '#9ca3af', letterSpacing: 0.8,
        backgroundColor: '#f3f4f6',
    },

    // User rows
    row: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    },
    avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    avatarText: { color: 'white', fontWeight: '700', fontSize: 16 },
    info: { flex: 1 },
    name: { fontSize: 15, fontWeight: '600', color: '#111' },
    sub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
    arrow: { fontSize: 24, color: '#d1d5db' },

    // Empty state
    empty: { padding: 48, alignItems: 'center' },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyTitle: { fontSize: 17, fontWeight: '600', color: '#374151', marginBottom: 8 },
    emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
});
