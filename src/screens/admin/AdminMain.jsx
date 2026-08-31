import "../../styles/css/admin/adminMainStyle.css";
import ConfirmModal from "../../components/common/ConfirmModal";
import NotificationCenter from "../../components/common/NotificationCenter";

import { useMemo, useState, useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

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

export const ADMIN_MODULE_ROUTES = [
  { key: "dashboard", path: "/admin", label: "Dashboard", title: "Dashboard", sub: "Overview and quick stats." },
  { key: "analytics", path: "/admin/analytics", label: "Analytics", title: "Analytics", sub: "Trends and performance insights." },
  { key: "audit", path: "/admin/audit-logs", label: "Audit Logs", title: "Audit Logs", sub: "Track actions for accountability." },
  { key: "bookings", path: "/admin/bookings", label: "Bookings", title: "Bookings", sub: "Manage appointments and schedules." },
  { key: "services", path: "/admin/services", label: "Services", title: "Services", sub: "Service catalog and booking." },
  { key: "tracking", path: "/admin/service-tracking", label: "Service Tracking", title: "Service Tracking", sub: "Monitor job progress per vehicle." },
  { key: "stock-monitoring", path: "/admin/stock-monitoring", label: "Stock Monitoring", title: "Stock Monitoring", sub: "Track supplies and low-stock alerts." },
  { key: "payments", path: "/admin/payment-tracking", label: "Payment Tracking", title: "Payments", sub: "Payments and billing records." },
  { key: "financial-tracker", path: "/admin/financial-tracker", label: "Financial Tracker", title: "Financial Tracker", sub: "Revenue, expenses, and worker commissions." },
  { key: "engagement", path: "/admin/engagement", label: "Engagement", title: "Engagement", sub: "Reviews, promos, and messaging." },
  { key: "users", path: "/admin/user-management", label: "User Management", title: "User Management", sub: "Manage admin, staff, and customer accounts." },
  { key: "detailer-management", path: "/admin/detailer-management", label: "Detailer Management", title: "Detailer Management", sub: "Supervise detailer work, workload, and commissions." },
  { key: "profile", path: "/admin/profile", label: "Profile", title: "Profile", sub: "Account details and settings." },
];

const ADMIN_ROUTE_BY_KEY = new Map(ADMIN_MODULE_ROUTES.map((route) => [route.key, route]));
const ADMIN_ROUTE_BY_PATH = new Map(ADMIN_MODULE_ROUTES.map((route) => [route.path, route]));
const LEGACY_ADMIN_ROUTE_REDIRECTS = new Map([
  ["/admin/dashboard", "/admin"],
]);

const NAV_SECTIONS = [
  {
    title: "Overview",
    items: [
      { key: "dashboard", icon: icoDashboard },
      { key: "analytics", icon: icoAnalytics },
      { key: "audit", icon: icoAudit },
    ],
  },
  {
    title: "Operations",
    items: [
      { key: "bookings", icon: icoBookings },
      { key: "services", icon: icoServices },
      { key: "tracking", icon: icoTracking },
      { key: "stock-monitoring", icon: icoStockMonitoring },
    ],
  },
  {
    title: "Finance",
    items: [
      { key: "payments", icon: icoPayments },
      { key: "financial-tracker", icon: icoFinancialTracker },
    ],
  },
  {
    title: "Engagement",
    items: [{ key: "engagement", icon: icoEngagement }],
  },
  {
    title: "Account",
    items: [
      { key: "users", icon: icoUsers },
      { key: "detailer-management", icon: icoTracking },
      { key: "profile", icon: icoProfile },
    ],
  },
];

function normalizeAdminPath(pathname) {
  const cleaned = String(pathname || "").replace(/\/+$/, "") || "/admin";
  return cleaned === "/admin" ? "/admin" : cleaned.toLowerCase();
}

function getAdminRouteForLocation(pathname) {
  return ADMIN_ROUTE_BY_PATH.get(normalizeAdminPath(pathname)) || null;
}

function getAdminPathForKey(key) {
  return ADMIN_ROUTE_BY_KEY.get(String(key || "").trim().toLowerCase())?.path || "/admin";
}

function AdminMainContent({ session }) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    loading,
    error,
    notifications,
    unreadNotificationCount,
    notificationPermission,
    requestNotificationPermission,
    markNotificationsRead,
  } = useAdminData();

  const normalizedPath = normalizeAdminPath(location.pathname);
  const legacyRedirectPath = LEGACY_ADMIN_ROUTE_REDIRECTS.get(normalizedPath);
  const activeRoute = getAdminRouteForLocation(normalizedPath);
  const activeTab = activeRoute?.key || "dashboard";

  const [pendingTabAction, setPendingTabAction] = useState(null);
  const [query, setQuery] = useState("");
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const goTo = (key, options = {}) => {
    setPendingTabAction(options?.action || null);
    navigate(getAdminPathForKey(key));
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
    const sections = NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        ...ADMIN_ROUTE_BY_KEY.get(item.key),
      })).filter((item) => item.path),
    }));
    if (!q) return sections;
    return sections.map((section) => ({
      ...section,
      items: section.items.filter((item) => item.label.toLowerCase().includes(q)),
    })).filter((section) => section.items.length > 0);
  }, [query]);

  const header = useMemo(() => {
    return activeRoute || ADMIN_ROUTE_BY_KEY.get("dashboard");
  }, [activeRoute]);

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

  if (legacyRedirectPath) {
    return <Navigate to={legacyRedirectPath} replace />;
  }

  if (!activeRoute) {
    return <Navigate to="/admin" replace />;
  }

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
