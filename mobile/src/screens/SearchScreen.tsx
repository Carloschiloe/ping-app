import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

const useSearch = (query: string) => {
    return useQuery({
        queryKey: ['search', query],
        queryFn: async () => {
            if (!query) return { messages: [], commitments: [] };
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            if (!res.ok) throw new Error('Failed to search');
            return res.json();
        },
        enabled: query.length > 2,
    });
};

export default function SearchScreen() {
    const [query, setQuery] = useState('');
    const { data, isLoading } = useSearch(query);
    const navigation = useNavigation<any>();

    const renderItem = ({ item }: { item: any }) => {
        const isCommitment = !!item.title;
        const Icon = isCommitment ? 'calendar' : 'chatbubble-outline';
        const label = isCommitment ? 'COMPROMISO' : 'MENSAJE';
        const title = isCommitment ? item.title : item.text;
        const senderName = !isCommitment && item.sender ? (item.sender.full_name || item.sender.email?.split('@')[0]) : null;

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => {
                    if (isCommitment && item.message_id) {
                        navigation.navigate('Chats', {
                            screen: 'Chat',
                            params: {
                                conversationId: item.conversation_id || item.message?.conversation_id,
                                scrollToMessageId: item.message_id
                            }
                        });
                    } else if (!isCommitment) {
                        navigation.navigate('Chats', {
                            screen: 'Chat',
                            params: {
                                conversationId: item.conversation_id,
                                scrollToMessageId: item.id
                            }
                        });
                    }
                }}
            >
                <View style={styles.cardHeader}>
                    <Ionicons name={Icon as any} size={14} color="#6b7280" />
                    <Text style={styles.cardLabel}>{label}</Text>
                    {senderName && <Text style={styles.senderLabel}> • {senderName}</Text>}
                </View>
                <Text style={styles.cardText} numberOfLines={2}>{title}</Text>
                {item.created_at && (
                    <Text style={styles.dateLabel}>
                        {new Date(item.created_at).toLocaleDateString()}
                    </Text>
                )}
            </TouchableOpacity>
        );
    };

    const combinedData = [
        ...(data?.commitments || []),
        ...(data?.messages || [])
    ];

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.heading}>Buscar</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Busca en mensajes y compromisos..."
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                />
            </View>
            {isLoading ? (
                <ActivityIndicator size="large" style={{ marginTop: 40 }} color="#3b82f6" />
            ) : combinedData.length === 0 && query.length > 2 ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyText}>No se encontraron resultados.</Text>
                </View>
            ) : (
                <FlatList
                    data={combinedData}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb', paddingTop: 64 },
    header: { paddingHorizontal: 16, marginBottom: 16 },
    heading: { fontSize: 28, fontWeight: 'bold', marginBottom: 16 },
    input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', padding: 16, borderRadius: 12, fontSize: 16 },
    card: { backgroundColor: 'white', padding: 16, marginHorizontal: 16, marginVertical: 6, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    cardLabel: { color: '#6b7280', fontSize: 12, fontWeight: '600', marginLeft: 6 },
    senderLabel: { color: '#3b82f6', fontSize: 12, fontWeight: '500' },
    cardText: { color: '#1f2937', fontSize: 15, lineHeight: 20 },
    dateLabel: { color: '#9ca3af', fontSize: 11, marginTop: 8 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
    emptyText: { color: '#9ca3af', fontSize: 16 },
});
