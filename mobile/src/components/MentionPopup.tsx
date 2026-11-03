import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../design/tokens';
import { fonts } from '../design/typography';

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
        backgroundColor: colors.surfaceSolid,
        marginHorizontal: 8,
        marginBottom: 4,
        borderRadius: 16,
        shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 8, elevation: 5,
        borderWidth: 1, borderColor: colors.glassBorder,
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
        borderBottomColor: colors.glassBorder,
    },
    mentionAvatar: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: colors.accentTint,
        alignItems: 'center', justifyContent: 'center',
    },
    mentionAvatarLetter: { color: colors.onAccent, fontFamily: fonts.bold, fontSize: 15 },
    mentionName: { fontSize: 14, fontFamily: fonts.bold, color: colors.text },
    mentionEmail: { fontFamily: fonts.regular, fontSize: 12, color: colors.textFaint },
});
