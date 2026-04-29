const DEFAULT_API_BASE_URL = "http://localhost:4000";

function resolveApiBaseUrl() {
  const rawValue = String(process.env.REACT_APP_API_URL || "").trim();
  if (!rawValue) {
    return process.env.NODE_ENV === "production" ? "" : DEFAULT_API_BASE_URL;
  }

  const normalizedValue = /^https?:\/\//i.test(rawValue) ? rawValue : `http://${rawValue}`;

  try {
    return new URL(normalizedValue).toString().replace(/\/$/, "");
  } catch (_error) {
    return process.env.NODE_ENV === "production" ? "" : DEFAULT_API_BASE_URL;
  }
}

const API_BASE_URL = resolveApiBaseUrl();

function buildRequestUrl(path) {
  const requestPath = String(path || "").trim();

  if (!requestPath) {
    return API_BASE_URL;
  }

  if (/^https?:\/\//i.test(requestPath)) {
    return requestPath;
  }

  const normalizedPath = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;

  if (!API_BASE_URL) {
    return normalizedPath;
  }

  const normalizedBase = API_BASE_URL.replace(/\/+$/, "");
  return `${normalizedBase}${normalizedPath}`;
}

function appendCacheBust(url) {
  return `${url}${url.includes("?") ? "&" : "?"}_ts=${Date.now()}`;
}

function getStoredToken() {
  if (typeof window === "undefined" || !window.localStorage) return "";
  return localStorage.getItem("token") || "";
}

export async function apiRequest(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  let requestUrl = buildRequestUrl(path);

  if (method === "GET") {
    requestUrl = appendCacheBust(requestUrl);
  }
  let response;

  try {
    const token = getStoredToken();
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (token && !headers.Authorization && !headers.authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    response = await fetch(requestUrl, {
      cache: "no-store",
      ...options,
      headers,
    });
  } catch (error) {
    const target = API_BASE_URL || "the same-origin API";
    throw new Error(`Could not reach ${target}. ${error.message || ""}`.trim());
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined" && window.localStorage) {
      ["token", "user", "session", "currentUser", "authLoginAt", "authLastActivity"].forEach((key) => {
        localStorage.removeItem(key);
      });
    }
    throw new Error(data.message || "Request failed");
  }

  return data;
}
