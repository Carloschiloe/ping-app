import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch, Alert, StyleSheet } from 'react-native';
import { useReport, type ReportReason } from '../../api/queries';
import { colors } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { BaseSheet, ChoiceChips, sheetStyles } from './BaseSheet';

// Report a person, one of their messages, or a Ping reply. Required by
// Google Play for chat apps and for apps that generate content with AI.

export type ReportTarget =
    | { kind: 'user'; userId: string; name?: string | null; conversationId?: string }
    | { kind: 'message'; conversationId: string; messageId: string; name?: string | null }
    | { kind: 'assistant'; excerpt: string; conversationId?: string };

const REASONS: Array<{ value: ReportReason; label: string }> = [
    { value: 'abuse', label: 'Acoso u ofensa' },
    { value: 'spam', label: 'Spam o estafa' },
    { value: 'inappropriate', label: 'Contenido inapropiado' },
    { value: 'other', label: 'Otro' },
];

const ASSISTANT_REASONS: Array<{ value: ReportReason; label: string }> = [
    { value: 'false', label: 'Es incorrecta' },
    { value: 'inappropriate', label: 'Es ofensiva' },
    { value: 'other', label: 'Otro' },
];

export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
    const report = useReport();
    const [reason, setReason] = useState<ReportReason | null>(null);
    const [details, setDetails] = useState('');
    const [alsoBlock, setAlsoBlock] = useState(true);

    useEffect(() => {
        if (target) {
            setReason(null);
            setDetails('');
            setAlsoBlock(true);
        }
    }, [target]);

    const isAssistant = target?.kind === 'assistant';
    const who = target && target.kind !== 'assistant' ? target.name : null;
    const title = isAssistant ? 'Denunciar respuesta de Ping' : target?.kind === 'message' ? 'Denunciar mensaje' : `Denunciar${who ? ` a ${who}` : ''}`;

    const submit = () => {
        if (!target || !reason) return;
        const base = { reason, details: details.trim() || undefined };
        const input = target.kind === 'user'
            ? { ...base, kind: 'user' as const, reportedUserId: target.userId, conversationId: target.conversationId, alsoBlock }
            : target.kind === 'message'
                ? { ...base, kind: 'message' as const, conversationId: target.conversationId, messageId: target.messageId, alsoBlock }
                : { ...base, kind: 'assistant' as const, excerpt: target.excerpt.slice(0, 2000), conversationId: target.conversationId };
        report.mutate(input, {
            onSuccess: () => {
                onClose();
                Alert.alert('Gracias por avisar', isAssistant
                    ? 'Revisaremos esta respuesta para que Ping mejore.'
                    : alsoBlock ? 'Revisaremos la denuncia. Ya no recibirás mensajes ni llamadas de esta persona.' : 'Revisaremos la denuncia.');
            },
            onError: () => Alert.alert('No se pudo enviar', 'Inténtalo de nuevo en un momento.'),
        });
    };

    return (
        <BaseSheet
            visible={!!target}
            onClose={onClose}
            title={title}
            description={isAssistant ? 'Cuéntanos qué estuvo mal. La revisamos nosotros, nadie más la ve.' : 'Nadie sabrá que denunciaste. Revisamos cada denuncia.'}
            actionLabel="Enviar denuncia"
            onAction={submit}
            actionDisabled={!reason}
            busy={report.isPending}
        >
            <Text style={sheetStyles.label}>Motivo</Text>
            <ChoiceChips options={isAssistant ? ASSISTANT_REASONS : REASONS} value={reason} onChange={setReason} />
            <Text style={sheetStyles.label}>Detalle (opcional)</Text>
            <TextInput
                style={[sheetStyles.input, sheetStyles.multiline]}
                placeholder="¿Qué pasó?"
                placeholderTextColor={colors.textFaint}
                value={details}
                onChangeText={setDetails}
                maxLength={1000}
                multiline
            />
            {!isAssistant && (
                <View style={styles.blockRow}>
                    <Text style={styles.blockText}>También bloquear{who ? ` a ${who}` : ''}</Text>
                    <Switch
                        value={alsoBlock}
                        onValueChange={setAlsoBlock}
                        trackColor={{ false: colors.glassRaised, true: colors.accent }}
                        thumbColor={colors.onAccent}
                        accessibilityLabel="También bloquear"
                    />
                </View>
            )}
        </BaseSheet>
    );
}

const styles = StyleSheet.create({
    blockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
    blockText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text, flex: 1 },
});
