import React, { useMemo } from 'react';
import { VorianClock } from '../../design/VorianClock';

// The summary time, picked on Vorian's clock: wheels for the hour and the
// minute (one by one) plus the usual times one tap away.

interface Props {
    visible: boolean;
    hour: number;
    minute: number;
    onClose: () => void;
    onSave: (hour: number, minute: number) => void;
}

export function SummaryTimeSheet({ visible, hour, minute, onClose, onSave }: Props) {
    const value = useMemo(() => {
        const d = new Date();
        d.setHours(hour, minute, 0, 0);
        return d;
    }, [hour, minute]);

    return (
        <VorianClock
            visible={visible}
            mode="time"
            title="Hora del resumen"
            subtitle="¿A qué hora te cuento tu día?"
            value={value}
            onClose={onClose}
            onSave={(chosen) => onSave(chosen.getHours(), chosen.getMinutes())}
        />
    );
}
