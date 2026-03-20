import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';

interface ChatHeaderProps {
    chatTitle: string;
    avatarUrl?: string;
    isGroup: boolean;
    onVoiceCall: () => void;
    onVideoCall: () => void;
    onInfo: () => void;
    onMenu: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
    chatTitle,
    avatarUrl,
    isGroup,
    onVoiceCall,
    onVideoCall,
    onInfo,
    onMenu
}) => {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

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
                <TouchableOpacity onPress={onMenu} style={[styles.iconBtn, styles.menuBtn]}>
                    <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.white} />
                </TouchableOpacity>
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

const createStyles = (theme: any) => StyleSheet.create({
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
        gap: theme.spacing.sm,
    },
    iconBtn: {
        padding: 6,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
    },
    menuBtn: {
        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)',
        borderWidth: 1,
        borderColor: theme.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.25)',
    }
});
