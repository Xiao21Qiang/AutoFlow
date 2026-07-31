import { useEffect, useId, useRef, useState } from "react";
import { getCurrentUserDisplayName, validateSpecialCredential, verifyCurrentPassword } from "../../utils/reauth";
import "../../styles/css/shared/securityConfirmModal.css";

const MODE_COPY = {
  pin: {
    field: "Special PIN",
    type: "password",
    placeholder: "Enter special PIN",
    confirm: "Confirm PIN",
  },
  password: {
    field: "Special Password",
    type: "password",
    placeholder: "Enter special password",
    confirm: "Confirm Password",
  },
  currentPassword: {
    field: "Current Account Password",
    type: "password",
    placeholder: "Enter current password",
    confirm: "Verify Password",
  },
  cash: {
    field: "Special PIN",
    type: "password",
    placeholder: "Enter special PIN",
    confirm: "Verify Cash Payment",
  },
};

export default function SecurityConfirmModal({
  open,
  mode = "pin",
  title = "Security Confirmation",
  message = "Confirm this sensitive action before continuing.",
  currentUser,
  scope,
  actionKey,
  onClose,
  onConfirm,
}) {
  const [secret, setSecret] = useState("");
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const secretInputRef = useRef(null);
  const accountNameInputRef = useRef(null);
  const titleId = useId();
  const messageId = useId();
  const copy = MODE_COPY[mode] || MODE_COPY.pin;
  const resolvedScope = scope || (String(currentUser?.userType || currentUser?.role || "").trim().toLowerCase() === "staff" ? "staff" : "admin");

  useEffect(() => {
    if (!open) return;
    setSecret("");
    setAccountName("");
    setError("");
    setLoading(false);
    setShowSecret(false);
  }, [open, mode]);

  if (!open) return null;

  const expectedName = getCurrentUserDisplayName(currentUser).trim().toLowerCase();

  const handleConfirm = async (event) => {
    event?.preventDefault();
    setError("");
    const trimmedSecret = secret.trim();
    const trimmedAccountName = accountName.trim();
    if (!trimmedSecret) {
      secretInputRef.current?.focus();
      secretInputRef.current?.reportValidity?.();
      return;
    }
    if (mode === "cash" && !trimmedAccountName) {
      accountNameInputRef.current?.focus();
      accountNameInputRef.current?.reportValidity?.();
      return;
    }
    const credentialValue = mode === "pin" || mode === "cash" ? trimmedSecret : secret;
    setLoading(true);
    try {
      if (mode === "currentPassword") {
        await verifyCurrentPassword(currentUser?.email, credentialValue);
      } else {
        await validateSpecialCredential(mode === "password" ? "password" : "pin", credentialValue, resolvedScope, currentUser, actionKey);
      }

      if (mode === "cash" && trimmedAccountName.toLowerCase() !== expectedName) {
        throw new Error("Entered account name does not match the logged-in account.");
      }

      await onConfirm?.({ secret: credentialValue, accountName: trimmedAccountName });
    } catch (err) {
      setError(err.message || "Security confirmation failed.");
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  return (
    <div className="secModalOverlay" onClick={loading ? undefined : onClose}>
      <div className="secModalCard" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId} onClick={(event) => event.stopPropagation()}>
        <button className="secModalClose" type="button" onClick={onClose} disabled={loading}>x</button>
        <div className="secModalTitle" id={titleId}>{title}</div>
        <p className="secModalText" id={messageId}>{message}</p>
        <form onSubmit={handleConfirm}>
          <label className="secModalField">
            <span>{copy.field}</span>
            <div className="secSecretRow">
              <input
                ref={secretInputRef}
                type={showSecret ? "text" : copy.type}
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder={copy.placeholder}
                autoFocus
                required
              />
              <button type="button" onClick={() => setShowSecret((value) => !value)} disabled={loading}>
                {showSecret ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          {mode === "cash" && (
          <label className="secModalField">
            <span>Logged-in Account Name</span>
            <input
              ref={accountNameInputRef}
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder={getCurrentUserDisplayName(currentUser) || "Enter account name"}
              required
            />
          </label>
          )}
          {error ? <div className="secModalError">{error}</div> : null}
          <div className="secModalActions">
            <button className="secTextBtn" type="button" onClick={onClose} disabled={loading}>Cancel</button>
            <button className="secPrimaryBtn" type="submit" disabled={loading}>
              {loading ? "Checking..." : copy.confirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
