import "../../styles/css/customer/customerMainStyle.css";
import ConfirmModal from "../../components/common/ConfirmModal";
import NotificationCenter from "../../components/common/NotificationCenter";

import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AdminDataProvider, useAdminData } from "../../context/AdminDataContext";

import CustomerDashboard from "./CustomerDashboard";
import CustomerBookings from "./CustomerBookings";
import CustomerTracking from "./CustomerTracking";
import CustomerServices from "./CustomerServices";
import CustomerPayments from "./CustomerPayments";
import CustomerEngagement from "./CustomerEngagement";
import CustomerProfile from "./CustomerProfile";

import icoDashboard from "../../styles/icons/dashboard.png";
import icoBookings from "../../styles/icons/bookings.png";
import icoServices from "../../styles/icons/services.png";
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

function CustomerMainContent({ session, onLogout }) {
  const navigate = useNavigate();
  const {
    currentUser,
    loading,
    error,
    notifications,
    unreadNotificationCount,
    notificationPermission,
    requestNotificationPermission,
    markNotificationsRead,
  } = useAdminData();
  const [screen, setScreen] = useState("dashboard");
  const [pendingScreenAction, setPendingScreenAction] = useState(null);
  const [q, setQ] = useState("");
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const user = readStoredUser();

    if (!token || getUserType(user) !== "customer") {
      navigate("/login");
    }
  }, [navigate]);

  const goTo = (key, options = {}) => {
    const route = String(key || "").trim().toLowerCase();
    setScreen(route);
    setPendingScreenAction(options?.action || null);
  };

  const confirmLogout = () => {
    if (onLogout) return onLogout();
    localStorage.clear();
    navigate("/login");
    return null;
  };

  const filteredNav = useMemo(() => {
    const needle = String(q || "").trim().toLowerCase();
    if (!needle) return NAV_SECTIONS;
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => String(item.label || "").toLowerCase().includes(needle)),
    })).filter((section) => section.items.length > 0);
  }, [q]);

  const header = useMemo(() => {
    if (screen === "bookings") return { title: "Bookings", sub: "View appointments and schedules." };
    if (screen === "tracking") return { title: "Service Tracking", sub: "Monitor job progress per vehicle." };
    if (screen === "services") return { title: "Services", sub: "Service catalog and booking." };
    if (screen === "payments") return { title: "Payments", sub: "Payments and billing records." };
    if (screen === "engagement") return { title: "Engagement", sub: "Reviews, promos, and messaging." };
    if (screen === "profile") return { title: "Profile", sub: "Account details and settings." };

    return { title: "Dashboard", sub: "Overview and quick stats." };
  }, [screen]);

  const initial = useMemo(() => {
    const email = String(currentUser?.email || session?.email || "C");
    return email.slice(0, 1).toUpperCase();
  }, [currentUser?.email, session?.email]);

  return (
    <div className="clientShell">
      <div className="clientPage">
        <aside className="clientSide">
          <div className="clientBrand">
            <img className="clientLogo" src={logo} alt="APT" />
            <div>
              <div className="clientBrandName">ALL PRO-TEC</div>
              <div className="clientBrandSub">CUSTOMER Portal</div>
            </div>
          </div>

          <div className="clientSearch">
            <img className="clientSearchIcon" src={icoSearch} alt="" />
            <input
              className="clientSearchInput"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Modules..."
            />
          </div>

          <div className="clientNav">
            {filteredNav.map((section) => (
              <div key={section.title} className="clientGroup">
                <div className="clientGroupTitle">{section.title}</div>
                <div className="clientGroupItems">
                  {section.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`clientItem ${screen === item.key ? "active" : ""}`}
                      onClick={() => goTo(item.key)}
                    >
                      <img className="clientNavIcon" src={item.icon} alt="" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="clientSpacer" />

          <button className="clientLogout" onClick={() => setIsLogoutOpen(true)} type="button">
            ⟵ Logout
          </button>
        </aside>

        <section className="clientMain">
          <div className="clientTopbar">
            <div className="clientTopLeft">
              <h1>{header.title}</h1>
              <p>{header.sub}</p>
              {loading && <p>Loading customer data...</p>}
              {!loading && error && <p>{error}</p>}
            </div>

            <div className="clientTopRight">
              <div className="clientNotifAnchor">
                <button
                  className="clientPillBtn"
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

              <button className="clientUserPill" type="button" onClick={() => goTo("profile")}>
                <div className="clientAvatar">{initial}</div>
                <div className="clientUserMeta">
                  <div className="clientUserName">{currentUser?.name || "Customer"}</div>
                  <div className="clientUserEmail">{currentUser?.email || session?.email || "customer@allprotec.com"}</div>
                </div>
              </button>
            </div>
          </div>

          <div className="clientContent">
            {screen === "dashboard" && <CustomerDashboard session={session} goTo={goTo} />}
            {screen === "bookings" && (
              <CustomerBookings
                initialAction={pendingScreenAction}
                onActionHandled={() => setPendingScreenAction(null)}
              />
            )}
            {screen === "tracking" && <CustomerTracking />}
            {screen === "services" && <CustomerServices />}
            {screen === "payments" && <CustomerPayments />}
            {screen === "engagement" && (
              <CustomerEngagement
                initialAction={pendingScreenAction}
                onActionHandled={() => setPendingScreenAction(null)}
              />
            )}
            {screen === "profile" && <CustomerProfile session={session} />}
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

export default function CustomerMain({ session, onLogout }) {
  const storedSession = useMemo(() => {
    const localUser = readStoredUser();
    if (session) return { ...localUser, ...session };
    return localUser;
  }, [session]);

  return (
    <AdminDataProvider session={storedSession}>
      <CustomerMainContent session={storedSession} onLogout={onLogout} />
    </AdminDataProvider>
  );
}
