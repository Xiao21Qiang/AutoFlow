import { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/css/admin/adminProfileStyle.css";
import { useAdminData } from "../../context/AdminDataContext";
import { getSecurityControlStatus, getSpecialPasswordStatus, getSpecialPinStatus, updateSecurityControls } from "../../utils/reauth";

export default function AdminProfile({ session }) {
  const { currentUser, updateProfile, requestPasswordChangeOtp, verifyPasswordChangeOtp, resetPasswordWithOtp } = useAdminData();
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
  const [securityForm, setSecurityForm] = useState({ pin: "", password: "", currentPassword: "" });
  const [securityMessage, setSecurityMessage] = useState("");
  const [securityStatus, setSecurityStatus] = useState({});
  const [securitySaving, setSecuritySaving] = useState("");
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
    setAnimating(true);
    setModalOpen(true);
  };

  const closeModal = () => {
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
    const payload = { first: form.first.trim(), last: form.last.trim(), email: form.email.trim(), phone: form.phone.trim() };
    if (!payload.first || !payload.last) { window.alert("Please enter your first and last name."); return; }
    if (!payload.email.includes("@")) { window.alert("Please enter a valid email address."); return; }
    if (pwStep === "newpass") {
      if (!newPass) { setPassError("Please enter a new password."); return; }
      if (newPass.length < 8) { setPassError("Password must be at least 8 characters."); return; }
      if (newPass !== confirmPass) { setPassError("Passwords do not match."); return; }
      if (!otpSession.verificationId) { setPassError("Please verify the OTP again."); return; }
      await resetPasswordWithOtp({ verificationId: otpSession.verificationId, password: newPass });
    }
    await updateProfile(payload);
    setSaved(payload);
    closeModal();
  };

  const canSave = pwStep === "idle" || pwStep === "newpass";
  const saveSecurityControl = async (type) => {
    setSecurityMessage("");
    if (!securityForm.currentPassword.trim()) {
      setSecurityMessage("Enter your current account password before saving security controls.");
      return;
    }

    setSecuritySaving(type);
    try {
      if (type === "pin") {
        const result = await updateSecurityControls({
          email: saved.email,
          currentPassword: securityForm.currentPassword,
          specialPin: securityForm.pin,
        });
        setSecurityForm((prev) => ({ ...prev, pin: "", currentPassword: "" }));
        setSecurityStatus(result || {});
        setSecurityMessage("Special PIN updated.");
      } else {
        const result = await updateSecurityControls({
          email: saved.email,
          currentPassword: securityForm.currentPassword,
          specialPassword: securityForm.password,
        });
        setSecurityForm((prev) => ({ ...prev, password: "", currentPassword: "" }));
        setSecurityStatus(result || {});
        setSecurityMessage("Special password updated.");
      }
    } catch (error) {
      setSecurityMessage(error.message || "Could not update security controls.");
    } finally {
      setSecuritySaving("");
    }
  };

  return (
    <>
      <div className="ap-wrap"><div className="ap-card"><div className="ap-inner"><div className="ap-avatar-col"><div className="ap-avatar">{initialLetter}</div></div><div className="ap-form"><div className="ap-row2"><div className="ap-field"><div className="ap-label">First Name</div><input className="ap-input" readOnly value={saved.first} /></div><div className="ap-field"><div className="ap-label">Last Name</div><input className="ap-input" readOnly value={saved.last} /></div></div><div className="ap-field"><div className="ap-label">Email</div><input className="ap-input" readOnly value={saved.email} /></div><div className="ap-field"><div className="ap-label">Phone</div><input className="ap-input" readOnly value={saved.phone} /></div><div className="ap-field"><div className="ap-label">Password</div><input className="ap-input" readOnly type="password" value="placeholder" /></div><div className="ap-actions"><button className="ap-edit-btn" type="button" onClick={openModal}>Edit Account</button></div></div></div></div></div>
      <div className="ap-wrap">
        <div className="ap-card ap-security-card">
          <div className="ap-security-head">
            <div>
              <div className="ap-security-title">Security Controls</div>
              <div className="ap-security-sub">Manage special confirmation credentials for sensitive admin actions.</div>
            </div>
            <div className="ap-security-status">
              <span>PIN: {getSpecialPinStatus(securityStatus)}</span>
              <span>Password: {getSpecialPasswordStatus(securityStatus)}</span>
            </div>
          </div>
          <div className="ap-form ap-security-form">
            <div className="ap-row2">
              <div className="ap-field">
                <div className="ap-label">New Special PIN</div>
                <input className="ap-input ap-editable-input" type="password" value={securityForm.pin} onChange={(e) => setSecurityForm((prev) => ({ ...prev, pin: e.target.value.replace(/\D/g, "").slice(0, 8) }))} placeholder="4 to 8 digits" />
              </div>
              <div className="ap-field">
                <div className="ap-label">New Special Password</div>
                <input className="ap-input ap-editable-input" type="password" value={securityForm.password} onChange={(e) => setSecurityForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Min. 8 characters" />
              </div>
            </div>
            <div className="ap-field">
              <div className="ap-label">Current Account Password</div>
              <input className="ap-input ap-editable-input" type="password" value={securityForm.currentPassword} onChange={(e) => setSecurityForm((prev) => ({ ...prev, currentPassword: e.target.value }))} placeholder="Required before saving" />
            </div>
            {securityMessage && <div className="err-msg">{securityMessage}</div>}
            <div className="ap-actions ap-security-actions">
              <button className="ap-edit-btn" type="button" disabled={Boolean(securitySaving)} onClick={() => saveSecurityControl("pin")}>{securitySaving === "pin" ? "Updating..." : "Update PIN"}</button>
              <button className="ap-edit-btn" type="button" disabled={Boolean(securitySaving)} onClick={() => saveSecurityControl("password")}>{securitySaving === "password" ? "Updating..." : "Update Password"}</button>
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className={`m-overlay${animating ? " open" : ""}`} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="m-box">
            <div className="m-head"><div><p className="m-title">Edit Account</p><p className="m-sub">Update your personal information</p></div><button className="m-x" onClick={closeModal}>✕</button></div>
            <div className="m-body">
              <div className="m-row2"><div className="m-field"><div className="m-label">First Name</div><input className="m-input" value={form.first} onChange={(e) => setForm((f) => ({ ...f, first: e.target.value }))} /></div><div className="m-field"><div className="m-label">Last Name</div><input className="m-input" value={form.last} onChange={(e) => setForm((f) => ({ ...f, last: e.target.value }))} /></div></div>
              <div className="m-field"><div className="m-label">Email</div><input className="m-input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
              <div className="m-field"><div className="m-label">Phone</div><input className="m-input" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 11) }))} /></div>
              <div className="m-divider"><span>Password</span></div>
              <div className="pw-box">
                {pwStep === "idle" && <><div><p className="pw-box-title">Change Password</p><p className="pw-box-sub">Verify your identity with a one-time code first.</p></div><button className="pw-trigger-btn" onClick={() => { setVerifyEmail(saved.email || initial.email || ""); setPwStep("email"); }}>Change Password →</button></>}
                {pwStep === "email" && <><button className="back-btn" onClick={() => { setPwStep("idle"); setOtpError(""); }}>← Back</button><div className="m-field"><div className="m-label">Enter your email to receive OTP</div><input className={`m-input${otpError ? " eb" : ""}`} type="email" value={verifyEmail} onChange={(e) => { setVerifyEmail(e.target.value); setOtpError(""); }} placeholder="your@email.com" />{otpError && <div className="err-msg">{otpError}</div>}</div><button className="full-btn" onClick={handleSendOtp}>Send OTP</button></>}
                {pwStep === "otp" && <><button className="back-btn" onClick={() => { setPwStep("email"); setOtpDigits(["", "", "", "", "", ""]); setOtpError(""); }}>← Back</button><p className="otp-hint">Enter the 6-digit code sent to <strong>{otpSession.destination || verifyEmail}</strong>.</p><div className="otp-boxes">{otpDigits.map((d, i) => (<input key={i} ref={(el) => { otpRefs.current[i] = el; }} className={`otp-box${d ? " ok" : ""}${otpError ? " bad" : ""}`} type="text" inputMode="numeric" maxLength={1} value={d} onChange={(e) => handleOtpChange(i, e.target.value)} onFocus={(e) => e.target.select()} />))}</div>{otpError && <div className="err-msg">{otpError}</div>}<div className="resend-row">{countdown > 0 ? `Resend in ${countdown}s` : <><span>Didn't get it? </span><button onClick={handleSendOtp}>Resend OTP</button></>}</div><button className="full-btn" onClick={handleVerifyOtp}>Verify OTP</button></>}
                {pwStep === "newpass" && <><div className="verified-badge">✓ Identity verified — set your new password</div><div className="m-field"><div className="m-label">New Password</div><div className="pw-input-row"><input className={`m-input${passError ? " eb" : ""}`} type="password" value={newPass} onChange={(e) => { setNewPass(e.target.value); setPassError(""); }} placeholder="Min. 8 characters" /></div></div><div className="m-field"><div className="m-label">Confirm Password</div><div className="pw-input-row"><input className={`m-input${passError ? " eb" : ""}`} type="password" value={confirmPass} onChange={(e) => { setConfirmPass(e.target.value); setPassError(""); }} placeholder="Re-enter new password" /></div></div>{passError && <div className="err-msg">{passError}</div>}</>}
              </div>
            </div>
            <div className="m-foot"><button className="m-cancel" onClick={closeModal}>Cancel</button><button className="m-save" disabled={!canSave} onClick={handleSaveAll}>Save Changes</button></div>
          </div>
        </div>
      )}
    </>
  );
}
