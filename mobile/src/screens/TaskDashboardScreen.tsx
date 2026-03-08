import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import GroupTaskCard from '../components/GroupTaskCard';
import { useAuth } from '../context/AuthContext';

type Tab = 'pending' | 'proposed' | 'sent';

export default function TaskDashboardScreen() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('pending');

    const { data: commitments = [], isLoading, refetch } = useQuery({
        queryKey: ['all-commitments-dashboard'],
        queryFn: async () => {
            const { data } = await apiClient.get('/commitments');
            return data;
        }
    });

    const filteredData = commitments.filter((c: any) => {
        if (activeTab === 'pending') {
            return c.assigned_to_user_id === user?.id && (c.status === 'accepted' || c.status === 'pending');
        }
        if (activeTab === 'proposed') {
            return c.assigned_to_user_id === user?.id && c.status === 'proposed';
        }
        if (activeTab === 'sent') {
            return c.owner_user_id === user?.id && c.assigned_to_user_id !== user?.id;
        }
        return false;
    });

    const renderTab = (id: Tab, label: string, icon: any) => (
        <TouchableOpacity
            style={[styles.tab, activeTab === id && styles.activeTab]}
            onPress={() => setActiveTab(id)}
        >
            <Ionicons name={icon} size={20} color={activeTab === id ? '#6366f1' : '#6b7280'} />
            <Text style={[styles.tabText, activeTab === id && styles.activeTabText]}>{label}</Text>
            {activeTab === id && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Tu Tablero Ping</Text>
                <Text style={styles.headerSubtitle}>Gestiona tus compromisos y delegaciones</Text>
            </View>

            <View style={styles.tabsContainer}>
                {renderTab('pending', 'Mis Tareas', 'checkbox')}
                {renderTab('proposed', 'Por Confirmar', 'mail-unread')}
                {renderTab('sent', 'Enviadas', 'paper-plane')}
            </View>

            <FlatList
                data={filteredData}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => <GroupTaskCard commitment={item} />}
                onRefresh={refetch}
                refreshing={isLoading}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="folder-open-outline" size={64} color="#d1d5db" />
                        <Text style={styles.emptyText}>No hay tareas en esta sección</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
    },
    header: {
        padding: 20,
        backgroundColor: 'white',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#111827',
    },
    headerSubtitle: {
        fontSize: 14,
        color: '#6b7280',
        marginTop: 4,
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
        paddingHorizontal: 8,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 14,
        gap: 4,
        position: 'relative',
    },
    activeTab: {
        // ...
    },
    tabText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6b7280',
    },
    activeTabText: {
        color: '#6366f1',
    },
    tabIndicator: {
        position: 'absolute',
        bottom: 0,
        left: '20%',
        right: '20%',
        height: 3,
        backgroundColor: '#6366f1',
        borderTopLeftRadius: 3,
        borderTopRightRadius: 3,
    },
    listContent: {
        paddingVertical: 12,
        paddingBottom: 40,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 80,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
        color: '#9ca3af',
        fontWeight: '500',
    }
});
