import { useEffect, useState } from "react";
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
  onClose,
  onConfirm,
}) {
  const [secret, setSecret] = useState("");
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const copy = MODE_COPY[mode] || MODE_COPY.pin;
  const resolvedScope = scope || (String(currentUser?.userType || currentUser?.role || "").trim().toLowerCase() === "staff" ? "staff" : "admin");

  useEffect(() => {
    if (!open) return;
    setSecret("");
    setAccountName("");
    setError("");
    setLoading(false);
  }, [open, mode]);

  if (!open) return null;

  const expectedName = getCurrentUserDisplayName(currentUser).trim().toLowerCase();

  const handleConfirm = async () => {
    setError("");
    setLoading(true);
    try {
      if (mode === "currentPassword") {
        await verifyCurrentPassword(currentUser?.email, secret);
      } else {
        await validateSpecialCredential(mode === "password" ? "password" : "pin", secret, resolvedScope, currentUser);
      }

      if (mode === "cash" && String(accountName || "").trim().toLowerCase() !== expectedName) {
        throw new Error("Entered account name does not match the logged-in account.");
      }

      await onConfirm?.({ secret, accountName });
    } catch (err) {
      setError(err.message || "Security confirmation failed.");
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  return (
    <div className="secModalOverlay" onClick={loading ? undefined : onClose}>
      <div className="secModalCard" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button className="secModalClose" type="button" onClick={onClose} disabled={loading}>x</button>
        <div className="secModalTitle">{title}</div>
        <p className="secModalText">{message}</p>
        <label className="secModalField">
          <span>{copy.field}</span>
          <input
            type={copy.type}
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder={copy.placeholder}
            autoFocus
          />
        </label>
        {mode === "cash" && (
          <label className="secModalField">
            <span>Logged-in Account Name</span>
            <input
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder={getCurrentUserDisplayName(currentUser) || "Enter account name"}
            />
          </label>
        )}
        {error ? <div className="secModalError">{error}</div> : null}
        <div className="secModalActions">
          <button className="secTextBtn" type="button" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="secPrimaryBtn" type="button" onClick={handleConfirm} disabled={loading || !secret.trim() || (mode === "cash" && !accountName.trim())}>
            {loading ? "Checking..." : copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
