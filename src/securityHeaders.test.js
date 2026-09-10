/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const ORIGINAL_ENV = { ...process.env };

function invokeApp(app, requestPath, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage();
    req.method = method;
    req.url = requestPath;
    req.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    req.push(null);

    const res = new http.ServerResponse(req);
    const chunks = [];

    res.write = (chunk, encoding, callback) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      if (typeof callback === "function") callback();
      return true;
    };
    res.end = (chunk, encoding, callback) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      if (typeof callback === "function") callback();
      resolve({
        status: res.statusCode,
        headers: res.getHeaders(),
        body: Buffer.concat(chunks).toString("utf8"),
      });
      return res;
    };
    app.handle(req, res, reject);
  });
}

function loadServerWithEnv(env) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, ...env };
  return require("../server/server");
}

function parseCsp(value) {
  return Object.fromEntries(
    String(value || "")
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => Boolean(name))
      .map(([name, ...sources]) => [name, sources])
  );
}

afterEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

describe("security headers", () => {
  test("sets security headers on API responses without production-only HSTS", async () => {
    const { app } = loadServerWithEnv({ NODE_ENV: "test" });

    const response = await invokeApp(app, "/api/health");

    expect(response.status).toBe(200);
    expect(response.headers["content-security-policy"]).toBeTruthy();
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["permissions-policy"]).toEqual(expect.stringContaining("camera=()"));
    expect(response.headers["permissions-policy"]).toEqual(expect.stringContaining("microphone=()"));
    expect(response.headers["permissions-policy"]).toEqual(expect.stringContaining("geolocation=()"));
    expect(response.headers["strict-transport-security"]).toBeUndefined();
  });

  test("sets all required headers on production React document responses", async () => {
    const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "autoflow-build-"));
    fs.writeFileSync(path.join(buildDir, "index.html"), "<!doctype html><html><body><div id=\"root\"></div></body></html>");

    try {
      const { app } = loadServerWithEnv({
        NODE_ENV: "production",
        AUTOFLOW_BUILD_DIR: buildDir,
      });

      const rootResponse = await invokeApp(app, "/");
      const fallbackResponse = await invokeApp(app, "/customer/dashboard");

      [rootResponse, fallbackResponse].forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.headers["strict-transport-security"]).toBe("max-age=31536000");
        expect(response.headers["content-security-policy"]).toBeTruthy();
        expect(response.headers["x-frame-options"]).toBe("DENY");
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
        expect(response.headers["permissions-policy"]).toEqual(expect.stringContaining("camera=()"));
      });
    } finally {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  });

  test("keeps CSP restrictive while allowing audited AutoFlow browser resources", () => {
    const { SECURITY_HEADER_VALUES } = loadServerWithEnv({ NODE_ENV: "test" });

    const csp = parseCsp(SECURITY_HEADER_VALUES.contentSecurityPolicy);

    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["frame-src"]).toEqual(["'none'"]);
    expect(csp["script-src"]).toContain("'self'");
    expect(csp["script-src"]).not.toContain("*");
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
    expect(csp["script-src"]).not.toContain("'unsafe-inline'");
    expect(csp["style-src"]).toEqual(["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]);
    expect(csp["font-src"]).toEqual(["'self'", "https://fonts.gstatic.com"]);
    expect(csp["img-src"]).toEqual(["'self'", "data:", "https://api.qrserver.com"]);
    expect(csp["connect-src"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
  });
});
