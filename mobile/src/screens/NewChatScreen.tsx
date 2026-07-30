import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, TextInput, FlatList, TouchableOpacity,
    ActivityIndicator, StyleSheet, Alert, Platform, Share, AppState
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';
import { apiClient } from '../api/client';

type RegisteredContact = {
    id: string;
    full_name?: string | null;
    avatar_url?: string | null;
    phone?: string | null;
    email?: string | null;
    contactProof: string;
};

type DeviceContact = {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    registered?: RegisteredContact;
};

function normalizePhone(raw: string): string | null {
    const digits = raw.replace(/\D/g, '');
    if (raw.trim().startsWith('+')) {
        const value = `+${digits}`;
        return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
    }
    if (digits.startsWith('56') && digits.length === 11) return `+${digits}`;
    if (digits.length === 9) return `+56${digits}`;
    return null;
}

const AVATAR_COLORS = ['#0a84ff', '#30d158', '#ff6b35', '#bf5af2', '#ff9f0a'];
function avatarColor(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = value.charCodeAt(index) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function NewChatScreen({ navigation }: any) {
    const [query, setQuery] = useState('');
    const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
    const [contactsLoading, setContactsLoading] = useState(true);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [canAskForContacts, setCanAskForContacts] = useState(true);
    const [busyContactId, setBusyContactId] = useState<string | null>(null);
    const [matchingContacts, setMatchingContacts] = useState(false);
    const [discoveryWarning, setDiscoveryWarning] = useState<string | null>(null);

    const loadContacts = useCallback(async () => {
        setContactsLoading(true);
        setPermissionDenied(false);
        setDiscoveryWarning(null);
        try {
            let permission = await Contacts.getPermissionsAsync();
            if (permission.status !== 'granted' && permission.canAskAgain) {
                permission = await Contacts.requestPermissionsAsync();
            }
            setCanAskForContacts(permission.canAskAgain);
            if (permission.status !== 'granted') {
                setPermissionDenied(true);
                setDeviceContacts([]);
                return;
            }

            const { data } = await Contacts.getContactsAsync({
                fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Name],
                sort: Contacts.SortTypes.FirstName,
            });

            const contacts: DeviceContact[] = [];
            for (const contact of data || []) {
                const phone = (contact.phoneNumbers || [])
                    .map((entry) => entry.number ? normalizePhone(entry.number) : null)
                    .find((value): value is string => !!value);
                const email = (contact.emails || [])
                    .map((entry) => entry.email?.trim().toLowerCase())
                    .find((value): value is string => !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
                if (!phone && !email) continue;
                contacts.push({
                    id: contact.id,
                    name: contact.name?.trim() || phone || email || 'Contacto',
                    phone,
                    email,
                });
            }

            if (contacts.length === 0) {
                setDeviceContacts([]);
                return;
            }

            // The address book is useful even while staging is waking up.
            // Never hide local contacts behind the remote matching request.
            setDeviceContacts(contacts);
            setContactsLoading(false);
            setMatchingContacts(true);

            try {
                const matchedUsers: RegisteredContact[] = [];
                for (let index = 0; index < contacts.length; index += 200) {
                    const batch = contacts.slice(index, index + 200);
                    const result = await apiClient.post('/users/sync-contacts', {
                        phones: Array.from(new Set(
                            batch.map((contact) => contact.phone).filter(Boolean)
                        )),
                        emails: Array.from(new Set(
                            batch.map((contact) => contact.email).filter(Boolean)
                        )),
                    });
                    matchedUsers.push(...(result.users || []));
                }
                const matchesByPhone = new Map<string, RegisteredContact>();
                const matchesByEmail = new Map<string, RegisteredContact>();
                for (const user of matchedUsers) {
                    if (user.phone) matchesByPhone.set(user.phone, user);
                    if (user.email) matchesByEmail.set(user.email.toLowerCase(), user);
                }

                setDeviceContacts(contacts.map((contact) => ({
                    ...contact,
                    registered: (contact.phone ? matchesByPhone.get(contact.phone) : undefined)
                        || (contact.email ? matchesByEmail.get(contact.email) : undefined),
                })));
            } catch (error: any) {
                console.warn('[Contacts] Remote matching failed', {
                    name: error?.name || 'UnknownError',
                    status: error?.status ?? null,
                });
                setDiscoveryWarning(
                    'Mostramos tu agenda, pero aún no pudimos comprobar quién ya usa Ping. Puedes invitar igualmente.'
                );
            } finally {
                setMatchingContacts(false);
            }
        } catch (error: any) {
            console.warn('[Contacts] Discovery failed', {
                name: error?.name || 'UnknownError',
                status: error?.status ?? null,
            });
            Alert.alert(
                'No pudimos cargar tus contactos',
                error?.message || 'Revisa la conexión e inténtalo nuevamente.'
            );
        } finally {
            setContactsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadContacts();
    }, [loadContacts]);

    useEffect(() => {
        if (!permissionDenied) return;
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') loadContacts();
        });
        return () => subscription.remove();
    }, [loadContacts, permissionDenied]);

    const openRegisteredContact = async (contact: DeviceContact) => {
        if (!contact.registered?.contactProof) return;
        setBusyContactId(contact.id);
        try {
            const result = await apiClient.post('/conversations/from-contact', {
                proof: contact.registered.contactProof,
            });
            navigation.replace('Chat', {
                conversationId: result.conversationId,
                otherUser: contact.registered,
            });
        } catch (error: any) {
            Alert.alert(
                'No se pudo abrir el chat',
                error?.message || 'Actualiza tus contactos e inténtalo nuevamente.'
            );
        } finally {
            setBusyContactId(null);
        }
    };

    const inviteContact = async (contact: DeviceContact) => {
        setBusyContactId(contact.id);
        try {
            const appUrl = Linking.createURL('/');
            await Share.share({
                title: 'Invitación a Ping',
                message: [
                    `Hola ${contact.name}, te invito a conversar conmigo en Ping.`,
                    'Instala Expo Go y abre este enlace para entrar a nuestra beta:',
                    appUrl,
                ].join('\n\n'),
            });
        } catch (error: any) {
            if (error?.message) {
                Alert.alert('No se pudo compartir', 'Inténtalo nuevamente desde este contacto.');
            }
        } finally {
            setBusyContactId(null);
        }
    };

    const filteredContacts = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase('es');
        if (!normalizedQuery) return deviceContacts;
        const digits = query.replace(/\D/g, '');
        return deviceContacts.filter((contact) =>
            contact.name.toLocaleLowerCase('es').includes(normalizedQuery)
            || (!!digits && !!contact.phone && contact.phone.replace(/\D/g, '').includes(digits))
            || (!!contact.email && contact.email.includes(normalizedQuery))
        );
    }, [deviceContacts, query]);

    const registeredCount = deviceContacts.filter((contact) => !!contact.registered).length;

    const renderContact = ({ item }: { item: DeviceContact }) => {
        const isRegistered = !!item.registered;
        const isBusy = busyContactId === item.id;
        const label = item.registered?.full_name || item.name;
        return (
            <TouchableOpacity
                style={styles.row}
                onPress={() => isRegistered ? openRegisteredContact(item) : inviteContact(item)}
                disabled={!!busyContactId}
                activeOpacity={0.7}
            >
                <View style={[styles.avatar, { backgroundColor: avatarColor(label) }]}>
                    <Text style={styles.avatarText}>{label.substring(0, 2).toUpperCase()}</Text>
                </View>
                <View style={styles.info}>
                    <Text style={styles.name}>{label}</Text>
                    <Text style={styles.sub}>{item.phone || item.email}</Text>
                </View>
                {isBusy ? (
                    <ActivityIndicator size="small" color="#3346e8" />
                ) : (
                    <View style={[styles.contactAction, isRegistered ? styles.chatAction : styles.inviteAction]}>
                        <Text style={[styles.contactActionText, isRegistered ? styles.chatActionText : styles.inviteActionText]}>
                            {isRegistered ? 'Chatear' : 'Invitar'}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <View style={styles.headerCopy}>
                    <Text style={styles.title}>Nuevo chat</Text>
                    <Text style={styles.headerSubtitle}>Elige a alguien de tus contactos</Text>
                </View>
                <TouchableOpacity onPress={loadContacts} style={styles.refreshButton} disabled={contactsLoading}>
                    <Text style={styles.refreshText}>↻</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar contacto o número..."
                    placeholderTextColor="#9ca3af"
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                />
                {query.length > 0 ? (
                    <TouchableOpacity onPress={() => setQuery('')}>
                        <Text style={styles.clearBtn}>✕</Text>
                    </TouchableOpacity>
                ) : null}
            </View>

            {!permissionDenied ? (
                <View style={styles.privacyNote}>
                    <Text style={styles.privacyTitle}>Tus contactos permanecen privados</Text>
                    <Text style={styles.privacyText}>
                        Ping compara números exactos para mostrar quién ya está aquí. No publica tu agenda.
                    </Text>
                </View>
            ) : null}

            {contactsLoading ? (
                <View style={styles.centerState}>
                    <ActivityIndicator size="large" color="#3346e8" />
                    <Text style={styles.stateText}>Buscando tus contactos…</Text>
                </View>
            ) : permissionDenied ? (
                <View style={styles.centerState}>
                    <Text style={styles.emptyIcon}>👥</Text>
                    <Text style={styles.emptyTitle}>Permite el acceso a contactos</Text>
                    <Text style={styles.emptyText}>
                        Ping necesita tu autorización para que puedas elegir a quién invitar o escribir.
                    </Text>
                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={() => canAskForContacts ? loadContacts() : Linking.openSettings()}
                    >
                        <Text style={styles.primaryButtonText}>
                            {canAskForContacts ? 'Permitir contactos' : 'Abrir configuración'}
                        </Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <>
                    <Text style={styles.sectionLabel}>
                        {matchingContacts
                            ? `${deviceContacts.length} CONTACTOS · COMPROBANDO QUIÉN USA PING…`
                            : `${registeredCount} EN PING · ${deviceContacts.length} CONTACTOS`}
                    </Text>
                    {discoveryWarning ? (
                        <View style={styles.discoveryWarning}>
                            <Text style={styles.discoveryWarningText}>{discoveryWarning}</Text>
                            <TouchableOpacity onPress={loadContacts}>
                                <Text style={styles.discoveryRetry}>Reintentar</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}
                    <FlatList
                        data={filteredContacts}
                        keyExtractor={(contact) => contact.id}
                        renderItem={renderContact}
                        keyboardShouldPersistTaps="handled"
                        ListEmptyComponent={() => (
                            <View style={styles.centerState}>
                                <Text style={styles.emptyIcon}>🔍</Text>
                                <Text style={styles.emptyTitle}>No encontramos contactos</Text>
                                <Text style={styles.emptyText}>
                                    Prueba con otro nombre o revisa que el contacto tenga un número móvil.
                                </Text>
                            </View>
                        )}
                    />
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    header: {
        backgroundColor: '#1e3a5f',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 56 : 16,
        paddingBottom: 16,
    },
    back: { padding: 8, marginRight: 4 },
    backText: { fontSize: 32, color: 'white', lineHeight: 32, fontWeight: '300' },
    headerCopy: { flex: 1 },
    title: { fontSize: 20, fontWeight: '700', color: 'white' },
    headerSubtitle: { color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 2 },
    refreshButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    refreshText: { color: 'white', fontSize: 26, lineHeight: 28 },
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        margin: 16,
        backgroundColor: 'white',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        shadowColor: '#000',
        shadowOpacity: 0.07,
        shadowRadius: 4,
        elevation: 2,
    },
    searchIcon: { fontSize: 16, marginRight: 8 },
    searchInput: { flex: 1, fontSize: 15, color: '#111' },
    clearBtn: { fontSize: 16, color: '#9ca3af', paddingLeft: 8 },
    privacyNote: {
        marginHorizontal: 16,
        marginBottom: 14,
        padding: 12,
        borderRadius: 14,
        backgroundColor: '#eef2ff',
        borderWidth: 1,
        borderColor: '#c7d2fe',
    },
    privacyTitle: { color: '#1e3a8a', fontSize: 13, fontWeight: '800' },
    privacyText: { color: '#475569', fontSize: 12, lineHeight: 17, marginTop: 3 },
    sectionLabel: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        fontSize: 11,
        fontWeight: '700',
        color: '#64748b',
        letterSpacing: 0.7,
        backgroundColor: '#f3f4f6',
    },
    discoveryWarning: {
        marginHorizontal: 16,
        marginVertical: 10,
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#fff7ed',
        borderWidth: 1,
        borderColor: '#fed7aa',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    discoveryWarningText: {
        flex: 1,
        color: '#9a3412',
        fontSize: 12,
        lineHeight: 17,
    },
    discoveryRetry: {
        color: '#c2410c',
        fontSize: 12,
        fontWeight: '800',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    avatarText: { color: 'white', fontWeight: '700', fontSize: 16 },
    info: { flex: 1, minWidth: 0 },
    name: { fontSize: 15, fontWeight: '700', color: '#111827' },
    sub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
    contactAction: {
        borderRadius: 999,
        paddingHorizontal: 13,
        paddingVertical: 8,
        minWidth: 68,
        alignItems: 'center',
    },
    chatAction: { backgroundColor: '#3346e8' },
    inviteAction: { backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe' },
    contactActionText: { fontSize: 12, fontWeight: '800' },
    chatActionText: { color: 'white' },
    inviteActionText: { color: '#3346e8' },
    centerState: { padding: 42, alignItems: 'center' },
    stateText: { marginTop: 12, fontSize: 14, color: '#64748b' },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: '#374151', marginBottom: 8 },
    emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
    primaryButton: {
        marginTop: 18,
        backgroundColor: '#3346e8',
        borderRadius: 12,
        paddingHorizontal: 18,
        paddingVertical: 12,
    },
    primaryButtonText: { color: 'white', fontWeight: '800', fontSize: 14 },
});
