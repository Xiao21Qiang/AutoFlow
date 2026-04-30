import { useEffect } from "react";
import "../../styles/css/shared/toastMessage.css";

export default function ToastMessage({ toast, onClose }) {
  useEffect(() => {
    if (!toast?.message) return undefined;
    const timer = window.setTimeout(() => onClose?.(), 3500);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast?.message) return null;

  return (
    <div className={`afToast afToast-${toast.type || "success"}`} role="status" aria-live="polite">
      <strong>{toast.title || (toast.type === "error" ? "Action failed" : "Action complete")}</strong>
      <span>{toast.message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss notification">x</button>
    </div>
  );
}
