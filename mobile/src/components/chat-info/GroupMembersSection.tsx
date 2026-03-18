import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';

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
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{members.length} Integrantes</Text>
            {members.map((member) => (
                <View key={member.id} style={styles.memberRow}>
                    <View style={styles.memberAvatar}>
                        {member.avatar_url ? (
                            <Image source={{ uri: member.avatar_url }} style={{ width: '100%', height: '100%' }} />
                        ) : (
                            <Text style={styles.memberInitials}>{member.email.substring(0, 2).toUpperCase()}</Text>
                        )}
                    </View>
                    <View style={styles.memberInfo}>
                        <Text style={styles.memberEmail}>{member.full_name || member.email}</Text>
                        <Text style={styles.memberSubline}>{member.email}</Text>
                        {member.role === 'admin' && <Text style={styles.adminBadge}>Admin</Text>}
                    </View>
                    {isAdmin && member.id !== currentUserId && (
                        <TouchableOpacity
                            style={[styles.memberRoleBtn, isUpdatingParticipantRole && { opacity: 0.6 }]}
                            onPress={() => onToggleAdmin(member)}
                            disabled={isUpdatingParticipantRole}
                        >
                            <Text style={styles.memberRoleBtnText}>{member.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    section: {
        backgroundColor: 'white',
        marginTop: 8,
        padding: 16,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#e5e7eb',
    },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 12 },
    memberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    memberAvatar: {
        width: 44, height: 44, borderRadius: 22, backgroundColor: '#9ca3af',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 12,
    },
    memberInitials: { fontSize: 16, fontWeight: '700', color: 'white' },
    memberInfo: { flex: 1 },
    memberEmail: { fontSize: 16, fontWeight: '500', color: '#111827' },
    memberSubline: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    adminBadge: { fontSize: 12, color: '#10b981', fontWeight: 'bold', marginTop: 2 },
    memberRoleBtn: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: '#eff6ff',
    },
    memberRoleBtnText: { fontSize: 12, fontWeight: '700', color: '#2563eb' },
});
