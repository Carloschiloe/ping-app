import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

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

    const renderItem = ({ item }: { item: any }) => (
        <View style={styles.card}>
            <Text style={styles.cardLabel}>{item.title ? 'COMPROMISO' : 'MENSAJE'}</Text>
            <Text style={styles.cardText}>{item.title || item.text}</Text>
        </View>
    );

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
    input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', padding: 16, borderRadius: 12 },
    card: { backgroundColor: 'white', padding: 16, marginHorizontal: 16, marginVertical: 4, borderRadius: 8 },
    cardLabel: { color: '#6b7280', fontSize: 11, marginBottom: 4 },
    cardText: { color: 'black' },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: '#9ca3af' },
});
