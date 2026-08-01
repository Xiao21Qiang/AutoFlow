import { act, render, screen, waitFor } from "@testing-library/react";
import { AdminDataProvider, useAdminData } from "./context/AdminDataContext";
import { apiRequest } from "./services/api";
import { validateSpecialCredential } from "./utils/reauth";

jest.mock("./services/api", () => ({
  apiRequest: jest.fn(),
}));

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function buildPayload(overrides = {}) {
  return {
    bookings: [],
    services: [],
    stockMonitoring: [],
    payments: [],
    users: [],
    auditLogs: [],
    archivedAuditLogs: [],
    reviews: [],
    promos: [],
    quoteRequests: [],
    expenses: [],
    commissions: [],
    rewards: [],
    customerRewards: [],
    alerts: [],
    settings: { requiredDownPaymentAmount: 0 },
    financialReport: { totals: {}, payments: [], expenses: [], commissions: [] },
    summary: {},
    ...overrides,
  };
}

function Harness({ session, onContext }) {
  return (
    <AdminDataProvider session={session}>
      <ContextProbe onContext={onContext} />
    </AdminDataProvider>
  );
}

function ContextProbe({ onContext }) {
  const context = useAdminData();
  onContext(context);
  return (
    <div>
      <div data-testid="loading">{context.loading ? "loading" : "ready"}</div>
      <div data-testid="error">{context.error}</div>
      <div data-testid="serviceNames">{context.services.map((service) => service.name).join(",")}</div>
    </div>
  );
}

describe("AdminDataProvider bootstrap performance behavior", () => {
  let requests;
  let context;

  const session = {
    id: "USR-ADMIN",
    email: "admin@example.com",
    name: "Admin",
    userType: "Admin",
    role: "Admin",
  };

  beforeEach(() => {
    requests = [];
    context = null;
    localStorage.clear();
    localStorage.setItem("token", "token-a");
    apiRequest.mockImplementation((path, options) => {
      const deferred = createDeferred();
      requests.push({ path, options, ...deferred });
      return deferred.promise;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderAndResolveInitial(payload = buildPayload()) {
    render(<Harness session={session} onContext={(value) => { context = value; }} />);
    await waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => {
      requests[0].resolve(payload);
      await requests[0].promise;
    });
    requests = [];
    apiRequest.mockClear();
  }

  test("coalesces simultaneous refresh calls into one bootstrap request", async () => {
    await renderAndResolveInitial();

    let first;
    let second;
    act(() => {
      first = context.reload();
      second = context.reload();
    });

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith("/api/admin/bootstrap");

    await act(async () => {
      requests[0].resolve(buildPayload({ services: [{ id: "SVC-1", name: "Coating" }] }));
      await Promise.all([first, second]);
    });

    expect(screen.getByTestId("serviceNames")).toHaveTextContent("Coating");
  });

  test("starts a new bootstrap request after the previous refresh completes", async () => {
    await renderAndResolveInitial();

    let first;
    act(() => {
      first = context.reload();
    });
    await act(async () => {
      requests[0].resolve(buildPayload());
      await first;
    });

    requests = [];
    apiRequest.mockClear();

    act(() => {
      context.reload();
    });

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith("/api/admin/bootstrap");
  });

  test("does not let an old session bootstrap overwrite a newer session", async () => {
    const { rerender } = render(<Harness session={session} onContext={(value) => { context = value; }} />);
    await waitFor(() => expect(requests).toHaveLength(1));

    localStorage.setItem("token", "token-b");
    rerender(
      <Harness
        session={{ ...session, id: "USR-STAFF", email: "staff@example.com", userType: "Staff", role: "General Manager" }}
        onContext={(value) => { context = value; }}
      />
    );
    await waitFor(() => expect(requests).toHaveLength(2));

    await act(async () => {
      requests[0].resolve(buildPayload({ services: [{ id: "SVC-OLD", name: "Old Session" }] }));
      await requests[0].promise;
    });
    expect(screen.getByTestId("serviceNames")).not.toHaveTextContent("Old Session");

    await act(async () => {
      requests[1].resolve(buildPayload({ services: [{ id: "SVC-NEW", name: "New Session" }] }));
      await requests[1].promise;
    });
    expect(screen.getByTestId("serviceNames")).toHaveTextContent("New Session");
  });

  test("clears failed in-flight bootstrap state so retry can request again", async () => {
    render(<Harness session={session} onContext={(value) => { context = value; }} />);
    await waitFor(() => expect(requests).toHaveLength(1));

    await act(async () => {
      requests[0].reject(new Error("network down"));
      await requests[0].promise.catch(() => {});
    });

    expect(screen.getByTestId("error")).toHaveTextContent("network down");
    requests = [];
    apiRequest.mockClear();

    act(() => {
      context.reload();
    });

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith("/api/admin/bootstrap");
  });

  test("does not enter an infinite bootstrap loop after initial load", async () => {
    await renderAndResolveInitial();
    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.getByTestId("loading")).toHaveTextContent("ready");
  });

  test("service updates use the mutation response without a full bootstrap refresh", async () => {
    await renderAndResolveInitial({ services: [{ id: "SVC-1", name: "Old Service", enabled: true }] });

    apiRequest.mockImplementationOnce(async () => ({ id: "SVC-1", name: "New Service", enabled: false }));

    await act(async () => {
      await context.updateService("SVC-1", { name: "New Service" });
    });

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/admin/services/SVC-1",
      expect.objectContaining({ method: "PUT" })
    );
    expect(screen.getByTestId("serviceNames")).toHaveTextContent("New Service");
  });

  test("successful sensitive mutations perform at most one bootstrap synchronization", async () => {
    await renderAndResolveInitial({ payments: [{ id: "PAY-1", status: "Pending" }] });

    apiRequest
      .mockImplementationOnce(async () => ({ id: "PAY-1", status: "Paid" }))
      .mockImplementationOnce(async () => buildPayload({ payments: [{ id: "PAY-1", status: "Paid" }] }));

    await act(async () => {
      await context.updatePayment("PAY-1", { status: "Paid" });
    });

    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual([
      "/api/admin/payments/PAY-1",
      "/api/admin/bootstrap",
    ]);
  });
});

describe("security validation refresh behavior", () => {
  beforeEach(() => {
    apiRequest.mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("PIN validation does not request admin bootstrap", async () => {
    await validateSpecialCredential("pin", "123456", "admin", { userType: "Admin", role: "Admin", email: "admin@example.com" }, "service.status");

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/admin/security/validate",
      expect.objectContaining({ method: "POST" })
    );
    expect(apiRequest.mock.calls.some(([path]) => path === "/api/admin/bootstrap")).toBe(false);
  });
});
