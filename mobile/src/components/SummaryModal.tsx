import React from 'react';
import { Modal, TouchableOpacity, View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { SheetFill, sheetSurface } from '../design/Sheet';
import { PingOrb } from '../design/PingOrb';
import { summaryCommitments, type SummaryCommitment } from '../utils/chatSummaryCommitments';

// "Resumen de este chat": what the talk was about, the chat's real
// commitments (with their real date and state) and where the talk ended,
// so nobody has to read a hundred messages.

export type ChatSummarySections = {
    overview: string;
    agreements: string[];
    pending: Array<{ person: string; items: string[] }>;
    latest: string;
};

export type ChatSummary = { text: string; sections: ChatSummarySections | null; messageCount?: number };

type SummaryModalProps = {
    summary: ChatSummary | null;
    onClose: () => void;
    onAskPing?: () => void;
    commitments?: any[];
    currentUserId?: string | null;
    onOpenCommitments?: () => void;
};

function Section({ icon, title, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: React.ReactNode }) {
    return (
        <View style={styles.card}>
            {/* No blur here: a sheet is its own window and its blur turns grey once the phone rests. */}
            <LinearGradient colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.03)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.cardHeader}>
                <Ionicons name={icon} size={16} color={colors.accentBright} />
                <Text style={styles.cardTitle}>{title}</Text>
            </View>
            {children}
        </View>
    );
}

const STATE_LOOK: Record<SummaryCommitment['state'], { label: string; tone: string }> = {
    overdue: { label: 'Atrasado', tone: colors.warning },
    pending: { label: 'Pendiente', tone: colors.accentBright },
    expired: { label: 'Sin respuesta', tone: colors.textSoft },
    done: { label: 'Cumplido', tone: colors.success },
};

function CommitmentLine({ item }: { item: SummaryCommitment }) {
    const look = STATE_LOOK[item.state];
    const meta = [item.when, item.who].filter(Boolean).join(' · ');
    return (
        <View style={styles.bulletRow}>
            <View style={[styles.bulletDot, { backgroundColor: look.tone }]} />
            <View style={{ flex: 1 }}>
                <Text style={styles.bulletText}>{item.title}</Text>
                <Text style={styles.metaText}>
                    {meta ? `${meta} · ` : ''}<Text style={{ color: look.tone }}>{look.label}</Text>
                </Text>
            </View>
        </View>
    );
}

const Bullet = ({ text }: { text: string }) => (
    <View style={styles.bulletRow}>
        <View style={styles.bulletDot} />
        <Text style={styles.bulletText}>{text}</Text>
    </View>
);

export function SummaryModal({ summary, onClose, onAskPing, commitments, currentUserId, onOpenCommitments }: SummaryModalProps) {
    const sections = summary?.sections;
    // A chat with commitments shows them as they really are; only a chat with
    // none falls back to what Ping read in the messages.
    const real = commitments?.length ? summaryCommitments(commitments, currentUserId) : null;
    return (
        <Modal visible={!!summary} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <View style={styles.sheet}>
                    <SheetFill />
                    <View style={styles.header}>
                        <PingOrb size={30} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>Resumen de este chat</Text>
                            {!!summary?.messageCount && <Text style={styles.subtitle}>Últimos {summary.messageCount} mensajes</Text>}
                        </View>
                        <TouchableOpacity onPress={onClose} accessibilityLabel="Cerrar" hitSlop={8}>
                            <Ionicons name="close" size={22} color={colors.textSoft} />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.scroll} contentContainerStyle={{ gap: space.md }}>
                        {sections ? (
                            <>
                                {!!sections.overview && <Text style={styles.overview}>{sections.overview}</Text>}
                                {real ? (
                                    <>
                                        {real.open.length > 0 && (
                                            <Section icon="time-outline" title="Compromisos de este chat">
                                                {real.open.map((c) => <CommitmentLine key={c.id} item={c} />)}
                                                {onOpenCommitments && (
                                                    <TouchableOpacity onPress={onOpenCommitments} style={styles.seeAll} accessibilityRole="button">
                                                        <Text style={styles.seeAllText}>{real.openTotal > real.open.length ? `Ver los ${real.openTotal}` : 'Ver compromisos'}</Text>
                                                        <Ionicons name="chevron-forward" size={15} color={colors.accentBright} />
                                                    </TouchableOpacity>
                                                )}
                                            </Section>
                                        )}
                                        {real.recentlyDone.length > 0 && (
                                            <Section icon="checkmark-circle-outline" title="Cumplidos hace poco">
                                                {real.recentlyDone.map((c) => <CommitmentLine key={c.id} item={c} />)}
                                            </Section>
                                        )}
                                    </>
                                ) : sections.agreements.length > 0 && (
                                    <Section icon="checkmark-circle-outline" title="Acuerdos">
                                        {sections.agreements.map((a, i) => <Bullet key={i} text={a} />)}
                                    </Section>
                                )}
                                {!real && sections.pending.length > 0 && (
                                    <Section icon="time-outline" title="Pendientes">
                                        {sections.pending.map((p) => (
                                            <View key={p.person} style={styles.person}>
                                                <Text style={styles.personName}>{p.person}</Text>
                                                {p.items.map((item, i) => <Bullet key={i} text={item} />)}
                                            </View>
                                        ))}
                                    </Section>
                                )}
                                {!!sections.latest && (
                                    <Section icon="chatbubble-ellipses-outline" title="Lo último">
                                        <Text style={styles.bulletText}>{sections.latest}</Text>
                                    </Section>
                                )}
                            </>
                        ) : (
                            <Text style={styles.overview}>{summary?.text}</Text>
                        )}
                    </ScrollView>
                    {onAskPing && (
                        <TouchableOpacity style={styles.askBtn} onPress={onAskPing}>
                            <Ionicons name="chatbubbles-outline" size={17} color={colors.accentBright} />
                            <Text style={styles.askText}>Preguntarle a Ping sobre este chat</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                        <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        <Text style={styles.doneText}>Entendido</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.xl, maxHeight: '85%', ...sheetSurface },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg, gap: space.md },
    title: { fontSize: 18, fontFamily: fonts.bold, color: colors.text },
    subtitle: { ...type.caption, color: colors.textFaint, marginTop: 1 },
    scroll: { marginBottom: space.lg },
    overview: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.text },
    card: {
        borderRadius: radius.lg, overflow: 'hidden', padding: space.lg, gap: space.sm,
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, borderTopColor: colors.glassEdge,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    cardTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentBright },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
    bulletDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textSoft, marginTop: 8 },
    bulletText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text },
    metaText: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: colors.textSoft, marginTop: 1 },
    seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingTop: 4 },
    seeAllText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.accentBright },
    person: { gap: 4 },
    personName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
    askBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderRadius: radius.md, padding: 14, marginBottom: space.sm,
        backgroundColor: colors.glassRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
    },
    askText: { color: colors.accentBright, fontFamily: fonts.semibold, fontSize: 14 },
    doneBtn: { borderRadius: radius.md, padding: 15, alignItems: 'center', overflow: 'hidden' },
    doneText: { color: colors.onAccent, fontFamily: fonts.bold, fontSize: 15 },
});
