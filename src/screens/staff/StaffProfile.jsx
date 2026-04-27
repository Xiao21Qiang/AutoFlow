import "../../styles/css/staff/staffProfileStyle.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";

export default function StaffProfile({ session }) {
  const { currentUser, updateProfile, requestPasswordChangeOtp, verifyPasswordChangeOtp, resetPasswordWithOtp } = useAdminData();
  const initial = useMemo(
    () => ({
      first: currentUser?.first || session?.first || session?.firstName || "",
      last: currentUser?.last || session?.last || session?.lastName || "",
      email: currentUser?.email || session?.email || "",
      phone: currentUser?.phone || session?.phone || "",
    }),
    [currentUser, session]
  );

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
  const otpRefs = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    setSaved(initial);
    setForm(initial);
  }, [initial]);

  const initialLetter = useMemo(() => {
    const base = String(saved.first || saved.email || "S").trim();
    return base ? base[0].toUpperCase() : "S";
  }, [saved]);

  const startCountdown = () => {
    clearInterval(timerRef.current);
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((count) => {
        if (count <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return count - 1;
      });
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
    if (!normalizedEmail.includes("@")) {
      setOtpError("Please enter a valid email address.");
      return;
    }
    if (normalizedEmail !== currentEmail) {
      setOtpError("Use your current account email to receive the OTP.");
      return;
    }
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

  const handleOtpChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setOtpError("");
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, event) => {
    if (event.key === "Backspace") {
      if (otpDigits[index]) {
        const next = [...otpDigits];
        next[index] = "";
        setOtpDigits(next);
      } else if (index > 0) {
        otpRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleVerifyOtp = async () => {
    const code = otpDigits.join("");
    if (code.length < 6) {
      setOtpError("Please enter the 6-digit code.");
      return;
    }
    if (!otpSession.verificationId) {
      setOtpError("Please request a new OTP.");
      return;
    }
    try {
      setOtpError("");
      await verifyPasswordChangeOtp({ verificationId: otpSession.verificationId, otp: code });
      setPwStep("newpass");
    } catch (error) {
      setOtpError(error.message || "Failed to verify OTP.");
    }
  };

  const handleSaveAll = async () => {
    const payload = {
      first: form.first.trim(),
      last: form.last.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    };

    if (!payload.first || !payload.last) {
      window.alert("Please enter your first and last name.");
      return;
    }

    if (!payload.email.includes("@")) {
      window.alert("Please enter a valid email address.");
      return;
    }

    if (pwStep === "newpass") {
      if (!newPass) {
        setPassError("Please enter a new password.");
        return;
      }
      if (newPass.length < 8) {
        setPassError("Password must be at least 8 characters.");
        return;
      }
      if (newPass !== confirmPass) {
        setPassError("Passwords do not match.");
        return;
      }
      if (!otpSession.verificationId) {
        setPassError("Please verify the OTP again.");
        return;
      }
      await resetPasswordWithOtp({ verificationId: otpSession.verificationId, password: newPass });
    }

    await updateProfile(payload);
    setSaved(payload);
    closeModal();
  };

  const canSave = pwStep === "idle" || pwStep === "newpass";

  return (
    <>
      <div className="stProWrap">
        <div className="stProCard">
          <div className="stProInner">
            <div className="stProLeft">
              <div className="stProAvatar">{initialLetter}</div>
            </div>

            <div className="stProForm">
              <div className="stProGrid2">
                <div className="stProField">
                  <div className="stProLabel">First Name</div>
                  <input className="stProInput" readOnly value={saved.first} placeholder="Enter your first name" />
                </div>
                <div className="stProField">
                  <div className="stProLabel">Last Name</div>
                  <input className="stProInput" readOnly value={saved.last} placeholder="Enter your last name" />
                </div>
              </div>

              <div className="stProField">
                <div className="stProLabel">Email</div>
                <input className="stProInput" readOnly value={saved.email} placeholder="Enter your email" />
              </div>

              <div className="stProField">
                <div className="stProLabel">Phone</div>
                <input className="stProInput" readOnly value={saved.phone} placeholder="09xx xxx xxxx" />
              </div>

              <div className="stProField"><div className="stProLabel">Password</div><input className="stProInput" readOnly type="password" value="placeholder" /></div>

              <div className="stProActions">
                <button className="stProSaveBtn" type="button" onClick={openModal}>
                  Edit Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          className={`stM-overlay${animating ? " open" : ""}`}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="stM-box">
            <div className="stM-head">
              <div>
                <p className="stM-title">Edit Account</p>
                <p className="stM-sub">Update your personal information</p>
              </div>
              <button className="stM-x" onClick={closeModal}>
                ✕
              </button>
            </div>

            <div className="stM-body">
              <div className="stProGrid2">
                <div className="stM-field">
                  <div className="stM-label">First Name</div>
                  <input
                    className="stM-input"
                    value={form.first}
                    onChange={(e) => setForm((prev) => ({ ...prev, first: e.target.value }))}
                    placeholder="First name"
                  />
                </div>
                <div className="stM-field">
                  <div className="stM-label">Last Name</div>
                  <input
                    className="stM-input"
                    value={form.last}
                    onChange={(e) => setForm((prev) => ({ ...prev, last: e.target.value }))}
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div className="stM-field">
                <div className="stM-label">Email</div>
                <input
                  className="stM-input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="Enter your email"
                />
              </div>

              <div className="stM-field">
                <div className="stM-label">Phone</div>
                <input
                  className="stM-input"
                  type="tel"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, "").slice(0, 11) }))
                  }
                  placeholder="09xx xxx xxxx"
                />
              </div>

              <div className="stM-divider">
                <span>Password</span>
              </div>

              <div className="stPw-box">
                {pwStep === "idle" && (
                  <>
                    <div>
                      <p className="stPw-title">Change Password</p>
                      <p className="stPw-sub">Verify your identity with a one-time code first.</p>
                    </div>
                    <button className="stPw-trigger" type="button" onClick={() => { setVerifyEmail(saved.email || initial.email || ""); setPwStep("email"); }}>
                      Change Password →
                    </button>
                  </>
                )}

                {pwStep === "email" && (
                  <>
                    <button
                      className="stBack-btn"
                      type="button"
                      onClick={() => {
                        setPwStep("idle");
                        setOtpError("");
                      }}
                    >
                      ← Back
                    </button>
                    <div className="stM-field">
                      <div className="stM-label">Enter your email to receive OTP</div>
                      <input
                        className={`stM-input${otpError ? " eb" : ""}`}
                        type="email"
                        value={verifyEmail}
                        onChange={(e) => {
                          setVerifyEmail(e.target.value);
                          setOtpError("");
                        }}
                        placeholder="your@email.com"
                        onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                        autoFocus
                      />
                      {otpError && <div className="stErr-msg">{otpError}</div>}
                    </div>
                    <button className="stFull-btn" type="button" onClick={handleSendOtp}>
                      Send OTP
                    </button>
                  </>
                )}

                {pwStep === "otp" && (
                  <>
                    <button
                      className="stBack-btn"
                      type="button"
                      onClick={() => {
                        setPwStep("email");
                        setOtpDigits(["", "", "", "", "", ""]);
                        setOtpError("");
                      }}
                    >
                      ← Back
                    </button>
                    <p className="stOtp-hint">
                      Enter the 6-digit code sent to <strong>{otpSession.destination || verifyEmail}</strong>.
                    </p>
                    <div className="stOtp-boxes">
                      {otpDigits.map((digit, index) => (
                        <input
                          key={index}
                          ref={(el) => {
                            otpRefs.current[index] = el;
                          }}
                          className={`stOtp-box${digit ? " ok" : ""}${otpError ? " bad" : ""}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(index, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(index, e)}
                          onFocus={(e) => e.target.select()}
                          autoFocus={index === 0}
                        />
                      ))}
                    </div>
                    {otpError && <div className="stErr-msg">{otpError}</div>}
                    <div className="stResend-row">
                      {countdown > 0 ? (
                        `Resend in ${countdown}s`
                      ) : (
                        <>
                          <span>Didn't get it? </span>
                          <button type="button" onClick={handleSendOtp}>
                            Resend OTP
                          </button>
                        </>
                      )}
                    </div>
                    <button className="stFull-btn" type="button" onClick={handleVerifyOtp}>
                      Verify OTP
                    </button>
                  </>
                )}

                {pwStep === "newpass" && (
                  <>
                    <div className="stVerified-badge">✓ Identity verified - set your new password</div>
                    <div className="stM-field">
                      <div className="stM-label">New Password</div>
                      <div className="stPw-input-row">
                        <input
                          className={`stM-input${passError ? " eb" : ""}`}
                          type="password"
                          value={newPass}
                          onChange={(e) => {
                            setNewPass(e.target.value);
                            setPassError("");
                          }}
                          placeholder="Min. 8 characters"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="stM-field">
                      <div className="stM-label">Confirm Password</div>
                      <div className="stPw-input-row">
                        <input
                          className={`stM-input${passError ? " eb" : ""}`}
                          type="password"
                          value={confirmPass}
                          onChange={(e) => {
                            setConfirmPass(e.target.value);
                            setPassError("");
                          }}
                          placeholder="Re-enter new password"
                        />
                      </div>
                    </div>
                    {passError && <div className="stErr-msg">{passError}</div>}
                  </>
                )}
              </div>
            </div>

            <div className="stM-foot">
              <button className="stM-cancel" type="button" onClick={closeModal}>
                Cancel
              </button>
              <button className="stM-save" type="button" disabled={!canSave} onClick={handleSaveAll}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
