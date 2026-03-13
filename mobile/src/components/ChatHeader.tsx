import React from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';

interface ChatHeaderProps {
    chatTitle: string;
    avatarUrl?: string;
    isGroup: boolean;
    isSummarizing: boolean;
    onSummarize: () => void;
    onVoiceCall: () => void;
    onVideoCall: () => void;
    onInfo: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
    chatTitle,
    avatarUrl,
    isGroup,
    isSummarizing,
    onSummarize,
    onVoiceCall,
    onVideoCall,
    onInfo
}) => {
    return (
        <View style={styles.headerContainer}>
            <TouchableOpacity style={styles.titleSection} onPress={onInfo} activeOpacity={0.7}>
                {avatarUrl ? (
                    <View style={styles.avatarWrap}>
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                    </View>
                ) : (
                    <View style={[styles.avatarWrap, { backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name={isGroup ? "people" : "person"} size={20} color={theme.colors.secondary} />
                    </View>
                )}
                <Text style={styles.titleText} numberOfLines={1}>{chatTitle}</Text>
            </TouchableOpacity>

            <View style={styles.actionsSection}>
                <TouchableOpacity onPress={onVoiceCall} style={styles.iconBtn}>
                    <Ionicons name="call" size={20} color={theme.colors.white} />
                </TouchableOpacity>
                <TouchableOpacity onPress={onVideoCall} style={styles.iconBtn}>
                    <Ionicons name="videocam" size={22} color={theme.colors.white} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
    },
    titleSection: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    avatarWrap: {
        width: 32,
        height: 32,
        borderRadius: 16,
        overflow: 'hidden',
        marginRight: theme.spacing.sm + 2,
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    titleText: {
        color: theme.colors.white,
        fontSize: theme.typography.h3.fontSize,
        fontWeight: theme.typography.h3.fontWeight as any,
    },
    actionsSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md - 4,
    },
    headerActionBtn: {
        backgroundColor: theme.colors.background,
        borderRadius: theme.borderRadius.lg,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    summarizeBtnInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    summarizeBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.secondary,
    },
    iconBtn: {
        padding: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
