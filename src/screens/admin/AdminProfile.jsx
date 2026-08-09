import { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/css/admin/adminProfileStyle.css";
import { useAdminData } from "../../context/AdminDataContext";
import { getSecurityControlStatus, getSpecialPasswordStatus, getSpecialPinStatus, updateSecurityControls } from "../../utils/reauth";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";

const DOWN_PAYMENT_MAX_AMOUNT = 1000000;
const DOWN_PAYMENT_REQUIRED_MESSAGE = "Required down payment is required.";
const DOWN_PAYMENT_INVALID_MESSAGE = "Required down payment must be greater than zero.";
const PROFILE_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PROFILE_NAME_REGEX = /^[\p{L}\s'.-]+$/u;

function validateRequiredDownPaymentAmount(value) {
  const rawValue = String(value ?? "");
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return { valid: false, amount: null, message: DOWN_PAYMENT_REQUIRED_MESSAGE };
  }

  const amount = Number(trimmedValue);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, amount: null, message: DOWN_PAYMENT_INVALID_MESSAGE };
  }
  if (amount > DOWN_PAYMENT_MAX_AMOUNT) {
    return { valid: false, amount: null, message: "Required down payment must not exceed 1,000,000." };
  }

  return { valid: true, amount, message: "" };
}

function validateProfileForm(form) {
  const payload = {
    first: String(form.first || "").trim().replace(/\s+/g, " "),
    last: String(form.last || "").trim().replace(/\s+/g, " "),
    email: String(form.email || "").trim().toLowerCase(),
    phone: String(form.phone || "").trim().replace(/\D/g, "").slice(0, 11),
  };
  const errors = {};

  if (!payload.first) errors.first = "First name is required.";
  else if (!PROFILE_NAME_REGEX.test(payload.first)) errors.first = "First name can only contain letters, spaces, hyphens, apostrophes, and periods.";
  if (!payload.last) errors.last = "Last name is required.";
  else if (!PROFILE_NAME_REGEX.test(payload.last)) errors.last = "Last name can only contain letters, spaces, hyphens, apostrophes, and periods.";
  if (!payload.email) errors.email = "Email is required.";
  else if (!PROFILE_EMAIL_REGEX.test(payload.email)) errors.email = "Please enter a valid email address.";
  if (!payload.phone) errors.phone = "Contact number is required.";
  else if (!/^09\d{9}$/.test(payload.phone)) errors.phone = "Contact number must be 11 digits and start with 09.";

  return { payload, errors, isValid: Object.keys(errors).length === 0 };
}

function getProfilePasswordError(password) {
  const value = String(password || "");
  if (!value) return "Please enter a new password.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(value)) return "Password must include at least 1 uppercase letter.";
  if (!/[a-z]/.test(value)) return "Password must include at least 1 lowercase letter.";
  if (!/\d/.test(value)) return "Password must include at least 1 number.";
  return "";
}

export default function AdminProfile({ session }) {
  const { currentUser, settings, updateProfile, updateRequiredDownPaymentAmount, requestPasswordChangeOtp, verifyPasswordChangeOtp, resetPasswordWithOtp } = useAdminData();
  const initial = useMemo(() => ({
    first: currentUser?.first || session?.first || session?.firstName || "",
    last: currentUser?.last || session?.last || session?.lastName || "",
    email: currentUser?.email || session?.email || "",
    phone: currentUser?.phone || session?.phone || "",
  }), [currentUser, session]);

  const [saved, setSaved] = useState(initial);
  const [modalOpen, setModalOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [form, setForm] = useState(initial);
  const [pwStep, setPwStep] = useState("idle");
  const [verifyEmail, setVerifyEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpSession, setOtpSession] = useState({ verificationId: "", destination: "" });
  const [otpError, setOtpError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passError, setPassError] = useState("");
  const [profileErrors, setProfileErrors] = useState({});
  const [profileSaveError, setProfileSaveError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [securityForm, setSecurityForm] = useState({ adminPin: "", adminPassword: "", staffPin: "", staffPassword: "", currentPassword: "" });
  const [securityMessage, setSecurityMessage] = useState("");
  const [securityStatus, setSecurityStatus] = useState({});
  const [securitySaving, setSecuritySaving] = useState("");
  const [downPaymentForm, setDownPaymentForm] = useState({ amount: "0" });
  const [downPaymentTouched, setDownPaymentTouched] = useState(false);
  const [downPaymentSubmitted, setDownPaymentSubmitted] = useState(false);
  const [downPaymentConfirmOpen, setDownPaymentConfirmOpen] = useState(false);
  const [pendingDownPaymentAmount, setPendingDownPaymentAmount] = useState(null);
  const [savedDownPaymentOverride, setSavedDownPaymentOverride] = useState(null);
  const [downPaymentMessage, setDownPaymentMessage] = useState("");
  const [downPaymentSaving, setDownPaymentSaving] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState({});
  const downPaymentSavingRef = useRef(false);
  const profileSavingRef = useRef(false);
  const otpRefs = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    setSaved(initial);
    setForm(initial);
  }, [initial]);

  useEffect(() => {
    let mounted = true;
    getSecurityControlStatus()
      .then((status) => {
        if (mounted) setSecurityStatus(status || {});
      })
      .catch(() => {
        if (mounted) setSecurityStatus({});
      });
    return () => {
      mounted = false;
    };
  }, []);

  const currentRequiredDownPaymentAmount = useMemo(
    () => Number(savedDownPaymentOverride ?? settings?.requiredDownPaymentAmount ?? securityStatus.requiredDownPaymentAmount ?? 0) || 0,
    [savedDownPaymentOverride, settings?.requiredDownPaymentAmount, securityStatus.requiredDownPaymentAmount]
  );

  useEffect(() => {
    setSavedDownPaymentOverride(null);
  }, [settings?.requiredDownPaymentAmount]);

  useEffect(() => {
    if (downPaymentSaving) return;
    setDownPaymentForm((prev) => ({
      ...prev,
      amount: String(currentRequiredDownPaymentAmount),
    }));
  }, [currentRequiredDownPaymentAmount, downPaymentSaving]);

  const downPaymentValidation = useMemo(
    () => validateRequiredDownPaymentAmount(downPaymentForm.amount),
    [downPaymentForm.amount]
  );
  const showDownPaymentError = (downPaymentTouched || downPaymentSubmitted) && !downPaymentValidation.valid;
  const downPaymentAmountErrorId = "required-down-payment-amount-error";

  const initialLetter = useMemo(() => {
    const base = String(saved.first || saved.email || "A").trim();
    return base ? base[0].toUpperCase() : "A";
  }, [saved]);

  const startCountdown = () => {
    clearInterval(timerRef.current);
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((c) => { if (c <= 1) { clearInterval(timerRef.current); return 0; } return c - 1; });
    }, 1000);
  };

  const openModal = () => {
    setForm(saved);
    setPwStep("idle");
    setVerifyEmail(initial.email);
    setOtpDigits(["", "", "", "", "", ""]);
    setOtpSession({ verificationId: "", destination: "" });
    setOtpError("");
    setCountdown(0);
    setNewPass("");
    setConfirmPass("");
    setPassError("");
    setProfileErrors({});
    setProfileSaveError("");
    setProfileSaving(false);
    profileSavingRef.current = false;
    setVisibleSecrets((prev) => ({ ...prev, newPass: false, confirmPass: false }));
    setAnimating(true);
    setModalOpen(true);
  };

  const closeModal = ({ force = false } = {}) => {
    if (profileSavingRef.current && !force) return;
    clearInterval(timerRef.current);
    setAnimating(false);
    setTimeout(() => setModalOpen(false), 180);
  };

  const handleSendOtp = async () => {
    const normalizedEmail = String(verifyEmail || "").trim().toLowerCase();
    const currentEmail = String(saved.email || initial.email || "").trim().toLowerCase();
    if (!normalizedEmail.includes("@")) { setOtpError("Please enter a valid email address."); return; }
    if (normalizedEmail !== currentEmail) { setOtpError("Use your current account email to receive the OTP."); return; }
    try {
      setOtpError("");
      setOtpDigits(["", "", "", "", "", ""]);
      const payload = await requestPasswordChangeOtp({ email: normalizedEmail, channel: "email" });
      setOtpSession({
        verificationId: payload?.verificationId || "",
        destination: payload?.destination || normalizedEmail,
      });
      startCountdown();
      setPwStep("otp");
    } catch (error) {
      setOtpError(error.message || "Failed to send OTP.");
    }
  };

  const handleOtpChange = (i, val) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[i] = digit;
    setOtpDigits(next);
    setOtpError("");
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleVerifyOtp = async () => {
    const code = otpDigits.join("");
    if (code.length < 6) { setOtpError("Please enter the 6-digit code."); return; }
    if (!otpSession.verificationId) { setOtpError("Please request a new OTP."); return; }
    try {
      setOtpError("");
      await verifyPasswordChangeOtp({ verificationId: otpSession.verificationId, otp: code });
      setPwStep("newpass");
    } catch (error) {
      setOtpError(error.message || "Failed to verify OTP.");
    }
  };

  const handleSaveAll = async () => {
    if (profileSavingRef.current) return;

    const validation = validateProfileForm(form);
    setProfileErrors(validation.errors);
    setProfileSaveError("");
    if (!validation.isValid) return;

    if (pwStep === "newpass") {
      const passwordError = getProfilePasswordError(newPass);
      if (passwordError) { setPassError(passwordError); return; }
      if (newPass !== confirmPass) { setPassError("Passwords do not match."); return; }
      if (!otpSession.verificationId) { setPassError("Please verify the OTP again."); return; }
    }

    const savedComparable = {
      first: String(saved.first || "").trim().replace(/\s+/g, " "),
      last: String(saved.last || "").trim().replace(/\s+/g, " "),
      email: String(saved.email || "").trim().toLowerCase(),
      phone: String(saved.phone || "").trim().replace(/\D/g, "").slice(0, 11),
    };
    const hasProfileChanges = ["first", "last", "email", "phone"].some((key) => validation.payload[key] !== savedComparable[key]);
    const hasPasswordChange = pwStep === "newpass";
    if (!hasProfileChanges && !hasPasswordChange) {
      closeModal({ force: true });
      return;
    }

    profileSavingRef.current = true;
    setProfileSaving(true);
    try {
      if (hasPasswordChange) {
        await resetPasswordWithOtp({ verificationId: otpSession.verificationId, password: newPass });
      }
      if (hasProfileChanges) {
        const updatedUser = await updateProfile(validation.payload);
        setSaved({
          first: updatedUser?.first || validation.payload.first,
          last: updatedUser?.last || validation.payload.last,
          email: updatedUser?.email || validation.payload.email,
          phone: updatedUser?.phone || validation.payload.phone,
        });
      }
      setNewPass("");
      setConfirmPass("");
      setPassError("");
      setOtpSession({ verificationId: "", destination: "" });
      setOtpDigits(["", "", "", "", "", ""]);
      closeModal({ force: true });
    } catch (error) {
      setProfileSaveError(error.message || "Could not save account changes.");
    } finally {
      profileSavingRef.current = false;
      setProfileSaving(false);
    }
  };

  const updateProfileField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setProfileSaveError("");
    setProfileErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const canSave = (pwStep === "idle" || pwStep === "newpass") && !profileSaving;
  const saveSecurityControl = async (field) => {
    setSecurityMessage("");
    if (!securityForm.currentPassword.trim()) {
      setSecurityMessage("Enter your current account password before saving security controls.");
      return;
    }

    setSecuritySaving(field);
    try {
      const payloadByField = {
        adminPin: { adminSpecialPin: securityForm.adminPin },
        adminPassword: { adminSpecialPassword: securityForm.adminPassword },
        staffPin: { staffSpecialPin: securityForm.staffPin },
        staffPassword: { staffSpecialPassword: securityForm.staffPassword },
      };
      const result = await updateSecurityControls({
        email: saved.email,
        currentPassword: securityForm.currentPassword,
        ...payloadByField[field],
      });
      setSecurityForm((prev) => ({ ...prev, [field]: "", currentPassword: "" }));
      setVisibleSecrets((prev) => ({ ...prev, [field]: false, currentPassword: false }));
      setSecurityStatus(result || {});
      setSecurityMessage("Security credential updated.");
    } catch (error) {
      setSecurityMessage(error.message || "Could not update security controls.");
    } finally {
      setSecuritySaving("");
    }
  };

  const submitRequiredDownPaymentAmount = (event) => {
    event?.preventDefault();
    setDownPaymentMessage("");
    setDownPaymentSubmitted(true);
    if (!downPaymentValidation.valid) {
      setDownPaymentTouched(true);
      return;
    }
    setPendingDownPaymentAmount(downPaymentValidation.amount);
    setDownPaymentConfirmOpen(true);
  };

  const saveRequiredDownPayment = async ({ secret } = {}) => {
    if (downPaymentSavingRef.current) return;
    const amountValidation = validateRequiredDownPaymentAmount(pendingDownPaymentAmount ?? downPaymentForm.amount);
    if (!amountValidation.valid) {
      setDownPaymentSubmitted(true);
      setDownPaymentTouched(true);
      setDownPaymentConfirmOpen(false);
      return;
    }

    downPaymentSavingRef.current = true;
    setDownPaymentSaving(true);
    try {
      const result = await updateRequiredDownPaymentAmount(amountValidation.amount, secret);
      const nextAmount = Number(result?.requiredDownPaymentAmount ?? amountValidation.amount) || 0;
      setDownPaymentForm({ amount: String(nextAmount) });
      setDownPaymentTouched(false);
      setDownPaymentSubmitted(false);
      setPendingDownPaymentAmount(null);
      setDownPaymentConfirmOpen(false);
      setSavedDownPaymentOverride(nextAmount);
      setSecurityStatus((prev) => ({ ...prev, requiredDownPaymentAmount: nextAmount }));
      setDownPaymentMessage("Required down payment amount updated.");
    } catch (error) {
      setDownPaymentMessage(error.message || "Could not update required down payment amount.");
      throw error;
    } finally {
      downPaymentSavingRef.current = false;
      setDownPaymentSaving(false);
    }
  };

  const closeDownPaymentConfirm = () => {
    if (downPaymentSavingRef.current) return;
    setDownPaymentConfirmOpen(false);
    setPendingDownPaymentAmount(null);
  };

  const renderSecretInput = ({ visibleKey, className = "ap-input ap-editable-input", value, onChange, placeholder, ariaLabel }) => (
    <div className="ap-secret-row">
      <input
        aria-label={ariaLabel}
        className={className}
        type={visibleSecrets[visibleKey] ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisibleSecrets((prev) => ({ ...prev, [visibleKey]: !prev[visibleKey] }))}
      >
        {visibleSecrets[visibleKey] ? "Hide" : "Show"}
      </button>
    </div>
  );

  return (
    <>
      <div className="ap-wrap"><div className="ap-card"><div className="ap-inner"><div className="ap-avatar-col"><div className="ap-avatar">{initialLetter}</div></div><div className="ap-form"><div className="ap-row2"><div className="ap-field"><div className="ap-label">First Name</div><input className="ap-input" readOnly value={saved.first} /></div><div className="ap-field"><div className="ap-label">Last Name</div><input className="ap-input" readOnly value={saved.last} /></div></div><div className="ap-field"><div className="ap-label">Email</div><input className="ap-input" readOnly value={saved.email} /></div><div className="ap-field"><div className="ap-label">Phone</div><input className="ap-input" readOnly value={saved.phone} /></div><div className="ap-field"><div className="ap-label">Password</div><input className="ap-input" readOnly type="password" value="placeholder" /></div><div className="ap-actions"><button className="ap-edit-btn" type="button" onClick={openModal}>Edit Account</button></div></div></div></div></div>
      <div className="ap-wrap">
        <div className="ap-card ap-security-card">
          <div className="ap-security-head">
            <div>
              <div className="ap-security-title">Required Down Payment</div>
              <div className="ap-security-sub">Set the fixed down payment amount required for services that are not exempt from down payment.</div>
            </div>
            <div className="ap-security-status">
              <span>Current: ₱{Number(currentRequiredDownPaymentAmount || 0).toLocaleString()}</span>
            </div>
          </div>
          <form className="ap-form ap-security-form" onSubmit={submitRequiredDownPaymentAmount} noValidate>
            <div className="ap-row2">
              <div className="ap-field">
                <label className="ap-label" htmlFor="required-down-payment-amount">Required Down Payment Amount</label>
                <input
                  id="required-down-payment-amount"
                  className={`ap-input ap-editable-input${showDownPaymentError ? " eb" : ""}`}
                  type="text"
                  inputMode="decimal"
                  step="0.01"
                  value={downPaymentForm.amount}
                  onChange={(e) => {
                    setDownPaymentForm((prev) => ({ ...prev, amount: e.target.value }));
                    setDownPaymentMessage("");
                  }}
                  onBlur={() => setDownPaymentTouched(true)}
                  placeholder="0.00"
                  aria-invalid={showDownPaymentError ? "true" : undefined}
                  aria-describedby={showDownPaymentError ? downPaymentAmountErrorId : undefined}
                />
                {showDownPaymentError && <div className="err-msg" id={downPaymentAmountErrorId}>{downPaymentValidation.message}</div>}
              </div>
            </div>
            <div className="ap-actions ap-security-actions">
              <button className="ap-edit-btn" type="submit" disabled={downPaymentSaving || !downPaymentValidation.valid}>
                {downPaymentSaving ? "Saving..." : "Save Amount"}
              </button>
            </div>
            {downPaymentMessage && <div className="err-msg">{downPaymentMessage}</div>}
          </form>
        </div>
      </div>
      <div className="ap-wrap">
        <div className="ap-card ap-security-card">
          <div className="ap-security-head">
            <div>
              <div className="ap-security-title">Security Controls</div>
              <div className="ap-security-sub">Manage separate Admin and Staff confirmation credentials.</div>
            </div>
            <div className="ap-security-status">
              <span>Admin PIN: {getSpecialPinStatus(securityStatus)}</span>
              <span>Admin Password: {getSpecialPasswordStatus(securityStatus)}</span>
              <span>Staff PIN: {securityStatus.staffSpecialPinConfigured === false ? "Not configured" : "Configured"}</span>
              <span>Staff Password: {securityStatus.staffSpecialPasswordConfigured === false ? "Not configured" : "Configured"}</span>
            </div>
          </div>
          <div className="ap-form ap-security-form">
            {[
              ["Admin Security Credentials", "adminPin", "adminPassword", "adminSpecialPinConfigured", "adminSpecialPasswordConfigured"],
              ["Staff Security Credentials", "staffPin", "staffPassword", "staffSpecialPinConfigured", "staffSpecialPasswordConfigured"],
            ].map(([title, pinField, passwordField, pinStatusKey, passwordStatusKey]) => (
              <div className="ap-security-section" key={title}>
                <div className="ap-security-section-title">{title}</div>
                <div className="ap-row2">
                  <div className="ap-field">
                    <div className="ap-label">PIN Status</div>
                    <input className="ap-input" readOnly value={securityStatus[pinStatusKey] === false ? "Not configured" : "Configured"} />
                  </div>
                  <div className="ap-field">
                    <div className="ap-label">Password Status</div>
                    <input className="ap-input" readOnly value={securityStatus[passwordStatusKey] === false ? "Not configured" : "Configured"} />
                  </div>
                </div>
                <div className="ap-row2">
                  <div className="ap-field">
                    <div className="ap-label">New PIN</div>
                    {renderSecretInput({ visibleKey: pinField, value: securityForm[pinField], onChange: (e) => setSecurityForm((prev) => ({ ...prev, [pinField]: e.target.value.replace(/\D/g, "").slice(0, 8) })), placeholder: "4 to 8 digits" })}
                  </div>
                  <div className="ap-field">
                    <div className="ap-label">New Password</div>
                    {renderSecretInput({ visibleKey: passwordField, value: securityForm[passwordField], onChange: (e) => setSecurityForm((prev) => ({ ...prev, [passwordField]: e.target.value })), placeholder: "Min. 8 characters" })}
                  </div>
                </div>
                <div className="ap-actions ap-security-actions">
                  <button className="ap-edit-btn" type="button" disabled={Boolean(securitySaving)} onClick={() => saveSecurityControl(pinField)}>{securitySaving === pinField ? "Updating..." : "Update PIN"}</button>
                  <button className="ap-edit-btn" type="button" disabled={Boolean(securitySaving)} onClick={() => saveSecurityControl(passwordField)}>{securitySaving === passwordField ? "Updating..." : "Update Password"}</button>
                </div>
              </div>
            ))}
            <div className="ap-field">
              <div className="ap-label">Current Account Password</div>
              {renderSecretInput({ visibleKey: "currentPassword", value: securityForm.currentPassword, onChange: (e) => setSecurityForm((prev) => ({ ...prev, currentPassword: e.target.value })), placeholder: "Required before saving" })}
            </div>
            {securityMessage && <div className="err-msg">{securityMessage}</div>}
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className={`m-overlay${animating ? " open" : ""}`} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="m-box">
            <div className="m-head"><div><p className="m-title">Edit Account</p><p className="m-sub">Update your personal information</p></div><button className="m-x" type="button" onClick={closeModal} disabled={profileSaving}>✕</button></div>
            <div className="m-body">
              <div className="m-row2"><div className="m-field"><div className="m-label">First Name</div><input aria-label="Edit first name" className={`m-input${profileErrors.first ? " eb" : ""}`} value={form.first} onChange={(e) => updateProfileField("first", e.target.value)} aria-invalid={profileErrors.first ? "true" : undefined} />{profileErrors.first && <div className="err-msg">{profileErrors.first}</div>}</div><div className="m-field"><div className="m-label">Last Name</div><input aria-label="Edit last name" className={`m-input${profileErrors.last ? " eb" : ""}`} value={form.last} onChange={(e) => updateProfileField("last", e.target.value)} aria-invalid={profileErrors.last ? "true" : undefined} />{profileErrors.last && <div className="err-msg">{profileErrors.last}</div>}</div></div>
              <div className="m-field"><div className="m-label">Email</div><input aria-label="Edit email" className={`m-input${profileErrors.email ? " eb" : ""}`} type="email" value={form.email} onChange={(e) => updateProfileField("email", e.target.value)} aria-invalid={profileErrors.email ? "true" : undefined} />{profileErrors.email && <div className="err-msg">{profileErrors.email}</div>}</div>
              <div className="m-field"><div className="m-label">Phone</div><input aria-label="Edit phone" className={`m-input${profileErrors.phone ? " eb" : ""}`} type="tel" value={form.phone} onChange={(e) => updateProfileField("phone", e.target.value.replace(/\D/g, "").slice(0, 11))} aria-invalid={profileErrors.phone ? "true" : undefined} />{profileErrors.phone && <div className="err-msg">{profileErrors.phone}</div>}</div>
              <div className="m-divider"><span>Password</span></div>
              <div className="pw-box">
                {pwStep === "idle" && <><div><p className="pw-box-title">Change Password</p><p className="pw-box-sub">Verify your identity with a one-time code first.</p></div><button className="pw-trigger-btn" type="button" onClick={() => { setVerifyEmail(saved.email || initial.email || ""); setPwStep("email"); }}>Change Password →</button></>}
                {pwStep === "email" && <><button className="back-btn" type="button" onClick={() => { setPwStep("idle"); setOtpError(""); }}>← Back</button><div className="m-field"><div className="m-label">Enter your email to receive OTP</div><input aria-label="Password OTP email" className={`m-input${otpError ? " eb" : ""}`} type="email" value={verifyEmail} onChange={(e) => { setVerifyEmail(e.target.value); setOtpError(""); }} placeholder="your@email.com" />{otpError && <div className="err-msg">{otpError}</div>}</div><button className="full-btn" type="button" onClick={handleSendOtp}>Send OTP</button></>}
                {pwStep === "otp" && <><button className="back-btn" type="button" onClick={() => { setPwStep("email"); setOtpDigits(["", "", "", "", "", ""]); setOtpError(""); }}>← Back</button><p className="otp-hint">Enter the 6-digit code sent to <strong>{otpSession.destination || verifyEmail}</strong>.</p><div className="otp-boxes">{otpDigits.map((d, i) => (<input key={i} aria-label={`Password OTP digit ${i + 1}`} ref={(el) => { otpRefs.current[i] = el; }} className={`otp-box${d ? " ok" : ""}${otpError ? " bad" : ""}`} type="text" inputMode="numeric" maxLength={1} value={d} onChange={(e) => handleOtpChange(i, e.target.value)} onFocus={(e) => e.target.select()} />))}</div>{otpError && <div className="err-msg">{otpError}</div>}<div className="resend-row">{countdown > 0 ? `Resend in ${countdown}s` : <><span>Didn't get it? </span><button type="button" onClick={handleSendOtp}>Resend OTP</button></>}</div><button className="full-btn" type="button" onClick={handleVerifyOtp}>Verify OTP</button></>}
                {pwStep === "newpass" && <><div className="verified-badge">✓ Identity verified — set your new password</div><div className="m-field"><div className="m-label">New Password</div>{renderSecretInput({ visibleKey: "newPass", className: `m-input${passError ? " eb" : ""}`, value: newPass, onChange: (e) => { setNewPass(e.target.value); setPassError(""); }, placeholder: "Min. 8 characters", ariaLabel: "New password" })}</div><div className="m-field"><div className="m-label">Confirm Password</div>{renderSecretInput({ visibleKey: "confirmPass", className: `m-input${passError ? " eb" : ""}`, value: confirmPass, onChange: (e) => { setConfirmPass(e.target.value); setPassError(""); }, placeholder: "Re-enter new password", ariaLabel: "Confirm new password" })}</div>{passError && <div className="err-msg">{passError}</div>}</>}
              </div>
              {profileSaveError && <div className="err-msg">{profileSaveError}</div>}
            </div>
            <div className="m-foot"><button className="m-cancel" type="button" onClick={closeModal} disabled={profileSaving}>Cancel</button><button className="m-save" type="button" disabled={!canSave} onClick={handleSaveAll}>{profileSaving ? "Saving..." : "Save Changes"}</button></div>
          </div>
        </div>
      )}
      <SecurityConfirmModal
        open={downPaymentConfirmOpen}
        mode="password"
        title="Update Required Down Payment"
        message="Confirm the Admin Special Password to save the required down payment amount."
        currentUser={currentUser || session}
        scope="admin"
        actionKey="settings.downPayment.update"
        onClose={closeDownPaymentConfirm}
        onConfirm={saveRequiredDownPayment}
      />
    </>
  );
}
