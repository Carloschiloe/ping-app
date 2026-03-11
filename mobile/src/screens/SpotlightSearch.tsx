import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity, ScrollView, Animated, Platform, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useConversations, useGetOrCreateSelfConversation, useCreateConversation } from '../api/queries';
import { LinearGradient } from 'expo-linear-gradient';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

const useSearch = (query: string) => {
    return useQuery({
        queryKey: ['search', query],
        queryFn: async () => {
            if (!query) return { messages: [], commitments: [], profiles: [], conversations: [] };
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            if (!res.ok) throw new Error('Failed to search');
            return res.json();
        },
        enabled: query.trim().length > 1,
    });
};

const HighlightText = ({ text, highlight, style, numberOfLines }: any) => {
    if (!highlight.trim()) {
        return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
    }
    const regex = new RegExp(`(${highlight})`, 'gi');
    const parts = text.split(regex);
    return (
        <Text style={style} numberOfLines={numberOfLines}>
            {parts.map((part: string, i: number) =>
                regex.test(part) ? (
                    <Text key={i} style={{ backgroundColor: '#fef08a', color: '#854d0e', fontWeight: '800' }}>{part}</Text>
                ) : (
                    <Text key={i}>{part}</Text>
                )
            )}
        </Text>
    );
};

export default function SearchScreen() {
    const [query, setQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'messages' | 'people' | 'tasks'>('all');
    const { data, isLoading } = useSearch(query);
    const navigation = useNavigation<any>();
    const { data: convData } = useConversations();
    const conversations = convData?.conversations || [];
    const { mutateAsync: getSelfConversation } = useGetOrCreateSelfConversation();
    const { mutateAsync: createConversation } = useCreateConversation();

    const sections = useMemo(() => {
        if (!data) return [];
        const result = [];

        // People & Groups
        const peopleAndGroups = [
            ...(data.conversations || []).map((c: any) => ({ ...c, type: 'group' })),
            ...(data.profiles || []).map((p: any) => ({ ...p, type: 'person' }))
        ];

        if (peopleAndGroups.length > 0 && (activeFilter === 'all' || activeFilter === 'people')) {
            result.push({ title: 'Contactos y Grupos', data: peopleAndGroups, type: 'people' });
        }

        // Commitments
        if ((data.commitments || []).length > 0 && (activeFilter === 'all' || activeFilter === 'tasks')) {
            result.push({ title: 'Tareas y Compromisos', data: data.commitments, type: 'tasks' });
        }

        // Messages
        if ((data.messages || []).length > 0 && (activeFilter === 'all' || activeFilter === 'messages')) {
            result.push({ title: 'Mensajes encontrados', data: data.messages, type: 'messages' });
        }

        return result;
    }, [data, activeFilter]);

    const handleResultPress = async (item: any, type: string) => {
        if (type === 'person') {
            const res = await createConversation(item.id);
            navigation.navigate('Chats', {
                screen: 'Chat',
                params: { conversationId: res.id, otherUser: item, isGroup: false }
            });
            return;
        }

        if (type === 'group') {
            navigation.navigate('Chats', {
                screen: 'Chat',
                params: { conversationId: item.id, otherUser: null, isGroup: true, groupMetadata: item }
            });
            return;
        }

        const isCommitment = type === 'tasks';
        const conversationId = isCommitment ? (item.conversation_id || item.message?.conversation_id) : item.conversation_id;
        const conv = conversations.find((c: any) => c.id === conversationId);
        const isSelfChat = !conversationId || conv?.isSelf;

        let targetConversationId = conversationId;
        if (!targetConversationId && isSelfChat) {
            try {
                const res = await getSelfConversation();
                targetConversationId = res?.conversationId;
            } catch (e) {
                return;
            }
        }

        navigation.navigate('Chats', {
            screen: 'Chat',
            params: {
                conversationId: targetConversationId,
                scrollToMessageId: isCommitment ? item.message_id : item.id,
                isGroup: conv?.isGroup,
                otherUser: conv?.otherUser,
                groupMetadata: conv?.groupMetadata,
                isSelf: isSelfChat
            }
        });
    };

    const renderSection = ({ item: section }: { item: any }) => (
        <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.data.map((item: any) => (
                <TouchableOpacity
                    key={item.id}
                    style={styles.resultCard}
                    onPress={() => handleResultPress(item, item.type || section.type)}
                >
                    <View style={styles.resultIcon}>
                        {item.avatar_url ? (
                            <Image source={{ uri: item.avatar_url }} style={styles.resultAvatar} />
                        ) : (
                            <View style={[styles.resultIconInner, { backgroundColor: item.type === 'person' ? '#3b82f6' : (item.type === 'group' ? '#10b981' : '#f59e0b') }]}>
                                <Ionicons
                                    name={item.type === 'person' ? 'person' : (item.type === 'group' ? 'people' : (section.type === 'tasks' ? 'calendar' : 'chatbubble'))}
                                    size={16}
                                    color="white"
                                />
                            </View>
                        )}
                    </View>
                    <View style={styles.resultInfo}>
                        <HighlightText
                            text={item.full_name || item.name || item.title || item.text}
                            highlight={query}
                            style={styles.resultText}
                            numberOfLines={2}
                        />
                        <View style={styles.resultMeta}>
                            <Text style={styles.resultSubtext}>
                                {item.type === 'person' ? item.email : (item.type === 'group' ? 'Chat de grupo' : (section.type === 'tasks' ? 'Compromiso' : `De ${item.sender?.full_name || 'Alguien'}`))}
                            </Text>
                            {item.created_at && <Text style={styles.resultDate}> • {new Date(item.created_at).toLocaleDateString()}</Text>}
                        </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </TouchableOpacity>
            ))}
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            <View style={styles.header}>
                <Text style={styles.heading}>Buscar</Text>
                <View style={styles.searchWrapper}>
                    <Ionicons name="search" size={20} color="#64748b" style={styles.searchIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Mensajes, personas, tareas..."
                        value={query}
                        onChangeText={setQuery}
                        autoCapitalize="none"
                        autoFocus
                    />
                    {query.length > 0 && (
                        <TouchableOpacity onPress={() => setQuery('')}>
                            <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                        </TouchableOpacity>
                    )}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filtersContent}>
                    <FilterChip label="Todos" active={activeFilter === 'all'} onPress={() => setActiveFilter('all')} />
                    <FilterChip label="Personas" active={activeFilter === 'people'} onPress={() => setActiveFilter('people')} />
                    <FilterChip label="Mensajes" active={activeFilter === 'messages'} onPress={() => setActiveFilter('messages')} />
                    <FilterChip label="Tareas" active={activeFilter === 'tasks'} onPress={() => setActiveFilter('tasks')} />
                </ScrollView>
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#0f172a" />
                    <Text style={styles.loadingText}>Ping está buscando...</Text>
                </View>
            ) : query.length <= 1 ? (
                <View style={styles.empty}>
                    <View style={styles.emptyIconCircle}>
                        <Ionicons name="search-outline" size={40} color="#94a3b8" />
                    </View>
                    <Text style={styles.emptyTitle}>Explora Ping</Text>
                    <Text style={styles.emptyText}>Escribe un nombre, un mensaje o una tarea para empezar.</Text>
                </View>
            ) : sections.length === 0 ? (
                <View style={styles.empty}>
                    <Ionicons name="alert-circle-outline" size={60} color="#f1f5f9" />
                    <Text style={styles.emptyTitle}>Sin resultados</Text>
                    <Text style={styles.emptyText}>No encontramos nada para "{query}"</Text>
                </View>
            ) : (
                <FlatList
                    data={sections}
                    keyExtractor={item => item.title}
                    renderItem={renderSection}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listContainer}
                />
            )}
        </View>
    );
}

function FilterChip({ label, active, onPress }: any) {
    return (
        <TouchableOpacity
            style={[styles.filterChip, active && styles.filterChipActive]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <Text style={[styles.filterChipText, active && styles.filterChipActiveText]}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fcfdfe' },
    header: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    heading: { fontSize: 32, fontWeight: '900', color: '#0f172a', letterSpacing: -1, marginBottom: 16 },
    searchWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 16, paddingHorizontal: 16, height: 56, marginBottom: 16 },
    searchIcon: { marginRight: 12 },
    input: { flex: 1, fontSize: 17, color: '#0f172a', fontWeight: '500' },
    filters: { marginBottom: 12 },
    filtersContent: { gap: 8 },
    filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
    filterChipActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
    filterChipText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
    filterChipActiveText: { color: 'white' },
    listContainer: { paddingVertical: 20 },
    sectionContainer: { marginBottom: 28 },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.5, marginHorizontal: 24, marginBottom: 12 },
    resultCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, backgroundColor: 'white' },
    resultIcon: { marginRight: 16 },
    resultIconInner: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    resultAvatar: { width: 40, height: 40, borderRadius: 20 },
    resultInfo: { flex: 1, marginRight: 12 },
    resultText: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 2 },
    resultMeta: { flexDirection: 'row', alignItems: 'center' },
    resultSubtext: { fontSize: 13, color: '#64748b' },
    resultDate: { fontSize: 12, color: '#94a3b8' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 16, fontSize: 15, color: '#64748b', fontWeight: '500' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, marginTop: 100 },
    emptyIconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
    emptyText: { fontSize: 16, color: '#94a3b8', textAlign: 'center', lineHeight: 22 },
});
