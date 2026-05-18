import "../../styles/css/staff/staffMainStyle.css";
import ConfirmModal from "../../components/common/ConfirmModal";
import NotificationCenter from "../../components/common/NotificationCenter";

import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { AdminDataProvider, useAdminData } from "../../context/AdminDataContext";
import { clearAuthStorage, getStoredAuth, getUserType, isAuthExpired, readStoredUser } from "../../utils/auth";
import StaffDashboard from "./StaffDashboard";
import StaffBookings from "./StaffBookings";
import StaffTracking from "./StaffTracking";
import StaffPayments from "./StaffPayments";
import StaffServices from "./StaffServices";
import StaffStockMonitoring from "./StaffStockMonitoring";
import StaffEngagement from "./StaffEngagement";
import StaffProfile from "./StaffProfile";
import StaffMyWork from "./StaffMyWork";
import AdminAnalytics from "../admin/AdminAnalytics";
import AdminAuditLogs from "../admin/AdminAuditLogs";
import AdminFinancialTracker from "../admin/AdminFinancialTracker";
import AdminUsers from "../admin/AdminUsers";
import AdminDetailerManagement from "../admin/AdminDetailerManagement";
import AdminEngagement from "../admin/AdminEngagement";
import { ACTION_KEYS, MODULE_KEYS, canAccessModule, canPerformAction, getDefaultModule } from "../../utils/rbac";

import icoDashboard from "../../styles/icons/dashboard.png";
import icoBookings from "../../styles/icons/bookings.png";
import icoServices from "../../styles/icons/services.png";
import icoStockMonitoring from "../../styles/icons/stockMonitoring.png";
import icoTracking from "../../styles/icons/tracking.png";
import icoPayments from "../../styles/icons/payments.png";
import icoEngagement from "../../styles/icons/engagement.png";
import icoProfile from "../../styles/icons/profile.png";
import icoSearch from "../../styles/icons/search.png";
import logo from "../../styles/images/aptlogo.png";

const NAV_SECTIONS = [
  {
    title: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard", icon: icoDashboard, moduleKey: MODULE_KEYS.dashboard },
      { key: "analytics", label: "Analytics", icon: icoDashboard, moduleKey: MODULE_KEYS.analytics },
      { key: "audit", label: "Audit Logs", icon: icoDashboard, moduleKey: MODULE_KEYS.auditLogs },
    ],
  },
  {
    title: "Operations",
    items: [
      { key: "my-work", label: "My Work", icon: icoTracking, moduleKey: MODULE_KEYS.myWork },
      { key: "bookings", label: "Bookings", icon: icoBookings, moduleKey: MODULE_KEYS.bookings },
      { key: "services", label: "Services", icon: icoServices, moduleKey: MODULE_KEYS.services },
      { key: "tracking", label: "Service Tracking", icon: icoTracking, moduleKey: MODULE_KEYS.serviceTracking },
      { key: "stock-monitoring", label: "Stock Monitoring", icon: icoStockMonitoring, moduleKey: MODULE_KEYS.stockMonitoring },
    ],
  },
  {
    title: "Finance",
    items: [
      { key: "payments", label: "Payment Tracking", icon: icoPayments, moduleKey: MODULE_KEYS.paymentTracking },
      { key: "financial-tracker", label: "Financial Tracker", icon: icoPayments, moduleKey: MODULE_KEYS.financialTracker },
    ],
  },
  {
    title: "Engagement",
    items: [{ key: "engagement", label: "Engagement", icon: icoEngagement, moduleKey: MODULE_KEYS.engagement }],
  },
  {
    title: "Account",
    items: [
      { key: "users", label: "User Management", icon: icoProfile, moduleKey: MODULE_KEYS.userManagement },
      { key: "detailer-management", label: "Detailer Management", icon: icoTracking, moduleKey: MODULE_KEYS.detailerManagement },
      { key: "profile", label: "Profile", icon: icoProfile, moduleKey: MODULE_KEYS.profile },
    ],
  },
];

function StaffMainContent({ session, onLogout }) {
  const navigate = useNavigate();
  const {
    loading,
    error,
    notifications,
    unreadNotificationCount,
    notificationPermission,
    requestNotificationPermission,
    markNotificationsRead,
  } = useAdminData();

  const [screen, setScreen] = useState(() => getDefaultModule(session));
  const [q, setQ] = useState("");
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const allowedScreenKeys = useMemo(() => {
    const keys = new Set();
    NAV_SECTIONS.forEach((section) => {
      section.items.forEach((item) => {
        if (canAccessModule(session, item.moduleKey)) keys.add(item.key);
      });
    });
    return keys;
  }, [session]);

  const goTo = (key) => {
    const nextKey = String(key || "").trim().toLowerCase();
    setScreen(allowedScreenKeys.has(nextKey) ? nextKey : getDefaultModule(session));
  };

  useEffect(() => {
    const auth = getStoredAuth();

    if (!auth || isAuthExpired(auth) || getUserType(auth.user) !== "staff") {
      if (auth && isAuthExpired(auth)) {
        clearAuthStorage({ message: "Session expired. Please log in again." });
      }
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!allowedScreenKeys.has(screen)) {
      setScreen(getDefaultModule(session));
    }
  }, [allowedScreenKeys, screen, session]);

  const confirmLogout = () => {
    clearAuthStorage();
    if (onLogout) onLogout();
    navigate("/login", { replace: true });
    return null;
  };

  const filteredNav = useMemo(() => {
    const query = q.trim().toLowerCase();
    const allowedSections = NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessModule(session, item.moduleKey)),
    })).filter((section) => section.items.length > 0);
    if (!query) return allowedSections;
    return allowedSections.map((section) => ({
      ...section,
      items: section.items.filter((item) => item.label.toLowerCase().includes(query)),
    })).filter((section) => section.items.length > 0);
  }, [q, session]);

  const header = useMemo(() => {
    if (screen === "bookings") return { title: "Bookings", sub: "Manage appointments and schedules." };
    if (screen === "tracking") return { title: "Service Tracking", sub: "Monitor job progress per vehicle." };
    if (screen === "payments") return { title: "Payments", sub: "Payments and billing records." };
    if (screen === "services") return { title: "Services", sub: "Service catalog and booking." };
    if (screen === "stock-monitoring") return { title: "Stock Monitoring", sub: "Track supplies and low-stock alerts." };
    if (screen === "engagement") return { title: "Engagement", sub: "Reviews, promos, and messaging." };
    if (screen === "analytics") return { title: "Analytics", sub: "Trends and performance insights." };
    if (screen === "audit") return { title: "Audit Logs", sub: "Track permitted operational actions." };
    if (screen === "financial-tracker") return { title: "Financial Tracker", sub: "Revenue, expenses, and commissions." };
    if (screen === "users") return { title: "User Management", sub: "Staff account visibility for your role." };
    if (screen === "detailer-management") return { title: "Detailer Management", sub: "Supervise detailer work and commission logs." };
    if (screen === "my-work") return { title: "My Work", sub: "Assigned work, warranty tasks, and commission history." };
    if (screen === "profile") return { title: "Profile", sub: "Account details and settings." };
    return { title: "Dashboard", sub: "Overview and quick stats." };
  }, [screen]);

  const userName = useMemo(() => {
    const first = session?.first || session?.firstName || "";
    const last = session?.last || session?.lastName || "";
    const full = `${first} ${last}`.trim();
    return full || session?.name || session?.email || "Staff";
  }, [session]);

  const userEmail = session?.email || "staff@allprotec.com";

  const avatarLetter = useMemo(() => {
    const base = String(session?.first || session?.firstName || session?.email || "S").trim();
    return base ? base[0].toUpperCase() : "S";
  }, [session]);

  return (
    <div className="staffShell">
      <div className="staffPage">
        <aside className="staffSide">
          <div className="staffBrand">
            <img className="staffLogo" src={logo} alt="APT" />
            <div>
              <div className="staffBrandName">ALL PRO-TEC</div>
              <div className="staffBrandSub">STAFF Portal</div>
            </div>
          </div>

          <div className="staffSearch">
            <img className="staffSearchIcon" src={icoSearch} alt="" />
            <input
              className="staffSearchInput"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Modules..."
            />
          </div>

          <div className="staffNav">
            {filteredNav.map((section) => (
              <div key={section.title} className="staffGroup">
                <div className="staffGroupTitle">{section.title}</div>
                <div className="staffGroupItems">
                  {section.items.map((item) => (
                    <div
                      key={item.key}
                      className={`staffItem ${screen === item.key ? "active" : ""}`}
                      onClick={() => goTo(item.key)}
                    >
                      <img className="staffNavIcon" src={item.icon} alt="" />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="staffSpacer" />

          <button className="staffLogout" onClick={() => setIsLogoutOpen(true)} type="button">
            <span className="staffLogoutArrow">⟵</span>
            <span>Logout</span>
          </button>
        </aside>

        <section className="staffMain">
          <div className="staffTopbar">
            <div className="staffTopLeft">
              <h1>{header.title}</h1>
              <p>{error || header.sub}</p>
            </div>

            <div className="staffTopRight">
              <div className="staffNotifAnchor">
                <button
                  className="staffPillBtn"
                  type="button"
                  onClick={() => {
                    setIsNotificationOpen((prev) => !prev);
                  }}
                >
                  {loading ? "Syncing..." : `Notifications${unreadNotificationCount ? ` (${unreadNotificationCount})` : ""}`}
                </button>
                {unreadNotificationCount > 0 && <span className="notifTriggerDot" aria-hidden="true" />}
                <NotificationCenter
                  open={isNotificationOpen}
                  onClose={() => setIsNotificationOpen(false)}
                  notifications={notifications}
                  unreadCount={unreadNotificationCount}
                  loading={loading}
                  permission={notificationPermission}
                  onRequestPermission={requestNotificationPermission}
                  onMarkRead={markNotificationsRead}
                />
              </div>

              <div className="staffUserPill">
                <div className="staffAvatar">{avatarLetter}</div>
                <div className="staffUserMeta">
                  <div className="staffUserName">{userName}</div>
                  <div className="staffUserEmail">{userEmail}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="staffContent">
            {screen === "dashboard" && <StaffDashboard session={session} goTo={goTo} />}
            {screen === "analytics" && <AdminAnalytics />}
            {screen === "audit" && <AdminAuditLogs />}
            {screen === "bookings" && <StaffBookings />}
            {screen === "tracking" && <StaffTracking session={session} />}
            {screen === "payments" && <StaffPayments session={session} />}
            {screen === "financial-tracker" && <AdminFinancialTracker />}
            {screen === "services" && <StaffServices />}
            {screen === "stock-monitoring" && <StaffStockMonitoring />}
            {screen === "engagement" && (canPerformAction(session, ACTION_KEYS.engagementManage) ? <AdminEngagement /> : <StaffEngagement />)}
            {screen === "users" && <AdminUsers />}
            {screen === "detailer-management" && <AdminDetailerManagement />}
            {screen === "my-work" && <StaffMyWork session={session} />}
            {screen === "profile" && <StaffProfile session={session} />}
          </div>
        </section>
      </div>

      <ConfirmModal
        open={isLogoutOpen}
        title="Confirm Logout"
        message="Do you want to log out of this account?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={confirmLogout}
        onClose={() => setIsLogoutOpen(false)}
      />
    </div>
  );
}

export default function StaffMain({ session, onLogout }) {
  const storedSession = useMemo(() => {
    const localUser = readStoredUser();
    if (session) return { ...localUser, ...session };
    return localUser;
  }, [session]);

  return (
    <AdminDataProvider session={storedSession}>
      <StaffMainContent session={storedSession} onLogout={onLogout} />
    </AdminDataProvider>
  );
}
