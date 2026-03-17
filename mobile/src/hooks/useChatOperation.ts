import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';

type OperationActionPayload = {
    action: 'acknowledged' | 'arrived' | 'completed';
    completionNote?: string | null;
    completionOutcome?: 'resolved' | 'pending_followup' | 'needs_review' | null;
};

interface UseChatOperationParams {
    conversationId: string;
    routeMode?: 'chat' | 'operation';
    operationState: any;
    groupTasks: any[];
    sendMessage: (payload: { text: string; meta?: any }) => void;
    runCommitmentAction: (payload: any) => Promise<any>;
    setPinnedMessage: (messageId: string | null) => void;
    setActiveCommitment: (commitmentId: string | null) => void;
    invalidateOperationState: () => void;
}

export function useChatOperation({
    conversationId,
    routeMode,
    operationState,
    groupTasks,
    sendMessage,
    runCommitmentAction,
    setPinnedMessage,
    setActiveCommitment,
    invalidateOperationState,
}: UseChatOperationParams) {
    const [pendingOperationAction, setPendingOperationAction] = useState<'acknowledged' | 'arrived' | 'completed' | null>(null);
    const [operationFeedback, setOperationFeedback] = useState<string | null>(null);
    const [locationFeedback, setLocationFeedback] = useState<string | null>(null);

    const conversationMode = operationState?.conversation?.mode || routeMode || 'chat';
    const pinnedMessageId = operationState?.conversation?.pinned_message_id || null;
    const activeOperationCommitmentId = operationState?.myFocus?.commitment_id || operationState?.conversation?.active_commitment_id || null;
    const activeOperationCommitment = useMemo(() => (
        (activeOperationCommitmentId
            ? groupTasks.find((task: any) => task.id === activeOperationCommitmentId)
            : null) || operationState?.activeCommitment || null
    ), [activeOperationCommitmentId, groupTasks, operationState?.activeCommitment]);
    const openOperationTasks = useMemo(
        () => groupTasks.filter((task: any) => !['completed', 'rejected'].includes(task.status)),
        [groupTasks]
    );

    const handleShareLocation = async () => {
        try {
            const permission = await Location.requestForegroundPermissionsAsync();
            if (permission.status !== 'granted') {
                Alert.alert('Permiso requerido', 'Activa la ubicacion para compartirla en este chat.');
                return;
            }

            const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const reverse = await Location.reverseGeocodeAsync(position.coords);
            const address = reverse[0];
            const label = [address?.street, address?.district || address?.city].filter(Boolean).join(', ') || 'Ubicacion actual';

            sendMessage({
                text: `[location] ${label}`,
                meta: {
                    messageType: 'location_share',
                    location: {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        label,
                    },
                },
            });

            setLocationFeedback('Ubicacion enviada');
            setTimeout(() => setLocationFeedback(null), 1800);
            invalidateOperationState();
        } catch (err) {
            console.error('[Location] Failed to share location:', err);
            Alert.alert('Error', 'No se pudo compartir la ubicacion.');
        }
    };

    const handleOperationAction = async ({ action, completionNote, completionOutcome }: OperationActionPayload) => {
        if (!activeOperationCommitment) return;

        const feedbackMap = {
            acknowledged: 'Inicio marcado',
            arrived: 'Marcado como llegue',
            completed: 'Tarea cerrada',
        } as const;

        setPendingOperationAction(action);
        setOperationFeedback(feedbackMap[action]);

        let locationMessageId: string | null = null;
        try {
            if (action === 'arrived' && !operationState?.latestLocation) {
                await handleShareLocation();
            }

            if (action === 'arrived') {
                locationMessageId = operationState?.latestLocation?.id || null;
            }

            await runCommitmentAction({
                id: activeOperationCommitment.id,
                action,
                location_message_id: locationMessageId,
                conversationId,
                completion_note: completionNote,
                completion_outcome: completionOutcome,
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
            console.error('[Operation] Failed action:', error);
            setOperationFeedback('No se pudo guardar la accion');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setPendingOperationAction(null);
            setTimeout(() => setOperationFeedback(null), 1800);
        }
    };

    return {
        conversationMode,
        pinnedMessageId,
        activeOperationCommitment,
        openOperationTasks,
        pendingOperationAction,
        operationFeedback,
        locationFeedback,
        handleShareLocation,
        handleOperationAction,
        handleClearActiveCommitment: () => setActiveCommitment(null),
        handleClearPinnedMessage: () => setPinnedMessage(null),
    };
}
