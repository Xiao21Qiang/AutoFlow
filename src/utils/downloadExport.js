const DEFAULT_API_BASE_URL = "http://localhost:4000";

function resolveApiBaseUrl() {
  const rawValue = String(process.env.REACT_APP_API_URL || "").trim();
  if (!rawValue) return process.env.NODE_ENV === "production" ? "" : DEFAULT_API_BASE_URL;
  const normalizedValue = /^https?:\/\//i.test(rawValue) ? rawValue : `http://${rawValue}`;
  try {
    return new URL(normalizedValue).toString().replace(/\/$/, "");
  } catch (_error) {
    return process.env.NODE_ENV === "production" ? "" : DEFAULT_API_BASE_URL;
  }
}

function buildRequestUrl(path) {
  const requestPath = String(path || "").trim();
  const normalizedPath = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  const base = resolveApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

function getStoredToken() {
  if (typeof window === "undefined" || !window.localStorage) return "";
  return localStorage.getItem("token") || "";
}

function getFilename(response, fallback) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/i) || disposition.match(/filename=([^;]+)/i);
  return (match?.[1] || fallback || "autoflow-report.pdf").replace(/[\\/]/g, "-");
}

export async function downloadAuthenticatedFile(path, fallbackFilename) {
  const token = getStoredToken();
  const response = await fetch(buildRequestUrl(path), {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let message = "Download failed.";
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (_error) {
      // Keep the generic message for non-JSON error responses.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = getFilename(response, fallbackFilename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function buildReportDownloadPath(reportType, format = "pdf", filters = {}) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  const query = params.toString();
  return `/api/admin/reports/${encodeURIComponent(reportType)}/${encodeURIComponent(format)}${query ? `?${query}` : ""}`;
}
