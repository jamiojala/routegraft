import type { Middleware, MiddlewareContext, NextFn, RouteRequest } from "./types";
import { RouteError } from "./types";

/**
 * Rate limiting middleware using a sliding window counter.
 * Tracks requests per userId (or "anonymous" if absent).
 */
export function rateLimit(options: {
  windowMs: number;
  maxRequests: number;
}): Middleware {
  const counts = new Map<string, { windowStart: number; count: number }>();

  return {
    name: "rate-limit",
    async before(ctx: MiddlewareContext, next: NextFn): Promise<void> {
      const userId = ctx.request.userId ?? "anonymous";
      const now = Date.now();
      const entry = counts.get(userId);

      if (!entry || now - entry.windowStart >= options.windowMs) {
        counts.set(userId, { windowStart: now, count: 1 });
      } else {
        entry.count++;
        if (entry.count > options.maxRequests) {
          throw new RouteError(
            "Rate limit exceeded",
            429,
            "RATE_LIMIT_EXCEEDED"
          );
        }
      }

      await next();
    }
  };
}

/**
 * Quota middleware with a per-user token budget.
 * Accumulates token usage and rejects when the budget is exhausted.
 */
export function quota(options: {
  budget: number;
  /** Reset interval in ms. 0 = never reset. */
  resetMs?: number;
}): Middleware {
  const usage = new Map<string, { tokens: number; lastReset: number }>();

  return {
    name: "quota",
    async before(ctx: MiddlewareContext, next: NextFn): Promise<void> {
      const userId = ctx.request.userId ?? "anonymous";
      const now = Date.now();
      const entry = usage.get(userId);

      if (!entry) {
        usage.set(userId, { tokens: 0, lastReset: now });
      } else if (options.resetMs && options.resetMs > 0 && now - entry.lastReset >= options.resetMs) {
        entry.tokens = 0;
        entry.lastReset = now;
      }

      await next();
    },
    async after(ctx: MiddlewareContext): Promise<void> {
      if (!ctx.response?.usage) return;
      const userId = ctx.request.userId ?? "anonymous";
      const entry = usage.get(userId);
      if (entry) {
        entry.tokens += ctx.response.usage.totalTokens;
        if (entry.tokens > options.budget) {
          throw new RouteError(
            "Token quota exceeded",
            429,
            "QUOTA_EXCEEDED"
          );
        }
      }
    }
  };
}

/**
 * Redacts sensitive patterns in request messages before forwarding.
 * Replaces matches with a configurable placeholder.
 */
export function redaction(options: {
  patterns: RegExp[];
  replacement?: string;
}): Middleware {
  const replacement = options.replacement ?? "[REDACTED]";

  return {
    name: "redaction",
    async before(ctx: MiddlewareContext, next: NextFn): Promise<void> {
      ctx.request = {
        ...ctx.request,
        messages: ctx.request.messages.map((msg) => ({
          ...msg,
          content: redactText(msg.content, options.patterns, replacement)
        }))
      };
      await next();
    }
  };
}

function redactText(text: string, patterns: RegExp[], replacement: string): string {
  let result = text;
  for (const pattern of patterns) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Logging middleware that records request/response metadata.
 */
export function logging(options: {
  log?: (message: string, data?: unknown) => void;
}): Middleware {
  const log = options.log ?? console.log;

  return {
    name: "logging",
    async before(ctx: MiddlewareContext, next: NextFn): Promise<void> {
      log(`[routegraft] request ${ctx.request.id}`, {
        model: ctx.request.model,
        userId: ctx.request.userId,
        messageCount: ctx.request.messages.length
      });
      await next();
    },
    async after(ctx: MiddlewareContext): Promise<void> {
      log(`[routegraft] response ${ctx.request.id}`, {
        model: ctx.response?.model,
        tokens: ctx.response?.usage?.totalTokens,
        finishReason: ctx.response?.finishReason
      });
    },
    async error(ctx: MiddlewareContext): Promise<void> {
      log(`[routegraft] error ${ctx.request.id}`, ctx.error?.message);
    }
  };
}

/**
 * Policy hook middleware. Calls a user-provided policy function
 * that can approve, modify, or reject a request.
 */
export function policy(options: {
  check: (req: RouteRequest) => Promise<{ allowed: boolean; reason?: string }>;
}): Middleware {
  return {
    name: "policy",
    async before(ctx: MiddlewareContext, next: NextFn): Promise<void> {
      const result = await options.check(ctx.request);
      if (!result.allowed) {
        throw new RouteError(
          result.reason ?? "Request denied by policy",
          403,
          "POLICY_DENIED"
        );
      }
      await next();
    }
  };
}

/**
 * Timeout middleware. Aborts the request if it takes too long.
 */
export function timeout(options: { ms: number }): Middleware {
  return {
    name: "timeout",
    async before(ctx: MiddlewareContext, next: NextFn): Promise<void> {
      const timer = setTimeout(() => {
        ctx.error = new RouteError(
          `Request timed out after ${options.ms}ms`,
          504,
          "TIMEOUT"
        );
      }, options.ms);

      try {
        await next();
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
