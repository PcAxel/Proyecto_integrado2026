import { Modal } from './Modal'
import { Button } from './Button'

/** Confirmación para acciones auditadas (reversa, aprobación, cierre). */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', tone = 'primary', loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant={tone} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm text-ink-soft">{message}</p>
    </Modal>
  )
}
