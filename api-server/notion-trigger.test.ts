import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockHandleCreateJob } = vi.hoisted(() => ({
  mockHandleCreateJob: vi.fn(),
}));

vi.mock("./routes/jobs", () => ({
  handleCreateJob: mockHandleCreateJob,
}));

import { handleNotionTrigger } from "./routes/notion-trigger";

describe("notion-trigger route handler", () => {
  const originalNotionTriggerApiKey = process.env.NOTION_TRIGGER_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NOTION_TRIGGER_API_KEY;
  });

  afterEach(() => {
    if (originalNotionTriggerApiKey === undefined) {
      delete process.env.NOTION_TRIGGER_API_KEY;
      return;
    }
    process.env.NOTION_TRIGGER_API_KEY = originalNotionTriggerApiKey;
  });

  it("returns 500 when NOTION_TRIGGER_API_KEY is not configured", async () => {
    const req = new Request("http://localhost/notion-trigger", {
      method: "POST",
    });

    const res = await handleNotionTrigger(req, new URL(req.url), null, "req_1");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "NOTION_TRIGGER_API_KEY is not configured",
    });
    expect(mockHandleCreateJob).not.toHaveBeenCalled();
  });

  it("returns 403 when x-api-key header is missing", async () => {
    process.env.NOTION_TRIGGER_API_KEY = "test-notion-trigger-key";

    const req = new Request("http://localhost/notion-trigger", {
      method: "POST",
    });

    const res = await handleNotionTrigger(req, new URL(req.url), null, "req_2");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Forbidden: invalid x-api-key",
    });
    expect(mockHandleCreateJob).not.toHaveBeenCalled();
  });

  it("returns 403 when x-api-key does not match configured key", async () => {
    process.env.NOTION_TRIGGER_API_KEY = "test-notion-trigger-key";

    const req = new Request("http://localhost/notion-trigger", {
      method: "POST",
      headers: {
        "x-api-key": "wrong-key",
      },
    });

    const res = await handleNotionTrigger(req, new URL(req.url), null, "req_3");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Forbidden: invalid x-api-key",
    });
    expect(mockHandleCreateJob).not.toHaveBeenCalled();
  });

  it("forwards to handleCreateJob using fetch-ready payload on valid x-api-key", async () => {
    process.env.NOTION_TRIGGER_API_KEY = "test-notion-trigger-key";
    mockHandleCreateJob.mockResolvedValueOnce(
      new Response(JSON.stringify({ jobId: "job-123", status: "pending" }), {
        status: 202,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    const req = new Request("http://localhost/notion-trigger?foo=bar", {
      method: "POST",
      headers: {
        "x-api-key": "test-notion-trigger-key",
      },
    });

    const res = await handleNotionTrigger(
      req,
      new URL(req.url),
      "https://notion.so",
      "req_4"
    );

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: "job-123", status: "pending" });
    expect(mockHandleCreateJob).toHaveBeenCalledTimes(1);

    const [forwardedReq, forwardedUrl, requestOrigin, requestId] =
      mockHandleCreateJob.mock.calls[0] as [
        Request,
        URL,
        string | null,
        string,
      ];

    expect(forwardedReq.method).toBe("POST");
    expect(new URL(forwardedReq.url).pathname).toBe("/jobs");
    expect(forwardedReq.headers.get("content-type")).toContain(
      "application/json"
    );
    expect(await forwardedReq.json()).toEqual({ type: "fetch-ready" });

    expect(forwardedUrl.pathname).toBe("/jobs");
    expect(forwardedUrl.search).toBe("");
    expect(requestOrigin).toBe("https://notion.so");
    expect(requestId).toBe("req_4");
  });
});
