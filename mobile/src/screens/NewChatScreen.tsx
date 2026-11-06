import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, TextInput, FlatList, TouchableOpacity,
    ActivityIndicator, StyleSheet, Alert, Platform, Share, AppState
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Contact,
    ContactField,
    ContactsSortOrder,
    getPermissionsAsync,
    requestPermissionsAsync,
} from 'expo-contacts';
import * as Linking from 'expo-linking';
import { apiClient } from '../api/client';
import { mapDeviceContacts, type DeviceContact } from '../utils/deviceContacts';
import { PING_PUBLIC_INVITE_URL } from '../utils/pingInvitation';
import { openLegal } from '../utils/legalLinks';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { Glass } from '../design/Glass';
import { ScreenHeader, HeaderButton, avatarGradient } from '../design/ScreenHeader';

type RegisteredContact = NonNullable<DeviceContact['registered']>;

type ContactAccess = 'all' | 'limited' | 'none';

export default function NewChatScreen({ navigation }: any) {
    const [query, setQuery] = useState('');
    const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
    const [contactsLoading, setContactsLoading] = useState(true);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [canAskForContacts, setCanAskForContacts] = useState(true);
    const [contactAccess, setContactAccess] = useState<ContactAccess>('none');
    const [busyContactId, setBusyContactId] = useState<string | null>(null);
    const [matchingContacts, setMatchingContacts] = useState(false);
    const [discoveryWarning, setDiscoveryWarning] = useState<string | null>(null);

    // Android's permission prompt only comes after the person has read, on
    // this screen, what Ping does with their contacts (Google Play's
    // prominent disclosure). Opening the screen never asks by itself.
    const loadContacts = useCallback(async (askNow = false) => {
        setContactsLoading(true);
        setPermissionDenied(false);
        setDiscoveryWarning(null);
        try {
            let permission = await getPermissionsAsync();
            if (askNow && permission.status !== 'granted' && permission.canAskAgain) {
                permission = await requestPermissionsAsync();
            }
            setCanAskForContacts(permission.canAskAgain);
            setContactAccess(
                permission.status === 'granted'
                    ? (permission.accessPrivileges || 'all')
                    : 'none'
            );
            if (permission.status !== 'granted') {
                setPermissionDenied(true);
                setDeviceContacts([]);
                return;
            }

            const details = await Contact.getAllDetails(
                [ContactField.FULL_NAME, ContactField.PHONES, ContactField.EMAILS],
                { sortOrder: ContactsSortOrder.GivenName },
            );
            const contacts = mapDeviceContacts(details);

            if (contacts.length === 0) {
                setDeviceContacts([]);
                return;
            }

            // The address book is useful even while the backend is waking up.
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
                    'Mostramos tu agenda, pero aún no pudimos comprobar quién ya usa Vorian. Puedes invitar igualmente.'
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
        if (!permissionDenied && contactAccess !== 'limited') return;
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') loadContacts();
        });
        return () => subscription.remove();
    }, [contactAccess, loadContacts, permissionDenied]);

    const selectLimitedContacts = async () => {
        setContactsLoading(true);
        try {
            if (Platform.OS !== 'ios') {
                await Linking.openSettings();
                return;
            }
            await Contact.presentAccessPicker();
            await loadContacts();
        } catch (error: any) {
            console.warn('[Contacts] Limited access picker failed', {
                name: error?.name || 'UnknownError',
            });
            Alert.alert('El selector no está disponible', 'Abre Configuración y elige Contactos → Acceso completo.', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Abrir configuración', onPress: () => Linking.openSettings() },
            ]);
        } finally {
            setContactsLoading(false);
        }
    };

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
            await Share.share({
                title: 'Invitación a Vorian',
                message: [
                    `Hola ${contact.name}, te invito a conversar conmigo en Vorian.`,
                    'Abre este enlace para entrar a Vorian:',
                    PING_PUBLIC_INVITE_URL,
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

    const renderContact = ({ item, index }: { item: DeviceContact; index: number }) => {
        const isRegistered = !!item.registered;
        const isBusy = busyContactId === item.id;
        const label = item.registered?.full_name || item.name;
        const first = index === 0;
        const last = index === filteredContacts.length - 1;
        return (
            <View style={[first && styles.bandFirst, last && styles.bandLast]}>
                <Glass style={[StyleSheet.absoluteFill, styles.bandGlass]} intensity={22} tint={colors.glassTintLight} />
                <TouchableOpacity
                    style={styles.row}
                    onPress={() => isRegistered ? openRegisteredContact(item) : inviteContact(item)}
                    disabled={!!busyContactId}
                    activeOpacity={0.7}
                >
                    <LinearGradient colors={avatarGradient(label)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                        <Text style={styles.avatarText}>{label.substring(0, 2).toUpperCase()}</Text>
                    </LinearGradient>
                    <View style={styles.info}>
                        <Text style={styles.name} numberOfLines={1}>{label}</Text>
                        <Text style={styles.sub} numberOfLines={1}>{item.phone || item.email}</Text>
                    </View>
                    {isBusy ? (
                        <ActivityIndicator size="small" color={colors.accentBright} />
                    ) : isRegistered ? (
                        <View style={styles.contactAction}>
                            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                            <Text style={styles.chatActionText}>Chatear</Text>
                        </View>
                    ) : (
                        <View style={[styles.contactAction, styles.inviteAction]}>
                            <Text style={styles.inviteActionText}>Invitar</Text>
                        </View>
                    )}
                </TouchableOpacity>
                {!last && <View pointerEvents="none" style={styles.bandSeparator} />}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <ScreenHeader
                title="Nuevo chat"
                subtitle="Elige a alguien de tus contactos"
                onBack={() => navigation.goBack()}
                right={<HeaderButton icon="refresh" label="Actualizar contactos" onPress={() => loadContacts()} disabled={contactsLoading} />}
            />

            <Glass style={styles.searchBar}>
                <Ionicons name="search" size={17} color={colors.textFaint} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar contacto o número..."
                    placeholderTextColor={colors.textFaint}
                    selectionColor={colors.accent}
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                />
                {query.length > 0 ? (
                    <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Limpiar búsqueda">
                        <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                    </TouchableOpacity>
                ) : null}
            </Glass>

            {!permissionDenied ? (
                <View style={styles.privacyNote}>
                    <Ionicons name="lock-closed" size={13} color={colors.accentBright} />
                    <Text style={styles.privacyText}>
                        Tus contactos son privados: Vorian solo compara números para mostrar quién ya está aquí.
                    </Text>
                </View>
            ) : null}

            {contactsLoading ? (
                <View style={styles.centerState}>
                    <ActivityIndicator size="large" color={colors.accentBright} />
                    <Text style={styles.stateText}>Buscando tus contactos…</Text>
                </View>
            ) : permissionDenied ? (
                <View style={styles.centerState}>
                    <EmptyIcon name="people" />
                    <Text style={styles.emptyTitle}>¿Buscamos a tus contactos en Vorian?</Text>
                    <Text style={styles.emptyText}>
                        Para mostrarte quién ya usa Vorian, la app lee los nombres, teléfonos y correos de tu agenda y envía los teléfonos y correos a nuestro servidor, de forma cifrada, solo para compararlos. No los guardamos ni los usamos para nada más.
                    </Text>
                    <Text style={styles.disclosureLink} onPress={() => openLegal('privacy')}>Ver la Política de privacidad</Text>
                    <PrimaryButton
                        label={canAskForContacts ? 'Permitir contactos' : 'Abrir configuración'}
                        onPress={() => canAskForContacts ? loadContacts(true) : Linking.openSettings()}
                    />
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
                            <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
                            <Text style={styles.discoveryWarningText}>{discoveryWarning}</Text>
                            <TouchableOpacity onPress={() => loadContacts()}>
                                <Text style={styles.discoveryRetry}>Reintentar</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}
                    <FlatList
                        data={filteredContacts}
                        keyExtractor={(contact) => contact.id}
                        renderItem={renderContact}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={() => (
                            <View style={styles.centerState}>
                                {contactAccess === 'limited' ? (
                                    <>
                                        <EmptyIcon name="people" />
                                        <Text style={styles.emptyTitle}>Selecciona tus contactos</Text>
                                        <Text style={styles.emptyText}>
                                            iOS dio acceso limitado. Puedes seleccionar algunos contactos o permitir la agenda completa.
                                        </Text>
                                        <PrimaryButton label="Seleccionar contactos" onPress={selectLimitedContacts} />
                                        <SecondaryButton label="Dar acceso completo" onPress={() => Linking.openSettings()} />
                                    </>
                                ) : (
                                    <>
                                        <EmptyIcon name="search" />
                                        <Text style={styles.emptyTitle}>No encontramos contactos</Text>
                                        <Text style={styles.emptyText}>
                                            Revisa que tus contactos tengan un número móvil o correo electrónico.
                                        </Text>
                                        <SecondaryButton label="Revisar permiso de contactos" onPress={() => Linking.openSettings()} />
                                    </>
                                )}
                            </View>
                        )}
                    />
                </>
            )}
        </View>
    );
}

function EmptyIcon({ name }: { name: React.ComponentProps<typeof Ionicons>['name'] }) {
    return (
        <View style={styles.emptyIcon}>
            <Ionicons name={name} size={30} color={colors.accentBright} />
        </View>
    );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
    return (
        <TouchableOpacity style={styles.primaryButton} onPress={onPress} activeOpacity={0.85}>
            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.primaryButtonText}>{label}</Text>
        </TouchableOpacity>
    );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
    return (
        <TouchableOpacity style={styles.secondaryButton} onPress={onPress}>
            <Text style={styles.secondaryButtonText}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.md,
        paddingHorizontal: 14,
        height: 46,
        gap: 10,
        marginHorizontal: space.lg,
        marginTop: space.lg,
    },
    searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
    privacyNote: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginHorizontal: space.xl,
        marginTop: space.md,
    },
    privacyText: { ...type.caption, flex: 1, color: colors.textFaint, lineHeight: 17 },
    sectionLabel: { ...type.overline, paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.sm },
    discoveryWarning: {
        marginHorizontal: space.lg,
        marginBottom: space.md,
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: colors.warningTint,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    discoveryWarningText: { ...type.caption, flex: 1, color: colors.text, lineHeight: 17 },
    discoveryRetry: { fontFamily: fonts.bold, fontSize: 12, color: colors.warning },
    listContent: { paddingBottom: space.xxl },
    bandGlass: { borderWidth: 0 },
    bandFirst: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
    bandLast: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder },
    bandSeparator: { position: 'absolute', left: 80, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.xl,
        paddingVertical: space.md,
    },
    avatar: {
        width: 46,
        height: 46,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    avatarText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.silver },
    info: { flex: 1, minWidth: 0 },
    name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
    sub: { ...type.subhead, fontSize: 13, marginTop: 2 },
    contactAction: {
        borderRadius: radius.full,
        paddingHorizontal: 14,
        paddingVertical: 8,
        minWidth: 76,
        alignItems: 'center',
        overflow: 'hidden',
    },
    inviteAction: { backgroundColor: colors.glassRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
    chatActionText: { fontFamily: fonts.bold, fontSize: 12, color: colors.onAccent },
    inviteActionText: { fontFamily: fonts.bold, fontSize: 12, color: colors.accentBright },
    centerState: { padding: 42, alignItems: 'center' },
    stateText: { ...type.subhead, marginTop: space.md },
    emptyIcon: {
        width: 64,
        height: 64,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentTint,
        marginBottom: space.lg,
    },
    emptyTitle: { ...type.headline, fontSize: 17, marginBottom: space.sm, textAlign: 'center' },
    emptyText: { ...type.subhead, textAlign: 'center', lineHeight: 20 },
    disclosureLink: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.accentBright, textAlign: 'center', marginTop: space.sm, marginBottom: space.md },
    primaryButton: {
        marginTop: space.xl,
        borderRadius: radius.full,
        paddingHorizontal: space.xl,
        paddingVertical: 12,
        overflow: 'hidden',
    },
    primaryButtonText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onAccent },
    secondaryButton: {
        marginTop: space.sm,
        borderRadius: radius.full,
        paddingHorizontal: space.xl,
        paddingVertical: 12,
        backgroundColor: colors.glassRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    secondaryButtonText: { fontFamily: fonts.bold, fontSize: 14, color: colors.accentBright },
});
