import "../../styles/css/staff/staffMainStyle.css";
import ConfirmModal from "../../components/common/ConfirmModal";
import NotificationCenter from "../../components/common/NotificationCenter";

import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { AdminDataProvider, useAdminData } from "../../context/AdminDataContext";
import StaffDashboard from "./StaffDashboard";
import StaffBookings from "./StaffBookings";
import StaffTracking from "./StaffTracking";
import StaffPayments from "./StaffPayments";
import StaffServices from "./StaffServices";
import StaffStockMonitoring from "./StaffStockMonitoring";
import StaffEngagement from "./StaffEngagement";
import StaffProfile from "./StaffProfile";

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

const getUserType = (user) => {
  const normalizedUserType = String(user?.userType || "").trim().toLowerCase();
  if (["admin", "staff", "customer"].includes(normalizedUserType)) {
    return normalizedUserType;
  }

  const normalizedRole = String(user?.role || "").trim().toLowerCase();
  if (["owner", "co-owner", "admin"].includes(normalizedRole)) return "admin";
  if (["mechanic", "inspector", "coordinator", "staff"].includes(normalizedRole)) return "staff";
  return "customer";
};

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch (_error) {
    localStorage.removeItem("user");
    return {};
  }
};

const NAV_SECTIONS = [
  {
    title: "Overview",
    items: [{ key: "dashboard", label: "Dashboard", icon: icoDashboard }],
  },
  {
    title: "Operations",
    items: [
      { key: "bookings", label: "Bookings", icon: icoBookings },
      { key: "services", label: "Services", icon: icoServices },
      { key: "tracking", label: "Service Tracking", icon: icoTracking },
      { key: "stock-monitoring", label: "Stock Monitoring", icon: icoStockMonitoring },
    ],
  },
  {
    title: "Finance",
    items: [{ key: "payments", label: "Payments", icon: icoPayments }],
  },
  {
    title: "Engagement",
    items: [{ key: "engagement", label: "Engagement", icon: icoEngagement }],
  },
  {
    title: "Account",
    items: [{ key: "profile", label: "Profile", icon: icoProfile }],
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

  const [screen, setScreen] = useState("dashboard");
  const [q, setQ] = useState("");
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const goTo = (key) => setScreen(String(key || "").trim().toLowerCase());

  useEffect(() => {
    const token = localStorage.getItem("token");
    const user = readStoredUser();

    if (!token || getUserType(user) !== "staff") {
      navigate("/login");
    }
  }, [navigate]);

  const confirmLogout = () => {
    if (onLogout) return onLogout();
    localStorage.clear();
    navigate("/login");
    return null;
  };

  const filteredNav = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return NAV_SECTIONS;
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => item.label.toLowerCase().includes(query)),
    })).filter((section) => section.items.length > 0);
  }, [q]);

  const header = useMemo(() => {
    if (screen === "bookings") return { title: "Bookings", sub: "Manage appointments and schedules." };
    if (screen === "tracking") return { title: "Service Tracking", sub: "Monitor job progress per vehicle." };
    if (screen === "payments") return { title: "Payments", sub: "Payments and billing records." };
    if (screen === "services") return { title: "Services", sub: "Service catalog and booking." };
    if (screen === "stock-monitoring") return { title: "Stock Monitoring", sub: "Track supplies and low-stock alerts." };
    if (screen === "engagement") return { title: "Engagement", sub: "Reviews, promos, and messaging." };
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
            {screen === "bookings" && <StaffBookings />}
            {screen === "tracking" && <StaffTracking session={session} />}
            {screen === "payments" && <StaffPayments session={session} />}
            {screen === "services" && <StaffServices />}
            {screen === "stock-monitoring" && <StaffStockMonitoring />}
            {screen === "engagement" && <StaffEngagement />}
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
