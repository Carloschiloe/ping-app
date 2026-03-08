import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Participant {
    id: string;
    full_name: string;
    email: string;
}

interface MentionPopupProps {
    participants: Participant[];
    onSelect: (participant: Participant) => void;
}

const MentionPopup = ({ participants, onSelect }: MentionPopupProps) => {
    if (participants.length === 0) return null;

    return (
        <View style={styles.mentionPopup}>
            {participants.map(p => (
                <TouchableOpacity
                    key={p.id}
                    style={styles.mentionItem}
                    onPress={() => onSelect(p)}
                >
                    <View style={styles.mentionAvatar}>
                        <Text style={styles.mentionAvatarLetter}>
                            {(p.full_name || p.email)[0].toUpperCase()}
                        </Text>
                    </View>
                    <View>
                        <Text style={styles.mentionName}>{p.full_name || p.email.split('@')[0]}</Text>
                        <Text style={styles.mentionEmail}>{p.email}</Text>
                    </View>
                </TouchableOpacity>
            ))}
        </View>
    );
};

export default MentionPopup;

const styles = StyleSheet.create({
    mentionPopup: {
        backgroundColor: 'white',
        marginHorizontal: 8,
        marginBottom: 4,
        borderRadius: 16,
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 5,
        borderWidth: 1, borderColor: '#e5e7eb',
        overflow: 'hidden',
        maxHeight: 200,
    },
    mentionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 14,
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    mentionAvatar: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#6366f1',
        alignItems: 'center', justifyContent: 'center',
    },
    mentionAvatarLetter: { color: 'white', fontWeight: '700', fontSize: 15 },
    mentionName: { fontSize: 14, fontWeight: '700', color: '#111827' },
    mentionEmail: { fontSize: 12, color: '#6b7280' },
});
