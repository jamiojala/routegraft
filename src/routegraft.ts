import type {
  Middleware,
  MiddlewareContext,
  RouteChunk,
  RouteGraftOptions,
  RouteHandler,
  RouteRequest,
  RouteResponse,
  RouteRule
} from "./types";

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * RouteGraft is composable middleware for AI endpoints.
 * It routes requests to handlers based on model patterns, and
 * runs a middleware chain (rate limiting, quotas, redaction, policy)
 * before and after each request.
 */
export class RouteGraft {
  private readonly routes: RouteRule[];
  private readonly middleware: Middleware[];
  private readonly defaultModel: string | undefined;

  constructor(options: RouteGraftOptions) {
    this.routes = options.routes;
    this.middleware = options.middleware ?? [];
    this.defaultModel = options.defaultModel;
  }

  /**
   * Routes a request through the middleware chain and handler.
   */
  async handle(request: RouteRequest): Promise<RouteResponse> {
    const req: RouteRequest = {
      ...request,
      id: request.id ?? generateId(),
      model: request.model || this.defaultModel || "default"
    };

    const ctx: MiddlewareContext = {
      request: req,
      response: undefined,
      error: undefined,
      metadata: {}
    };

    const handler = this.findHandler(req.model);

    try {
      await this.runBefore(ctx, 0, async () => {
        ctx.response = await handler(ctx.request);
      });

      await this.runAfter(ctx);

      if (ctx.error) {
        throw ctx.error;
      }

      return ctx.response!;
    } catch (err) {
      ctx.error = err instanceof Error ? err : new Error(String(err));
      await this.runError(ctx);
      throw err;
    }
  }

  /**
   * Routes a streaming request. Middleware runs before the stream starts.
   * Returns an async iterable of chunks.
   */
  async *stream(request: RouteRequest): AsyncIterable<RouteChunk> {
    const req: RouteRequest = {
      ...request,
      id: request.id ?? generateId(),
      model: request.model ?? this.defaultModel ?? "default",
      stream: true
    };

    const ctx: MiddlewareContext = {
      request: req,
      response: undefined,
      error: undefined,
      metadata: {}
    };

    const rule = this.findRule(req.model);
    if (!rule) {
      throw new Error(`No route found for model: ${req.model}`);
    }

    if (!rule.streamHandler) {
      throw new Error(`Route for model ${req.model} does not support streaming`);
    }

    // Run before middleware
    let proceed = true;
    await this.runBefore(ctx, 0, async () => {
      // Middleware chain complete, proceed to stream
    }).catch(() => {
      proceed = false;
    });

    if (!proceed && ctx.error) {
      throw ctx.error;
    }

    yield* rule.streamHandler(req);
  }

  private findRule(model: string): RouteRule | undefined {
    for (const rule of this.routes) {
      if (matchPattern(rule.pattern, model)) {
        return rule;
      }
    }
    return undefined;
  }

  private findHandler(model: string): RouteHandler {
    const rule = this.findRule(model);
    if (!rule) {
      throw new Error(`No route found for model: ${model}`);
    }
    return rule.handler;
  }

  private async runBefore(
    ctx: MiddlewareContext,
    index: number,
    finalHandler: () => Promise<void>
  ): Promise<void> {
    if (index >= this.middleware.length) {
      await finalHandler();
      return;
    }

    const mw = this.middleware[index]!;
    if (mw.before) {
      await mw.before(ctx, async () => {
        await this.runBefore(ctx, index + 1, finalHandler);
      });
    } else {
      await this.runBefore(ctx, index + 1, finalHandler);
    }
  }

  private async runAfter(ctx: MiddlewareContext): Promise<void> {
    for (let i = this.middleware.length - 1; i >= 0; i--) {
      const mw = this.middleware[i]!;
      if (mw.after) {
        await mw.after(ctx);
      }
    }
  }

  private async runError(ctx: MiddlewareContext): Promise<void> {
    for (let i = this.middleware.length - 1; i >= 0; i--) {
      const mw = this.middleware[i]!;
      if (mw.error) {
        await mw.error(ctx);
      }
    }
  }
}

function matchPattern(pattern: string, model: string): boolean {
  // Convert wildcard pattern to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${regexStr}$`).test(model);
}

/** Convenience factory. */
export function createRouter(options: RouteGraftOptions): RouteGraft {
  return new RouteGraft(options);
}
