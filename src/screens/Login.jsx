import "../styles/css/login.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";
import { consumeAuthMessage, getDashboardRoute, writeAuthSession } from "../utils/auth";

import Navbar from "../components/Navbar";
import loginBackground from "../assets/IMAGE/IMG_9815.jpg";

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
const isSignUpEmail = (v) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(String(v || "").trim());
const onlyLettersSpaces = (v) => /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/.test(String(v || "").trim());
const onlyDigits = (v) => /^\d+$/.test(String(v || "").trim());
const OTP_RESEND_WAIT_SECONDS = 120;
const OTP_RESEND_LIMIT = 3;
const OTP_COOLDOWN_SECONDS = 15 * 60;

const formatOtpTime = (totalSeconds) => {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const isPHMobile11 = (v) => {
  const s = String(v || "").trim();
  return /^\d{11}$/.test(s) && s.startsWith("09");
};

const passRules = (v) => {
  const s = String(v || "");
  return {
    okLen: s.length >= 8,
    okUpper: /[A-Z]/.test(s),
    okLower: /[a-z]/.test(s),
    okNum: /\d/.test(s),
    okSpecial: /[^A-Za-z0-9]/.test(s),
  };
};

const getPasswordChecks = (password) => {
  const rules = passRules(password);
  return [
    { key: "length", label: "At least 8 characters", met: rules.okLen },
    { key: "uppercase", label: "At least 1 uppercase letter", met: rules.okUpper },
    { key: "lowercase", label: "At least 1 lowercase letter", met: rules.okLower },
    { key: "special", label: "At least 1 special character", met: rules.okSpecial },
    { key: "number", label: "At least 1 number", met: rules.okNum },
  ];
};

export default function Login() {
  const navigate = useNavigate();

  const [tab, setTab] = useState("signin");
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  const [signIn, setSignIn] = useState({ email: "", password: "" });
  const [signUp, setSignUp] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const [touchedIn, setTouchedIn] = useState({});
  const [touchedUp, setTouchedUp] = useState({});
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [fpOpen, setFpOpen] = useState(false);
  const [fpStep, setFpStep] = useState("email");
  const [fp, setFp] = useState({ email: "", otp: "", newPass: "", confirmNew: "" });
  const [fpTouched, setFpTouched] = useState({});
  const [fpError, setFpError] = useState("");
  const [fpInfo, setFpInfo] = useState("");
  const [fpOtpSession, setFpOtpSession] = useState({ verificationId: "", destination: "", channel: "" });
  const [fpOtpEmail, setFpOtpEmail] = useState("");
  const [fpOtpTimerSeconds, setFpOtpTimerSeconds] = useState(0);
  const [fpCanResendOtp, setFpCanResendOtp] = useState(false);
  const [fpResendCount, setFpResendCount] = useState(0);
  const [fpCooldownSeconds, setFpCooldownSeconds] = useState(0);
  const [fpIsCooldown, setFpIsCooldown] = useState(false);
  const [fpShowNew, setFpShowNew] = useState(false);
  const [fpShowConfirm, setFpShowConfirm] = useState(false);
  const fpOtpRefs = useRef([]);
  const [signupOtpOpen, setSignupOtpOpen] = useState(false);
  const [signupOtpStep, setSignupOtpStep] = useState("channel");
  const [signupOtpChoice, setSignupOtpChoice] = useState("email");
  const [signupOtpCode, setSignupOtpCode] = useState("");
  const [signupOtpSession, setSignupOtpSession] = useState({ verificationId: "", destination: "", channel: "" });
  const [signupOtpEmail, setSignupOtpEmail] = useState("");
  const [signupOtpTimerSeconds, setSignupOtpTimerSeconds] = useState(0);
  const [signupCanResendOtp, setSignupCanResendOtp] = useState(false);
  const [signupResendCount, setSignupResendCount] = useState(0);
  const [signupCooldownSeconds, setSignupCooldownSeconds] = useState(0);
  const [signupIsCooldown, setSignupIsCooldown] = useState(false);
  const [signupOtpError, setSignupOtpError] = useState("");
	  const [signupOtpInfo, setSignupOtpInfo] = useState("");
	  const signupOtpRefs = useRef([]);

  useEffect(() => {
    const message = consumeAuthMessage();
    if (message) {
      setTab("signin");
      setAuthError(message);
    }
  }, []);

  const isSignIn = tab === "signin";

  const signInErrors = useMemo(() => {
    const e = {};
    if (!signIn.email.trim()) e.email = "Email is required.";
    else if (!isEmail(signIn.email)) e.email = "Enter a valid email.";

    if (!signIn.password) e.password = "Password is required.";
    else if (signIn.password.length < 8) e.password = "Password must be at least 8 characters.";
    return e;
  }, [signIn]);

  const signUpErrors = useMemo(() => {
    const e = {};

    const firstName = signUp.firstName.trim();
    const lastName = signUp.lastName.trim();

    if (!firstName) e.firstName = "First name is required.";
    else if (firstName.length > 24) e.firstName = "First name must be 24 characters or less.";
    else if (!onlyLettersSpaces(firstName)) e.firstName = "Use letters only.";

    if (!lastName) e.lastName = "Last name is required.";
    else if (lastName.length > 24) e.lastName = "Last name must be 24 characters or less.";
    else if (!onlyLettersSpaces(lastName)) e.lastName = "Use letters only.";

    if (!signUp.email.trim()) e.email = "Email is required.";
    else if (!isSignUpEmail(signUp.email)) e.email = "Enter a valid email address.";

    if (!signUp.phone.trim()) e.phone = "Phone number is required.";
    else if (!onlyDigits(signUp.phone)) e.phone = "Phone must contain digits only.";
    else if (!isPHMobile11(signUp.phone)) e.phone = "Phone must be 11 digits and start with 09.";

    if (!signUp.password) e.password = "Password is required.";
    else {
      const r = passRules(signUp.password);
      if (!r.okLen) e.password = "Password must be at least 8 characters.";
      else if (!r.okUpper) e.password = "Add at least 1 uppercase letter.";
      else if (!r.okLower) e.password = "Add at least 1 lowercase letter.";
      else if (!r.okSpecial) e.password = "Add at least 1 special character.";
      else if (!r.okNum) e.password = "Add at least 1 number.";
    }

    if (!signUp.confirmPassword) e.confirmPassword = "Confirm your password.";
    else if (signUp.confirmPassword !== signUp.password) e.confirmPassword = "Passwords do not match.";

    return e;
  }, [signUp]);

  const canSubmitSignIn = Object.keys(signInErrors).length === 0;
  const canSubmitSignUp = Object.keys(signUpErrors).length === 0;
  const signUpPasswordChecks = useMemo(() => getPasswordChecks(signUp.password), [signUp.password]);
  const shouldShowSignUpError = (field) =>
    Boolean(signUpErrors[field] && (touchedUp[field] || String(signUp[field] || "").length > 0));

  const fpErrors = useMemo(() => {
    const e = {};

    if (fpStep === "email") {
      if (!fp.email.trim()) e.email = "Email is required.";
      else if (!isEmail(fp.email)) e.email = "Enter a valid email.";
    }

    if (fpStep === "otp") {
      if (!fp.otp.trim()) e.otp = "Security code is required.";
      else if (!/^\d{6}$/.test(fp.otp.trim())) e.otp = "Code must be 6 digits.";
    }

    if (fpStep === "reset") {
      if (!fp.newPass) e.newPass = "New password is required.";
      else {
        const r = passRules(fp.newPass);
        if (!r.okLen) e.newPass = "Password must be at least 8 characters.";
        else if (!r.okUpper) e.newPass = "Add at least 1 uppercase letter.";
        else if (!r.okLower) e.newPass = "Add at least 1 lowercase letter.";
        else if (!r.okNum) e.newPass = "Add at least 1 number.";
      }

      if (!fp.confirmNew) e.confirmNew = "Confirm your password.";
      else if (fp.confirmNew !== fp.newPass) e.confirmNew = "Passwords do not match.";
    }

    return e;
  }, [fp, fpStep]);

  const fpCanContinue = Object.keys(fpErrors).length === 0;
  const fpOtpDigits = useMemo(
    () => Array.from({ length: 6 }, (_, index) => fp.otp[index] || ""),
    [fp.otp]
  );
  const signupOtpDigits = useMemo(
    () => Array.from({ length: 6 }, (_, index) => signupOtpCode[index] || ""),
    [signupOtpCode]
  );
  const signupResendMessage = signupIsCooldown
    ? `Too many resend attempts. Try again in ${formatOtpTime(signupCooldownSeconds)}.`
    : signupOtpTimerSeconds > 0
      ? `Resend available in ${formatOtpTime(signupOtpTimerSeconds)}.`
      : "You can request a new OTP now.";
  const signupResendButtonText = signupIsCooldown
    ? `Locked (${formatOtpTime(signupCooldownSeconds)})`
    : "Resend OTP";
  const signupResendDisabled = isSubmitting || signupIsCooldown || !signupCanResendOtp;
  const fpResendMessage = fpIsCooldown
    ? `Too many resend attempts. Try again in ${formatOtpTime(fpCooldownSeconds)}.`
    : fpOtpTimerSeconds > 0
      ? `Resend available in ${formatOtpTime(fpOtpTimerSeconds)}.`
      : "You can request a new OTP now.";
  const fpResendButtonText = fpIsCooldown
    ? `Locked (${formatOtpTime(fpCooldownSeconds)})`
    : "Resend OTP";
  const fpResendDisabled = isSubmitting || fpIsCooldown || !fpCanResendOtp;

  useEffect(() => {
    if (signupOtpTimerSeconds <= 0) {
      if (!signupIsCooldown && signupOtpSession.verificationId) {
        setSignupCanResendOtp(true);
      }
      return undefined;
    }

    setSignupCanResendOtp(false);
    const timerId = setInterval(() => {
      setSignupOtpTimerSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => clearInterval(timerId);
  }, [signupOtpTimerSeconds, signupIsCooldown, signupOtpSession.verificationId]);

  useEffect(() => {
    if (!signupIsCooldown) return undefined;

    setSignupCanResendOtp(false);
    if (signupCooldownSeconds <= 0) {
      setSignupIsCooldown(false);
      setSignupResendCount(0);
      setSignupCanResendOtp(true);
      return undefined;
    }

    const timerId = setInterval(() => {
      setSignupCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => clearInterval(timerId);
  }, [signupIsCooldown, signupCooldownSeconds]);

  useEffect(() => {
    if (fpOtpTimerSeconds <= 0) {
      if (!fpIsCooldown && fpOtpSession.verificationId && fpStep === "otp") {
        setFpCanResendOtp(true);
      }
      return undefined;
    }

    setFpCanResendOtp(false);
    const timerId = setInterval(() => {
      setFpOtpTimerSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => clearInterval(timerId);
  }, [fpOtpTimerSeconds, fpIsCooldown, fpOtpSession.verificationId, fpStep]);

  useEffect(() => {
    if (!fpIsCooldown) return undefined;

    setFpCanResendOtp(false);
    if (fpCooldownSeconds <= 0) {
      setFpIsCooldown(false);
      setFpResendCount(0);
      setFpCanResendOtp(true);
      return undefined;
    }

    const timerId = setInterval(() => {
      setFpCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => clearInterval(timerId);
  }, [fpIsCooldown, fpCooldownSeconds]);

  const onTab = (next) => {
    setTab(next);
    setShowPass(false);
    setShowPass2(false);
    setAuthError("");
  };

  const handlePhoneChange = (value) => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 11);
    setSignUp((p) => ({ ...p, phone: digitsOnly }));
  };

  const startFpOtpWait = () => {
    setFpIsCooldown(false);
    setFpCooldownSeconds(0);
    setFpCanResendOtp(false);
    setFpOtpTimerSeconds(OTP_RESEND_WAIT_SECONDS);
  };

  const startFpOtpCooldown = () => {
    setFpOtpTimerSeconds(0);
    setFpCanResendOtp(false);
    setFpIsCooldown(true);
    setFpCooldownSeconds(OTP_COOLDOWN_SECONDS);
  };

  const resetFpOtpResendSystem = () => {
    setFpOtpTimerSeconds(0);
    setFpCanResendOtp(false);
    setFpResendCount(0);
    setFpCooldownSeconds(0);
    setFpIsCooldown(false);
  };

  const startSignupOtpWait = () => {
    setSignupIsCooldown(false);
    setSignupCooldownSeconds(0);
    setSignupCanResendOtp(false);
    setSignupOtpTimerSeconds(OTP_RESEND_WAIT_SECONDS);
  };

  const startSignupOtpCooldown = () => {
    setSignupOtpTimerSeconds(0);
    setSignupCanResendOtp(false);
    setSignupIsCooldown(true);
    setSignupCooldownSeconds(OTP_COOLDOWN_SECONDS);
  };

  const resetSignupOtpResendSystem = () => {
    setSignupOtpTimerSeconds(0);
    setSignupCanResendOtp(false);
    setSignupResendCount(0);
    setSignupCooldownSeconds(0);
    setSignupIsCooldown(false);
  };

  const openForgot = () => {
    const emailToUse = String(signIn.email || fp.email || "").trim().toLowerCase();
    const hasActiveOtp = fpOtpSession.verificationId && fpOtpEmail === emailToUse && fpStep === "otp";

    setFpOpen(true);
    setFpTouched({});
    setFpError("");
    setFpShowNew(false);
    setFpShowConfirm(false);

    if (hasActiveOtp) {
      setFpStep("otp");
      setFp((prev) => ({ ...prev, email: emailToUse, otp: "" }));
      return;
    }

    setFpStep("email");
    setFp({ email: signIn.email || "", otp: "", newPass: "", confirmNew: "" });
    setFpInfo("");
    setFpOtpSession({ verificationId: "", destination: "", channel: "" });
    setFpOtpEmail("");
    resetFpOtpResendSystem();
  };

  const closeForgot = () => {
    setFpOpen(false);
    setFpError("");
    setFpInfo("");
  };

  const fpMarkAll = () => {
    if (fpStep === "email") setFpTouched({ email: true });
    if (fpStep === "otp") setFpTouched({ otp: true });
    if (fpStep === "reset") setFpTouched({ newPass: true, confirmNew: true });
  };

  const handleForgotOtpChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const nextDigits = [...fpOtpDigits];
    nextDigits[index] = digit;
    setFp((prev) => ({ ...prev, otp: nextDigits.join("") }));
    setFpError("");

    if (digit && index < fpOtpRefs.current.length - 1) {
      fpOtpRefs.current[index + 1]?.focus();
    }
  };

  const handleForgotOtpKeyDown = (index, event) => {
    if (event.key === "Backspace" && !fpOtpDigits[index] && index > 0) {
      fpOtpRefs.current[index - 1]?.focus();
    }
  };

  const handleForgotOtpPaste = (event) => {
    event.preventDefault();
    const pastedDigits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pastedDigits) return;

    const nextDigits = Array.from({ length: 6 }, (_, index) => pastedDigits[index] || "");
    setFp((prev) => ({ ...prev, otp: nextDigits.join("") }));
    setFpError("");

    const focusIndex = Math.min(pastedDigits.length, 6) - 1;
    if (focusIndex >= 0) {
      fpOtpRefs.current[focusIndex]?.focus();
    }
  };

  const sendForgotOtp = async ({ isResend = false } = {}) => {
    if (isResend && fpResendDisabled) return;

    setIsSubmitting(true);
    setFpError("");
    try {
      const email = fp.email.trim().toLowerCase();
      const payload = await apiRequest("/api/auth/password-change/request-otp", {
        method: "POST",
        body: JSON.stringify({
          email,
          channel: "email",
        }),
      });
      setFpOtpSession({
        verificationId: payload.verificationId,
        destination: payload.destination,
        channel: payload.channel,
      });
      setFpOtpEmail(email);
      setFpInfo(payload.message || "");
      setFp((prev) => ({ ...prev, otp: "" }));
      setFpStep("otp");
      setFpTouched({});

      if (isResend) {
        const nextResendCount = fpResendCount + 1;
        setFpResendCount(nextResendCount);
        if (nextResendCount >= OTP_RESEND_LIMIT) {
          startFpOtpCooldown();
        } else {
          startFpOtpWait();
        }
      } else {
        setFpResendCount(0);
        startFpOtpWait();
      }
    } catch (error) {
      setFpError(error.message || "Failed to send OTP.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fpNext = async () => {
    fpMarkAll();
    if (!fpCanContinue) return;

    if (fpStep === "email") {
      await sendForgotOtp();
      return;
    }

    if (fpStep === "otp") {
      setIsSubmitting(true);
      setFpError("");
      try {
        await apiRequest("/api/auth/password-change/verify-otp", {
          method: "POST",
          body: JSON.stringify({
            verificationId: fpOtpSession.verificationId,
            otp: fp.otp.trim(),
          }),
        });
        setFpStep("reset");
        setFpTouched({});
      } catch (error) {
        setFpError(error.message || "Failed to verify OTP.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (fpStep === "reset") {
      setIsSubmitting(true);
      setFpError("");
      try {
        await apiRequest("/api/auth/password-change/reset", {
          method: "POST",
          body: JSON.stringify({
            verificationId: fpOtpSession.verificationId,
            password: fp.newPass,
          }),
        });
        setFpOtpSession({ verificationId: "", destination: "", channel: "" });
        setFpOtpEmail("");
        resetFpOtpResendSystem();
        closeForgot();
      } catch (error) {
        setFpError(error.message || "Failed to reset password.");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleSignIn = (e) => {
    e.preventDefault();
    void (async () => {
      setTouchedIn({ email: true, password: true });
      setAuthError("");

      if (!canSubmitSignIn) return;

      setIsSubmitting(true);
      try {
        const payload = await apiRequest("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: signIn.email.trim().toLowerCase(),
            password: signIn.password,
          }),
        });

        writeAuthSession(payload.token, payload.user);
        navigate(getDashboardRoute(payload.user), { replace: true });
      } catch (error) {
        setAuthError(error.message || "Invalid email or password.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const handleSignUp = (e) => {
    e.preventDefault();

    setTouchedUp({
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      password: true,
      confirmPassword: true,
    });

    if (!canSubmitSignUp) return;

    const email = signUp.email.trim().toLowerCase();
    const hasActiveOtp = signupOtpSession.verificationId && signupOtpEmail === email;

    setSignupOtpOpen(true);
    setSignupOtpChoice("email");
    setSignupOtpError("");

    if (hasActiveOtp) {
      setSignupOtpStep("otp");
      setSignupOtpCode("");
      return;
    }

    setSignupOtpCode("");
    setSignupOtpInfo("Sending OTP to your email address...");
    setSignupOtpSession({ verificationId: "", destination: "", channel: "" });
    setSignupOtpEmail("");
    setSignupOtpStep("channel");
    resetSignupOtpResendSystem();
    void sendSignupOtp("email");
  };

  const closeSignupOtp = ({ force = false } = {}) => {
    if (isSubmitting && !force) return;
    setSignupOtpOpen(false);
    setSignupOtpCode("");
    setSignupOtpError("");
  };

  const handleSignupOtpChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const nextDigits = [...signupOtpDigits];
    nextDigits[index] = digit;
    setSignupOtpCode(nextDigits.join(""));
    setSignupOtpError("");

    if (digit && index < signupOtpRefs.current.length - 1) {
      signupOtpRefs.current[index + 1]?.focus();
    }
  };

  const handleSignupOtpKeyDown = (index, event) => {
    if (event.key === "Backspace" && !signupOtpDigits[index] && index > 0) {
      signupOtpRefs.current[index - 1]?.focus();
    }
  };

  const handleSignupOtpPaste = (event) => {
    event.preventDefault();
    const pastedDigits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pastedDigits) return;

    const nextDigits = Array.from({ length: 6 }, (_, index) => pastedDigits[index] || "");
    setSignupOtpCode(nextDigits.join(""));
    setSignupOtpError("");

    const focusIndex = Math.min(pastedDigits.length, 6) - 1;
    if (focusIndex >= 0) {
      signupOtpRefs.current[focusIndex]?.focus();
    }
  };

  const sendSignupOtp = async (channel = "email", { isResend = false } = {}) => {
    if (isResend && signupResendDisabled) return;

    setIsSubmitting(true);
    setSignupOtpError("");
    try {
      const payload = await apiRequest("/api/auth/signup/request-otp", {
        method: "POST",
        body: JSON.stringify({
          ...signUp,
          channel,
        }),
      });

      setSignupOtpChoice(channel);
      setSignupOtpSession({
        verificationId: payload.verificationId,
        destination: payload.destination,
        channel: payload.channel,
      });
      setSignupOtpEmail(signUp.email.trim().toLowerCase());
      setSignupOtpStep("otp");
      setSignupOtpCode("");
      setSignupOtpInfo(payload.message || "");

      if (isResend) {
        const nextResendCount = signupResendCount + 1;
        setSignupResendCount(nextResendCount);
        if (nextResendCount >= OTP_RESEND_LIMIT) {
          startSignupOtpCooldown();
        } else {
          startSignupOtpWait();
        }
      } else {
        setSignupResendCount(0);
        startSignupOtpWait();
      }
    } catch (error) {
      setSignupOtpError(error.message || "Failed to send OTP.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifySignupOtp = async () => {
    if (!signupOtpCode.trim()) {
      setSignupOtpError("Please enter the 6-digit OTP.");
      return;
    }

    setIsSubmitting(true);
    setSignupOtpError("");
    try {
      const payload = await apiRequest("/api/auth/signup/verify-otp", {
        method: "POST",
        body: JSON.stringify({
          verificationId: signupOtpSession.verificationId,
          otp: signupOtpCode.trim(),
        }),
      });

      writeAuthSession(payload.token, payload.user);
      setSignupOtpSession({ verificationId: "", destination: "", channel: "" });
      setSignupOtpEmail("");
      resetSignupOtpResendSystem();
      closeSignupOtp({ force: true });
      navigate(getDashboardRoute(payload.user), { replace: true });
    } catch (error) {
      setSignupOtpError(error.message || "Failed to verify OTP.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Navigate home then scroll to a section ──────────────────────────────────
  const goHome = (sectionId) => {
    navigate("/");
    if (sectionId) {
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 120);
    } else {
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 120);
    }
  };

  return (
    <div className="page">
      <Navbar />

      <main className="authWrap" style={{ "--auth-photo": `url(${loginBackground})` }}>
        <div className="authCenter">

          <h1 className="authTitle">All Pro-Tec Car Care</h1>
          <p className="authSub">
            Quality is our top priority, and customer satisfaction is our ultimate goal.
          </p>

          <div className="authCard">
            <div className="authTabs">
              <button
                type="button"
                className={`authTab ${isSignIn ? "active" : ""}`}
                onClick={() => onTab("signin")}
              >
                Sign In
              </button>

              <button
                type="button"
                className={`authTab ${!isSignIn ? "active" : ""}`}
                onClick={() => onTab("signup")}
              >
                Sign Up
              </button>
            </div>

            <div className="authBody">
              <div className="authWelcome">{isSignIn ? "Welcome back" : "Create Account"}</div>

              <div className="authDesc">
                {isSignIn
                  ? "Sign in to your account to manage your car service appointments."
                  : "Sign up to start booking your car service appointment"}
              </div>

              {/* ── SIGN IN ── */}
              {isSignIn && (
                <form onSubmit={handleSignIn}>
                  <div className="authField">
                    <label className="authLabel">Email</label>
                    <input
                      className={`authInput ${touchedIn.email && signInErrors.email ? "inputError" : ""}`}
                      value={signIn.email}
                      onChange={(e) => setSignIn((p) => ({ ...p, email: e.target.value }))}
                      onBlur={() => setTouchedIn((p) => ({ ...p, email: true }))}
                      type="email"
                      placeholder="Enter your email"
                    />
                    {touchedIn.email && signInErrors.email && (
                      <div className="fieldError">{signInErrors.email}</div>
                    )}
                  </div>

                  <div className="authField">
                    <label className="authLabel">Password</label>
                    <div className="authPassRow">
                      <input
                        className={`authInput authInputPass ${touchedIn.password && signInErrors.password ? "inputError" : ""}`}
                        value={signIn.password}
                        onChange={(e) => setSignIn((p) => ({ ...p, password: e.target.value }))}
                        onBlur={() => setTouchedIn((p) => ({ ...p, password: true }))}
                        type={showPass ? "text" : "password"}
                        placeholder="Enter your password"
                      />
                      <button
                        type="button"
                        className="authShow"
                        onClick={() => setShowPass((v) => !v)}
                      >
                        {showPass ? "Hide" : "Show"}
                      </button>
                    </div>
                    {touchedIn.password && signInErrors.password && (
                      <div className="fieldError">{signInErrors.password}</div>
                    )}
                  </div>

                  {authError && <div className="fieldError">{authError}</div>}

                  <button className="authSubmit" type="submit" disabled={isSubmitting}>
                    Sign In
                  </button>

                  <div className="authLinks">
                    <button type="button" className="authLinkBtn" onClick={openForgot}>
                      Forgot Password?
                    </button>
                    {/* ← Fixed: uses goHome() instead of <Link to="/"> */}
                    <button type="button" className="authLinkBtn" onClick={() => goHome(null)}>
                      Back to Home
                    </button>
                  </div>
                </form>
              )}

              {/* ── SIGN UP ── */}
              {!isSignIn && (
                <form onSubmit={handleSignUp}>
                  <div className="authRow2">
                    <div className="authField">
                      <label className="authLabel">First Name</label>
                      <input
                        className={`authInput ${shouldShowSignUpError("firstName") ? "inputError" : ""}`}
                        value={signUp.firstName}
                        onChange={(e) => setSignUp((p) => ({ ...p, firstName: e.target.value }))}
                        onBlur={() => setTouchedUp((p) => ({ ...p, firstName: true }))}
                        placeholder="Enter your first name"
                      />
                      {shouldShowSignUpError("firstName") && (
                        <div className="fieldError">{signUpErrors.firstName}</div>
                      )}
                    </div>

                    <div className="authField">
                      <label className="authLabel">Last Name</label>
                      <input
                        className={`authInput ${shouldShowSignUpError("lastName") ? "inputError" : ""}`}
                        value={signUp.lastName}
                        onChange={(e) => setSignUp((p) => ({ ...p, lastName: e.target.value }))}
                        onBlur={() => setTouchedUp((p) => ({ ...p, lastName: true }))}
                        placeholder="Enter your last name"
                      />
                      {shouldShowSignUpError("lastName") && (
                        <div className="fieldError">{signUpErrors.lastName}</div>
                      )}
                    </div>
                  </div>

                  <div className="authField">
                    <label className="authLabel">Email</label>
                    <input
                      className={`authInput ${shouldShowSignUpError("email") ? "inputError" : ""}`}
                      value={signUp.email}
                      onChange={(e) => setSignUp((p) => ({ ...p, email: e.target.value }))}
                      onBlur={() => setTouchedUp((p) => ({ ...p, email: true }))}
                      type="email"
                      placeholder="Enter your email"
                    />
                    {shouldShowSignUpError("email") && (
                      <div className="fieldError">{signUpErrors.email}</div>
                    )}
                  </div>

                  <div className="authField">
                    <label className="authLabel">Phone</label>
                    <input
                      className={`authInput ${shouldShowSignUpError("phone") ? "inputError" : ""}`}
                      value={signUp.phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      onBlur={() => setTouchedUp((p) => ({ ...p, phone: true }))}
                      inputMode="numeric"
                      placeholder="09xx xxx xxxx"
                    />
                    <div className="hintText">Phone must be 11 digits and start with 09.</div>
                    {shouldShowSignUpError("phone") && (
                      <div className="fieldError">{signUpErrors.phone}</div>
                    )}
                  </div>

                  <div className="authField">
                    <label className="authLabel">Password</label>
                    <div className="authPassRow">
                      <input
                        className={`authInput authInputPass ${shouldShowSignUpError("password") ? "inputError" : ""}`}
                        value={signUp.password}
                        onChange={(e) => setSignUp((p) => ({ ...p, password: e.target.value }))}
                        onBlur={() => setTouchedUp((p) => ({ ...p, password: true }))}
                        type={showPass ? "text" : "password"}
                        placeholder="Enter your password"
                      />
                      <button
                        type="button"
                        className="authShow"
                        onClick={() => setShowPass((v) => !v)}
                      >
                        {showPass ? "Hide" : "Show"}
                      </button>
                    </div>
                    <div className="passwordChecklist" aria-live="polite">
                      {signUpPasswordChecks.map((check) => (
                        <div className={`passwordCheckItem ${check.met ? "met" : ""}`} key={check.key}>
                          <span className="passwordCheckIcon">{check.met ? "✓" : "•"}</span>
                          <span>{check.label}</span>
                        </div>
                      ))}
                    </div>
                    {shouldShowSignUpError("password") && (
                      <div className="fieldError">{signUpErrors.password}</div>
                    )}
                  </div>

                  <div className="authField">
                    <label className="authLabel">Confirm Password</label>
                    <div className="authPassRow">
                      <input
                        className={`authInput authInputPass ${shouldShowSignUpError("confirmPassword") ? "inputError" : ""}`}
                        value={signUp.confirmPassword}
                        onChange={(e) => setSignUp((p) => ({ ...p, confirmPassword: e.target.value }))}
                        onBlur={() => setTouchedUp((p) => ({ ...p, confirmPassword: true }))}
                        type={showPass2 ? "text" : "password"}
                        placeholder="Confirm your password"
                      />
                      <button
                        type="button"
                        className="authShow"
                        onClick={() => setShowPass2((v) => !v)}
                      >
                        {showPass2 ? "Hide" : "Show"}
                      </button>
                    </div>
                    {shouldShowSignUpError("confirmPassword") && (
                      <div className="fieldError">{signUpErrors.confirmPassword}</div>
                    )}
                  </div>

                  <button className="authSubmit" type="submit" disabled={isSubmitting}>
                    Create Account
                  </button>

                  <div className="authLinks">
                    <span />
                    {/* ← Fixed: uses goHome() instead of <Link to="/"> */}
                    <button type="button" className="authLinkBtn" onClick={() => goHome(null)}>
                      Back to Home
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          <button
            type="button"
            className="authHelp"
            onClick={() => goHome("contact")}
          >
            Need help? Contact Us <span className="authArrow">→</span>
          </button>
        </div>

        {/* ── FORGOT PASSWORD MODAL ── */}
        {fpOpen && (
          <div
            className="fpOverlay"
            onMouseDown={(e) => {
              if (e.target.classList.contains("fpOverlay")) closeForgot();
            }}
          >
            <div className="fpModal" role="dialog" aria-modal="true">
              {fpStep === "email" && (
                <>
                  <div className="fpTitle">Forgot Password</div>
                  <div className="fpDesc">Please enter your email to search for your account.</div>

                  <div className="fpField">
                    <input
                      className={`fpInput ${fpTouched.email && fpErrors.email ? "inputError" : ""}`}
                      value={fp.email}
                      onChange={(e) => setFp((p) => ({ ...p, email: e.target.value }))}
                      onBlur={() => setFpTouched((p) => ({ ...p, email: true }))}
                      type="email"
                      placeholder="Enter your email"
                    />
                    {fpTouched.email && fpErrors.email && (
                      <div className="fieldError">{fpErrors.email}</div>
                    )}
                    {fpError && <div className="fieldError">{fpError}</div>}
                  </div>

                  <button className="fpBtn" type="button" onClick={() => void fpNext()} disabled={!fpCanContinue || isSubmitting}>
                    Send OTP
                  </button>
                </>
              )}

              {fpStep === "otp" && (
                <>
                  <div className="fpTitle">Enter Security Code</div>
                  <div className="fpDesc">
                    {fpInfo || "Please check your email for a message with your code."}
                    {fpOtpSession.destination ? ` Sent to ${fpOtpSession.destination}.` : ""}
                  </div>

                  <div className="fpField">
                    <div className="fpOtpBoxes" onPaste={handleForgotOtpPaste}>
                      {fpOtpDigits.map((digit, index) => (
                        <input
                          key={index}
                          ref={(el) => {
                            fpOtpRefs.current[index] = el;
                          }}
                          className={`fpOtpBox${digit ? " ok" : ""}${(fpTouched.otp && fpErrors.otp) || fpError ? " bad" : ""}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleForgotOtpChange(index, e.target.value)}
                          onKeyDown={(e) => handleForgotOtpKeyDown(index, e)}
                          onFocus={(e) => e.target.select()}
                          onBlur={() => setFpTouched((p) => ({ ...p, otp: true }))}
                          autoFocus={index === 0}
                          aria-label={`Forgot password OTP digit ${index + 1}`}
                        />
                      ))}
                    </div>
                    {fpTouched.otp && fpErrors.otp && <div className="fieldError">{fpErrors.otp}</div>}
                    {fpError && <div className="fieldError">{fpError}</div>}
                    <div className={`otpTimerText ${fpIsCooldown ? "locked" : ""}`}>
                      {fpResendMessage}
                    </div>
                  </div>

                  <div className="fpOtpActions">
                    <button
                      className="fpResendBtn"
                      type="button"
                      onClick={() => void sendForgotOtp({ isResend: true })}
                      disabled={fpResendDisabled}
                    >
                      {fpResendButtonText}
                    </button>
                    <button className="fpBtn" type="button" onClick={() => void fpNext()} disabled={!fpCanContinue || isSubmitting}>
                      Verify OTP
                    </button>
                  </div>
                </>
              )}

              {fpStep === "reset" && (
                <>
                  <div className="fpTitle">Reset Password</div>
                  <div className="fpDesc">Create a new password for your account.</div>

                  <div className="fpField">
                    <div className="fpLabel">Enter Password</div>
                    <div className="fpPassRow">
                      <input
                        className={`fpInput ${fpTouched.newPass && fpErrors.newPass ? "inputError" : ""}`}
                        value={fp.newPass}
                        onChange={(e) => setFp((p) => ({ ...p, newPass: e.target.value }))}
                        onBlur={() => setFpTouched((p) => ({ ...p, newPass: true }))}
                        type={fpShowNew ? "text" : "password"}
                        placeholder="Enter password"
                      />
                      <button className="fpShow" type="button" onClick={() => setFpShowNew((v) => !v)}>
                        {fpShowNew ? "Hide" : "Show"}
                      </button>
                    </div>
                    {fpTouched.newPass && fpErrors.newPass && (
                      <div className="fieldError">{fpErrors.newPass}</div>
                    )}
                  </div>

                  <div className="fpField">
                    <div className="fpLabel">Confirm Password</div>
                    <div className="fpPassRow">
                      <input
                        className={`fpInput ${fpTouched.confirmNew && fpErrors.confirmNew ? "inputError" : ""}`}
                        value={fp.confirmNew}
                        onChange={(e) => setFp((p) => ({ ...p, confirmNew: e.target.value }))}
                        onBlur={() => setFpTouched((p) => ({ ...p, confirmNew: true }))}
                        type={fpShowConfirm ? "text" : "password"}
                        placeholder="Confirm password"
                      />
                      <button
                        className="fpShow"
                        type="button"
                        onClick={() => setFpShowConfirm((v) => !v)}
                      >
                        {fpShowConfirm ? "Hide" : "Show"}
                      </button>
                    </div>
                    {fpTouched.confirmNew && fpErrors.confirmNew && (
                      <div className="fieldError">{fpErrors.confirmNew}</div>
                    )}
                    {fpError && <div className="fieldError">{fpError}</div>}
                  </div>

                  <button className="fpBtn" type="button" onClick={() => void fpNext()} disabled={!fpCanContinue || isSubmitting}>
                    Save Password
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {signupOtpOpen && (
          <div
            className="suOverlay"
            onMouseDown={(e) => {
              if (e.target.classList.contains("suOverlay")) closeSignupOtp();
            }}
          >
            <div className="suModal" role="dialog" aria-modal="true">
              <div className="suHead">
                <div>
                  <p className="suTitle">Verify New Account</p>
                  <p className="suSub">We’ll send a one-time password to your email to verify your new account.</p>
                </div>
                <button className="suClose" type="button" onClick={closeSignupOtp}>✕</button>
              </div>

              <div className="suBody">
                {signupOtpStep === "channel" && (
                  <>
                    <div className="suChoiceGrid">
                      <button
                        type="button"
                        className={`suChoiceCard ${signupOtpChoice === "email" ? "active" : ""}`}
                        onClick={() => setSignupOtpChoice("email")}
                      >
                        <div className="suChoiceLabel">Send to Email</div>
                        <div className="suChoiceValue">{signUp.email || "Enter your email above"}</div>
                      </button>
                    </div>
                    {signupOtpError && <div className="fieldError">{signupOtpError}</div>}
                    {(signupOtpInfo || signupOtpSession.verificationId) && (
                      <div className={`otpTimerText ${signupIsCooldown ? "locked" : ""}`}>
                        {signupOtpSession.verificationId ? signupResendMessage : signupOtpInfo}
                      </div>
                    )}
                  </>
                )}

                {signupOtpStep === "otp" && (
                  <>
                    <div className="suInfoCard">
                      <div className="suInfoTitle">OTP Sent</div>
                      <div className="suInfoText">
                        {signupOtpInfo || "Enter the OTP we sent to your email address."}
                      </div>
                      <div className="suInfoMeta">
                        Email: {signupOtpSession.destination}
                      </div>
                    </div>

                    <div className="suField">
                      <label className="suLabel">One-Time Password</label>
                      <div className="suOtpBoxes" onPaste={handleSignupOtpPaste}>
                        {signupOtpDigits.map((digit, index) => (
                          <input
                            key={index}
                            ref={(el) => {
                              signupOtpRefs.current[index] = el;
                            }}
                            className={`suOtpBox${digit ? " ok" : ""}${signupOtpError ? " bad" : ""}`}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleSignupOtpChange(index, e.target.value)}
                            onKeyDown={(e) => handleSignupOtpKeyDown(index, e)}
                            onFocus={(e) => e.target.select()}
                            aria-label={`OTP digit ${index + 1}`}
                            autoFocus={index === 0}
                          />
                        ))}
                      </div>
                      {signupOtpError && <div className="fieldError">{signupOtpError}</div>}
                      <div className={`otpTimerText ${signupIsCooldown ? "locked" : ""}`}>
                        {signupResendMessage}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="suFoot">
                {signupOtpStep === "otp" ? (
                  <>
                    <button
                      className="suSecondary"
                      type="button"
                      onClick={() => {
                        setSignupOtpStep("channel");
                        setSignupOtpCode("");
                        setSignupOtpError("");
                      }}
                      disabled={isSubmitting}
                    >
                      Back
                    </button>
                    <button
                      className="suSecondary"
                      type="button"
                      onClick={() => void sendSignupOtp("email", { isResend: true })}
                      disabled={signupResendDisabled}
                    >
                      {signupResendButtonText}
                    </button>
                    <button className="suPrimary" type="button" onClick={() => void verifySignupOtp()} disabled={isSubmitting}>
                      Verify & Create
                    </button>
                  </>
                ) : (
                  <>
                    <button className="suSecondary" type="button" onClick={closeSignupOtp} disabled={isSubmitting}>
                      Cancel
                    </button>
                    <button
                      className="suPrimary"
                      type="button"
                      onClick={() => void sendSignupOtp("email", { isResend: Boolean(signupOtpSession.verificationId) })}
                      disabled={signupOtpSession.verificationId ? signupResendDisabled : isSubmitting}
                    >
                      Send OTP
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
