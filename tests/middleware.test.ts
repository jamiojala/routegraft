import { describe, it, expect, vi } from "vitest";
import { createRouter, rateLimit, quota, redaction, logging, policy } from "../src/index";
import type { RouteRequest, RouteResponse } from "../src/types";

function mockHandler(model: string): (req: RouteRequest) => Promise<RouteResponse> {
  return async (req) => ({
    id: req.id,
    model,
    content: `Response from ${model}`,
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    finishReason: "stop"
  });
}

describe("RouteGraft routing", () => {
  it("routes to matching handler", async () => {
    const router = createRouter({
      routes: [
        { pattern: "gpt-4*", handler: mockHandler("gpt-4") },
        { pattern: "claude*", handler: mockHandler("claude") }
      ]
    });

    const req: RouteRequest = {
      id: "test-1",
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }]
    };

    const res = await router.handle(req);
    expect(res.model).toBe("gpt-4");
    expect(res.content).toContain("gpt-4");
  });

  it("routes to second pattern if first doesn't match", async () => {
    const router = createRouter({
      routes: [
        { pattern: "gpt-4*", handler: mockHandler("gpt-4") },
        { pattern: "claude*", handler: mockHandler("claude") }
      ]
    });

    const res = await router.handle({
      id: "test-2",
      model: "claude-3",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(res.model).toBe("claude");
  });

  it("throws for unmatched model", async () => {
    const router = createRouter({
      routes: [{ pattern: "gpt-4*", handler: mockHandler("gpt-4") }]
    });

    await expect(
      router.handle({ id: "t", model: "unknown", messages: [] })
    ).rejects.toThrow("No route found");
  });

  it("uses default model when not specified", async () => {
    const router = createRouter({
      routes: [{ pattern: "default", handler: mockHandler("default") }],
      defaultModel: "default"
    });

    const res = await router.handle({ id: "t", model: "", messages: [] });
    expect(res.model).toBe("default");
  });
});

describe("rateLimit middleware", () => {
  it("allows requests within limit", async () => {
    const router = createRouter({
      routes: [{ pattern: "*", handler: mockHandler("any") }],
      middleware: [rateLimit({ windowMs: 1000, maxRequests: 3 })]
    });

    for (let i = 0; i < 3; i++) {
      const res = await router.handle({
        id: `r${i}`,
        model: "any",
        messages: [],
        userId: "user-1"
      });
      expect(res.content).toBeDefined();
    }
  });

  it("blocks requests exceeding limit", async () => {
    const router = createRouter({
      routes: [{ pattern: "*", handler: mockHandler("any") }],
      middleware: [rateLimit({ windowMs: 1000, maxRequests: 2 })]
    });

    await router.handle({ id: "r1", model: "any", messages: [], userId: "u1" });
    await router.handle({ id: "r2", model: "any", messages: [], userId: "u1" });

    await expect(
      router.handle({ id: "r3", model: "any", messages: [], userId: "u1" })
    ).rejects.toThrow("Rate limit exceeded");
  });

  it("tracks limits per user", async () => {
    const router = createRouter({
      routes: [{ pattern: "*", handler: mockHandler("any") }],
      middleware: [rateLimit({ windowMs: 1000, maxRequests: 1 })]
    });

    await router.handle({ id: "r1", model: "any", messages: [], userId: "u1" });
    // Different user should not be affected
    const res = await router.handle({ id: "r2", model: "any", messages: [], userId: "u2" });
    expect(res.content).toBeDefined();
  });
});

describe("redaction middleware", () => {
  it("redacts sensitive patterns", async () => {
    const handler = vi.fn(async (req: RouteRequest) => ({
      id: req.id,
      model: "test",
      content: req.messages[0]?.content ?? "",
      finishReason: "stop"
    }));

    const router = createRouter({
      routes: [{ pattern: "*", handler }],
      middleware: [
        redaction({
          patterns: [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g],
          replacement: "[CARD]"
        })
      ]
    });

    const res = await router.handle({
      id: "r1",
      model: "test",
      messages: [{ role: "user", content: "My card is 1234 5678 9012 3456" }]
    });

    expect(res.content).toContain("[CARD]");
    expect(res.content).not.toContain("1234");
  });
});

describe("policy middleware", () => {
  it("allows approved requests", async () => {
    const router = createRouter({
      routes: [{ pattern: "*", handler: mockHandler("any") }],
      middleware: [
        policy({
          check: async () => ({ allowed: true })
        })
      ]
    });

    const res = await router.handle({ id: "r1", model: "any", messages: [] });
    expect(res.content).toBeDefined();
  });

  it("blocks denied requests", async () => {
    const router = createRouter({
      routes: [{ pattern: "*", handler: mockHandler("any") }],
      middleware: [
        policy({
          check: async () => ({ allowed: false, reason: "Blocked by policy" })
        })
      ]
    });

    await expect(
      router.handle({ id: "r1", model: "any", messages: [] })
    ).rejects.toThrow("Blocked by policy");
  });
});

describe("logging middleware", () => {
  it("logs request and response", async () => {
    const logs: string[] = [];
    const router = createRouter({
      routes: [{ pattern: "*", handler: mockHandler("any") }],
      middleware: [logging({ log: (msg) => logs.push(msg) })]
    });

    await router.handle({ id: "r1", model: "any", messages: [] });

    expect(logs.some((l) => l.includes("request"))).toBe(true);
    expect(logs.some((l) => l.includes("response"))).toBe(true);
  });
});

describe("quota middleware", () => {
  it("tracks token usage per user", async () => {
    const router = createRouter({
      routes: [{ pattern: "*", handler: mockHandler("any") }],
      middleware: [quota({ budget: 100 })]
    });

    // Each response uses 30 tokens
    await router.handle({ id: "r1", model: "any", messages: [], userId: "u1" });
    await router.handle({ id: "r2", model: "any", messages: [], userId: "u1" });
    await router.handle({ id: "r3", model: "any", messages: [], userId: "u1" });
    // 90 tokens used, next would be 120 > 100
    await expect(
      router.handle({ id: "r4", model: "any", messages: [], userId: "u1" })
    ).rejects.toThrow("quota");
  });
});
