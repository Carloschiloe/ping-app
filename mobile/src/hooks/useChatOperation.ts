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
    const [pendingLocation, setPendingLocation] = useState<{
        latitude: number;
        longitude: number;
        label: string;
        address?: string;
    } | null>(null);
    const [locationLoading, setLocationLoading] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);

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

    /**
     * Step 1: request permission, acquire GPS, reverse-geocode, and store in pendingLocation.
     * The UI should show LocationConfirmModal when pendingLocation is set.
     */
    const handleShareLocation = async () => {
        setLocationLoading(true);
        setLocationError(null);
        setPendingLocation(null);
        try {
            const permission = await Location.requestForegroundPermissionsAsync();
            if (permission.status !== 'granted') {
                setLocationError('Activa la ubicación en Ajustes para compartirla en este chat.');
                return;
            }
            const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const reverse = await Location.reverseGeocodeAsync(position.coords);
            const addr = reverse[0];
            const label =
                [addr?.name, addr?.street].filter(Boolean).join(', ') ||
                [addr?.district, addr?.city].filter(Boolean).join(', ') ||
                'Ubicación actual';
            const address = [addr?.city, addr?.region].filter(Boolean).join(', ') || undefined;
            setPendingLocation({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                label,
                address,
            });
        } catch (err) {
            console.error('[Location] Failed to get location', err);
            setLocationError('No se pudo obtener la ubicación. Intenta de nuevo.');
        } finally {
            setLocationLoading(false);
        }
    };

    /** Step 2: called when user taps 'Enviar ubicación' in the confirm modal. */
    const confirmShareLocation = () => {
        if (!pendingLocation) return;
        const { latitude, longitude, label } = pendingLocation;
        sendMessage({
            text: `[location] ${label}`,
            meta: {
                messageType: 'location_share',
                location: { latitude, longitude, label },
            },
        });
        setPendingLocation(null);
        setLocationFeedback('Ubicación enviada');
        setTimeout(() => setLocationFeedback(null), 1800);
        invalidateOperationState();
    };

    const cancelShareLocation = () => {
        setPendingLocation(null);
        setLocationError(null);
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
        } catch {
            console.error('[Operation] Failed action');
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
        // Location modal state
        pendingLocation,
        locationLoading,
        locationError,
        handleShareLocation,
        confirmShareLocation,
        cancelShareLocation,
        handleOperationAction,
        handleClearActiveCommitment: () => setActiveCommitment(null),
        handleClearPinnedMessage: () => setPinnedMessage(null),
    };
}
