import React, { useMemo } from 'react';
import { VorianClock } from '../../design/VorianClock';

// Moving a commitment to another day and time, on Vorian's clock.

interface RescheduleModalProps {
    item: any | null;
    onClose: () => void;
    onSaveDate: (id: string, newDateIso: string) => void;
}

export function RescheduleModal({ item, onClose, onSaveDate }: RescheduleModalProps) {
    const value = useMemo(() => {
        if (item?.due_at) return new Date(item.due_at);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        return tomorrow;
    }, [item?.due_at]);

    if (!item) return null;

    return (
        <VorianClock
            visible={!!item}
            title={item.due_at ? 'Cambiar fecha' : 'Poner fecha'}
            subtitle={item.title}
            value={value}
            future
            saveLabel="Guardar fecha"
            onClose={onClose}
            onSave={(chosen) => {
                onSaveDate(item.id, chosen.toISOString());
                onClose();
            }}
        />
    );
}
