-- Migration: Add negotiation fields to commitments
ALTER TABLE commitments 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS proposed_due_at TIMESTAMPTZ;

-- Ensure status supports the new flow strings (assuming it's a TEXT column based on previous inspection)
-- If it was an enum, we would need to handle it differently, but 'pending', 'done' are already used.
-- We will use: 'proposed', 'accepted', 'rejected', 'counter_proposal'

COMMENT ON COLUMN commitments.rejection_reason IS 'Motivo por el cual el asignado rechazó la tarea';
COMMENT ON COLUMN commitments.proposed_due_at IS 'Fecha/hora sugerida por el asignado en caso de posponer';
