import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CachedImage } from '../../design/CachedImage';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, space } from '../../design/tokens';
import { fonts, type } from '../../design/typography';
import { Glass } from '../../design/Glass';
import { avatarGradient } from '../../design/ScreenHeader';

interface GroupMembersSectionProps {
    members: any[];
    isAdmin: boolean;
    currentUserId?: string;
    isUpdatingParticipantRole?: boolean;
    onToggleAdmin: (member: any) => void;
}

export function GroupMembersSection({
    members,
    isAdmin,
    currentUserId,
    isUpdatingParticipantRole,
    onToggleAdmin,
}: GroupMembersSectionProps) {
    if (!members.length) return null;

    return (
        <View style={styles.card}>
            <Glass style={[StyleSheet.absoluteFill, styles.cardGlass]} intensity={22} tint={colors.glassTintLight} />
            {/* The title lives inside the card, as its first line. */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Participantes</Text>
                <Text style={styles.headerCount}>{members.length}</Text>
            </View>
            {members.map((member) => {
                    const label = member.full_name || member.email || '?';
                    return (
                        <View key={member.id} style={styles.memberRow}>
                            <View pointerEvents="none" style={styles.divider} />
                            {member.avatar_url ? (
                                <CachedImage uri={member.avatar_url} style={styles.memberAvatar} />
                            ) : (
                                <LinearGradient colors={avatarGradient(label)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.memberAvatar}>
                                    <Text style={styles.memberInitials}>{label.substring(0, 2).toUpperCase()}</Text>
                                </LinearGradient>
                            )}
                            <View style={styles.memberInfo}>
                                <View style={styles.nameLine}>
                                    <Text style={styles.memberName} numberOfLines={1}>{label}</Text>
                                    {member.role === 'admin' && <Text style={styles.adminBadge}>Admin</Text>}
                                </View>
                                {!!member.email && <Text style={styles.memberSubline} numberOfLines={1}>{member.email}</Text>}
                            </View>
                            {isAdmin && member.id !== currentUserId && (
                                <TouchableOpacity
                                    style={[styles.memberRoleBtn, isUpdatingParticipantRole && styles.memberRoleBtnBusy]}
                                    onPress={() => onToggleAdmin(member)}
                                    disabled={isUpdatingParticipantRole}
                                >
                                    <Text style={styles.memberRoleBtnText}>{member.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                })}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { marginTop: space.lg, marginHorizontal: space.lg, borderRadius: radius.lg, overflow: 'hidden' },
    cardGlass: { borderRadius: radius.lg, borderTopColor: colors.glassEdge },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md },
    headerTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
    headerCount: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textSoft },
    memberRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md },
    divider: {
        position: 'absolute',
        top: 0,
        left: space.lg + 44 + space.md,
        right: 0,
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.separator,
    },
    memberAvatar: {
        width: 44,
        height: 44,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        marginRight: space.md,
    },
    memberInitials: { fontFamily: fonts.semibold, fontSize: 15, color: colors.silver },
    memberInfo: { flex: 1, minWidth: 0 },
    nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    memberName: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
    memberSubline: { ...type.caption, color: colors.textFaint, marginTop: 2 },
    adminBadge: {
        fontFamily: fonts.semibold,
        fontSize: 11,
        color: colors.success,
        backgroundColor: colors.successTint,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: radius.full,
        overflow: 'hidden',
    },
    memberRoleBtn: {
        paddingHorizontal: space.md,
        paddingVertical: 7,
        borderRadius: radius.full,
        backgroundColor: colors.glassRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    memberRoleBtnBusy: { opacity: 0.6 },
    memberRoleBtnText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.accentBright },
});
