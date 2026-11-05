import React, { useEffect, useState } from 'react';
import { Text, TextInput, Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useSendFeedback } from '../../api/queries';
import { colors } from '../../design/tokens';
import { BaseSheet, ChoiceChips, sheetStyles } from '../safety/BaseSheet';

type Kind = 'idea' | 'problem' | 'other';

const KINDS: Array<{ value: Kind; label: string }> = [
    { value: 'idea', label: 'Una idea' },
    { value: 'problem', label: 'Algo falla' },
    { value: 'other', label: 'Otro' },
];

/** Comments and suggestions, read by the team behind Ping. */
export function FeedbackSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const send = useSendFeedback();
    const [kind, setKind] = useState<Kind>('idea');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (visible) {
            setKind('idea');
            setMessage('');
        }
    }, [visible]);

    const submit = () => {
        const text = message.trim();
        if (!text) return;
        send.mutate({ kind, message: text, appVersion: Constants.expoConfig?.version, platform: Platform.OS }, {
            onSuccess: () => {
                onClose();
                Alert.alert('¡Gracias!', 'Recibimos tu mensaje. Cada comentario se lee.');
            },
            onError: () => Alert.alert('No se pudo enviar', 'Inténtalo de nuevo en un momento.'),
        });
    };

    return (
        <BaseSheet
            visible={visible}
            onClose={onClose}
            title="Comentarios y sugerencias"
            description="¿Qué mejorarías o qué no funciona bien? Cuéntanos con tus palabras."
            actionLabel="Enviar"
            onAction={submit}
            actionDisabled={!message.trim()}
            busy={send.isPending}
        >
            <ChoiceChips options={KINDS} value={kind} onChange={setKind} />
            <Text style={sheetStyles.label}>Tu mensaje</Text>
            <TextInput
                style={[sheetStyles.input, sheetStyles.multiline]}
                placeholder={kind === 'problem' ? 'Qué hacías y qué pasó' : 'Escribe aquí'}
                placeholderTextColor={colors.textFaint}
                value={message}
                onChangeText={setMessage}
                maxLength={2000}
                multiline
                autoFocus
            />
            <Text style={sheetStyles.hint}>No incluyas contraseñas ni datos de otras personas.</Text>
        </BaseSheet>
    );
}
