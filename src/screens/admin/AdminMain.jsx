import "../../styles/css/admin/adminMainStyle.css";
import ConfirmModal from "../../components/common/ConfirmModal";
import NotificationCenter from "../../components/common/NotificationCenter";

import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { AdminDataProvider, useAdminData } from "../../context/AdminDataContext";
import { clearAuthStorage, getStoredAuth, getUserType, isAuthExpired, readStoredUser } from "../../utils/auth";
import AdminDashboard from "./AdminDashboard";
import AdminBookings from "./AdminBookings";
import AdminServices from "./AdminServices";
import AdminStockMonitoring from "./AdminStockMonitoring";
import AdminTracking from "./AdminTracking";
import AdminPayments from "./AdminPayments";
import AdminFinancialTracker from "./AdminFinancialTracker";
import AdminAnalytics from "./AdminAnalytics";
import AdminEngagement from "./AdminEngagement";
import AdminUsers from "./AdminUsers";
import AdminAuditLogs from "./AdminAuditLogs";
import AdminProfile from "./AdminProfile";
import AdminDetailerManagement from "./AdminDetailerManagement";

import icoDashboard from "../../styles/icons/dashboard.png";
import icoBookings from "../../styles/icons/bookings.png";
import icoServices from "../../styles/icons/services.png";
import icoStockMonitoring from "../../styles/icons/stockMonitoring.png";
import icoTracking from "../../styles/icons/tracking.png";
import icoPayments from "../../styles/icons/payments.png";
import icoFinancialTracker from "../../styles/icons/payments.png";
import icoAnalytics from "../../styles/icons/analytics.png";
import icoEngagement from "../../styles/icons/engagement.png";
import icoUsers from "../../styles/icons/users.png";
import icoAudit from "../../styles/icons/audit.png";
import icoProfile from "../../styles/icons/profile.png";
import icoSearch from "../../styles/icons/search.png";
import logo from "../../styles/images/aptlogo.png";

const NAV_SECTIONS = [
  {
    title: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard", icon: icoDashboard },
      { key: "analytics", label: "Analytics", icon: icoAnalytics },
      { key: "audit", label: "Audit Logs", icon: icoAudit },
    ],
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
    items: [
      { key: "payments", label: "Payment Tracking", icon: icoPayments },
      { key: "financial-tracker", label: "Financial Tracker", icon: icoFinancialTracker },
    ],
  },
  {
    title: "Engagement",
    items: [{ key: "engagement", label: "Engagement", icon: icoEngagement }],
  },
  {
    title: "Account",
    items: [
      { key: "users", label: "User Management", icon: icoUsers },
      { key: "detailer-management", label: "Detailer Management", icon: icoTracking },
      { key: "profile", label: "Profile", icon: icoProfile },
    ],
  },
];

function AdminMainContent({ session }) {
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

  const [activeTab, setActiveTab] = useState("dashboard");
  const [pendingTabAction, setPendingTabAction] = useState(null);
  const [query, setQuery] = useState("");
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const goTo = (key, options = {}) => {
    setActiveTab(String(key || "").trim().toLowerCase());
    setPendingTabAction(options?.action || null);
  };

  useEffect(() => {
    const auth = getStoredAuth();
    if (!auth || isAuthExpired(auth) || getUserType(auth.user) !== "admin") {
      if (auth && isAuthExpired(auth)) {
        clearAuthStorage({ message: "Session expired. Please log in again." });
      }
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const confirmLogout = () => {
    clearAuthStorage();
    navigate("/login", { replace: true });
  };

  const filteredNav = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return NAV_SECTIONS;
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => item.label.toLowerCase().includes(q)),
    })).filter((section) => section.items.length > 0);
  }, [query]);

  const header = useMemo(() => {
    if (activeTab === "bookings") return { title: "Bookings", sub: "Manage appointments and schedules." };
    if (activeTab === "services") return { title: "Services", sub: "Service catalog and booking." };
    if (activeTab === "stock-monitoring") return { title: "Stock Monitoring", sub: "Track supplies and low-stock alerts." };
    if (activeTab === "tracking") return { title: "Service Tracking", sub: "Monitor job progress per vehicle." };
    if (activeTab === "payments") return { title: "Payments", sub: "Payments and billing records." };
    if (activeTab === "financial-tracker") return { title: "Financial Tracker", sub: "Revenue, expenses, and worker commissions." };
    if (activeTab === "analytics") return { title: "Analytics", sub: "Trends and performance insights." };
    if (activeTab === "engagement") return { title: "Engagement", sub: "Reviews, promos, and messaging." };
    if (activeTab === "users") return { title: "User Management", sub: "Manage admin, staff, and customer accounts." };
    if (activeTab === "detailer-management") return { title: "Detailer Management", sub: "Supervise detailer work, workload, and commissions." };
    if (activeTab === "audit") return { title: "Audit Logs", sub: "Track actions for accountability." };
    if (activeTab === "profile") return { title: "Profile", sub: "Account details and settings." };
    return { title: "Dashboard", sub: "Overview and quick stats." };
  }, [activeTab]);

  const initialLetter = useMemo(() => {
    const first = session?.first || session?.firstName || session?.name || "A";
    return String(first).trim().charAt(0).toUpperCase() || "A";
  }, [session]);

  const renderContent = () => {
    if (loading && activeTab === "dashboard") {
      return <div className="adminDashCard">Loading admin data...</div>;
    }
    if (activeTab === "dashboard") return <AdminDashboard session={session} goTo={goTo} />;
    if (activeTab === "bookings") {
      return (
        <AdminBookings
          initialAction={pendingTabAction}
          onActionHandled={() => setPendingTabAction(null)}
        />
      );
    }
    if (activeTab === "services") {
      return (
        <AdminServices
          initialAction={pendingTabAction}
          onActionHandled={() => setPendingTabAction(null)}
        />
      );
    }
    if (activeTab === "stock-monitoring") {
      return (
        <AdminStockMonitoring
          initialAction={pendingTabAction}
          onActionHandled={() => setPendingTabAction(null)}
        />
      );
    }
    if (activeTab === "tracking") return <AdminTracking />;
    if (activeTab === "payments") return <AdminPayments />;
    if (activeTab === "financial-tracker") return <AdminFinancialTracker />;
    if (activeTab === "analytics") return <AdminAnalytics />;
    if (activeTab === "engagement") return <AdminEngagement />;
    if (activeTab === "users") return <AdminUsers />;
    if (activeTab === "detailer-management") return <AdminDetailerManagement />;
    if (activeTab === "audit") return <AdminAuditLogs />;
    if (activeTab === "profile") return <AdminProfile session={session} />;
    return null;
  };

  return (
    <div className="adminShell">
      <div className="adminPage">
        <aside className="adminSide">
          <div className="adminBrand">
            <img className="adminLogo" src={logo} alt="APT" />
            <div>
              <div className="adminBrandName">ALL PRO-TEC</div>
              <div className="adminBrandSub">ADMIN Portal</div>
            </div>
          </div>

          <div className="sideSearch">
            <img className="sideSearchIcon" src={icoSearch} alt="" />
            <input
              className="sideSearchInput"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Modules..."
            />
          </div>

          <div className="sideNav">
            {filteredNav.map((section) => (
              <div key={section.title} className="sideGroup">
                <div className="sideGroupTitle">{section.title}</div>
                <div className="sideGroupItems">
                  {section.items.map((item) => (
                    <div
                      key={item.key}
                      className={`sideItem ${activeTab === item.key ? "active" : ""}`}
                      onClick={() => goTo(item.key)}
                    >
                      <img className="sideIcon" src={item.icon} alt="" />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="sideSpacer" />

          <button className="sideLogout" onClick={() => setIsLogoutOpen(true)} type="button">
            <span className="logoutArrow">⟵</span>
            <span>Logout</span>
          </button>
        </aside>

        <section className="adminMain">
          <div className="topbar">
            <div className="topLeft">
              <h1>{header.title}</h1>
              <p>{error || header.sub}</p>
            </div>

            <div className="topRight">
              <div className="notifAnchor">
                <button
                  className="pillBtn"
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

              <div className="userPill" onClick={() => goTo("profile")}>
                <div className="avatar">{initialLetter}</div>
                <div className="userMeta">
                  <div className="userName">{session?.name || "Admin"}</div>
                  <div className="userEmail">{session?.email || "admin@allprotec.com"}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="adminContent">{renderContent()}</div>
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

export default function AdminMain({ session }) {
  const storedSession = useMemo(() => {
    const localUser = readStoredUser();
    if (session) return { ...localUser, ...session };
    return localUser;
  }, [session]);

  return (
    <AdminDataProvider session={storedSession}>
      <AdminMainContent session={storedSession} />
    </AdminDataProvider>
  );
}
