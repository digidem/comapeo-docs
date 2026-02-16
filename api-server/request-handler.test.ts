import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRouteRequest, mockAudit } = vi.hoisted(() => ({
  mockRouteRequest: vi.fn(),
  mockAudit: {
    createEntry: vi.fn(() => ({ id: "audit-entry" })),
    logSuccess: vi.fn(),
    logFailure: vi.fn(),
    logAuthFailure: vi.fn(),
  },
}));

vi.mock("./router", () => ({
  routeRequest: mockRouteRequest,
}));

vi.mock("./audit", () => ({
  getAudit: () => mockAudit,
}));

import { handleRequest } from "./request-handler";

describe("request-handler CORS coverage", () => {
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

  beforeEach(() => {
    delete process.env.ALLOWED_ORIGINS;
    vi.clearAllMocks();
    mockAudit.createEntry.mockReturnValue({ id: "audit-entry" });
  });

  afterEach(() => {
    if (originalAllowedOrigins === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
    }
  });

  it("returns full CORS contract on internal 500 errors from routed handlers", async () => {
    mockRouteRequest.mockRejectedValueOnce(new Error("boom"));

    const req = new Request("http://localhost/health", {
      headers: { Origin: "https://example.com" },
    });

    const res = await handleRequest(req);

    expect(res.status).toBe(500);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, DELETE, OPTIONS"
    );
    expect(res.headers.get("access-control-allow-headers")).toBe(
      "Content-Type, Authorization"
    );
    expect(res.headers.get("vary")).toBeNull();
    expect(res.headers.get("x-request-id")).toMatch(/^req_/);
  });

  it("returns CORS headers when failures happen before route/auth processing", async () => {
    const invalidUrlRequest = {
      url: "not a valid URL",
      method: "GET",
      headers: new Headers({ Origin: "https://example.com" }),
    } as unknown as Request;

    const res = await handleRequest(invalidUrlRequest);

    expect(res.status).toBe(500);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, DELETE, OPTIONS"
    );
    expect(res.headers.get("access-control-allow-headers")).toBe(
      "Content-Type, Authorization"
    );
    expect(res.headers.get("vary")).toBeNull();
  });
});
