const DEFAULT_API_BASE_URL = "http://localhost:4000";

function resolveApiBaseUrl() {
  const rawValue = String(process.env.REACT_APP_API_URL || DEFAULT_API_BASE_URL).trim();
  const normalizedValue = /^https?:\/\//i.test(rawValue) ? rawValue : `http://${rawValue}`;

  try {
    return new URL(normalizedValue).toString().replace(/\/$/, "");
  } catch (_error) {
    return DEFAULT_API_BASE_URL;
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

  const normalizedBase = API_BASE_URL.replace(/\/+$/, "");
  const normalizedPath = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;

  return `${normalizedBase}${normalizedPath}`;
}

function appendCacheBust(url) {
  return `${url}${url.includes("?") ? "&" : "?"}_ts=${Date.now()}`;
}

export async function apiRequest(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  let requestUrl = buildRequestUrl(path);

  if (method === "GET") {
    requestUrl = appendCacheBust(requestUrl);
  }
  let response;

  try {
    response = await fetch(requestUrl, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    throw new Error(`Could not reach the API at ${API_BASE_URL}. ${error.message || ""}`.trim());
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}
