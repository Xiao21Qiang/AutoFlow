import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  clearAuthStorage,
  getDashboardRoute,
  getStoredAuth,
  getUserType,
  isAuthExpired,
  touchAuthActivity,
} from "../utils/auth";

const SESSION_EXPIRED_MESSAGE = "Session expired. Please log in again.";

export function PublicRoute({ children }) {
  const auth = getStoredAuth();

  if (auth && isAuthExpired(auth)) {
    clearAuthStorage({ message: SESSION_EXPIRED_MESSAGE });
    return children;
  }

  if (auth) {
    return <Navigate to={getDashboardRoute(auth.user)} replace />;
  }

  return children;
}

export function ProtectedRoute({ allowedRoles = [], children }) {
  const location = useLocation();
  const auth = getStoredAuth();

  if (!auth) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (isAuthExpired(auth)) {
    clearAuthStorage({ message: SESSION_EXPIRED_MESSAGE });
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const userType = getUserType(auth.user);
  if (allowedRoles.length > 0 && !allowedRoles.includes(userType)) {
    return <Navigate to={getDashboardRoute(auth.user)} replace />;
  }

  return children;
}

export function AuthSessionManager() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkSession = () => {
      const auth = getStoredAuth();
      if (!auth || !isAuthExpired(auth)) return;

      clearAuthStorage({ message: SESSION_EXPIRED_MESSAGE });
      if (location.pathname !== "/login") {
        navigate("/login", { replace: true });
      }
    };

    checkSession();
    const timerId = setInterval(checkSession, 30 * 1000);

    return () => clearInterval(timerId);
  }, [location.pathname, navigate]);

  useEffect(() => {
    const activityEvents = ["click", "keydown", "mousemove", "scroll", "touchstart"];
    const handleActivity = () => {
      const auth = getStoredAuth();
      if (!auth) return;
      if (isAuthExpired(auth)) {
        clearAuthStorage({ message: SESSION_EXPIRED_MESSAGE });
        if (location.pathname !== "/login") {
          navigate("/login", { replace: true });
        }
        return;
      }
      touchAuthActivity();
    };

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
    };
  }, [location.pathname, navigate]);

  return null;
}
