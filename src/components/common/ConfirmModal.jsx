import "../../styles/css/shared/confirmModal.css";

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Yes",
  cancelLabel = "No",
  onConfirm,
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="cnfModalOverlay" onClick={onClose}>
      <div className="cnfModalCard" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="cnfModalClose" type="button" onClick={onClose}>
          x
        </button>

        <div className="cnfModalTitle">{title}</div>
        <p className="cnfModalText">{message}</p>

        <div className="cnfModalActions">
          <button className="cnfTextBtn" type="button" onClick={onClose}>
            {cancelLabel}
          </button>
          <button className="cnfPrimaryBtn" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
