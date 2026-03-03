import React from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useCommitments, useMarkCommitmentDone } from '../api/queries';
import { useNavigation } from '@react-navigation/native';

export default function HoyScreen() {
    const { data: commitments, isLoading } = useCommitments('pending');
    const { mutate: markDone } = useMarkCommitmentDone();
    const navigation = useNavigation<any>();

    const renderItem = ({ item }: { item: any }) => (
        <View style={styles.card}>
            <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDate}>
                    {item.due_at ? new Date(item.due_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha'}
                </Text>

                {item.message_id && (
                    <TouchableOpacity
                        style={styles.linkBtn}
                        onPress={() => navigation.navigate('Chats', {
                            screen: 'Chat',
                            params: {
                                conversationId: item.message?.conversation_id, // We'll need to join this in backend or handle it
                                scrollToMessageId: item.message_id
                            }
                        })}
                    >
                        <Text style={styles.linkBtnText}>Ir al mensaje →</Text>
                    </TouchableOpacity>
                )}
            </View>
            <TouchableOpacity style={styles.doneBtn} onPress={() => markDone(item.id)}>
                <Text style={styles.doneBtnText}>✓</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.heading}>Compromisos</Text>
            {isLoading ? (
                <ActivityIndicator size="large" color="#3b82f6" />
            ) : commitments?.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No tienes compromisos pendientes.</Text>
                </View>
            ) : (
                <FlatList
                    data={commitments}
                    keyExtractor={c => c.id}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb', paddingTop: 64 },
    heading: { fontSize: 28, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 16 },
    card: { backgroundColor: 'white', padding: 16, marginHorizontal: 16, marginVertical: 8, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    cardContent: { flex: 1, paddingRight: 16 },
    cardTitle: { fontWeight: '600', fontSize: 16 },
    cardDate: { color: '#6b7280', marginTop: 4, fontSize: 13 },
    linkBtn: { marginTop: 8 },
    linkBtnText: { color: '#3b82f6', fontSize: 13, fontWeight: '600' },
    doneBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#22c55e', alignItems: 'center', justifyContent: 'center' },
    doneBtnText: { color: '#22c55e', fontSize: 18, fontWeight: 'bold' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: '#9ca3af', fontSize: 16 },
});
