# RouteGraft API

## createRouter(options)

Creates a RouteGraft instance.

### Options

- routes: RouteRule[] - Route rules with pattern matching.
- middleware?: Middleware[] - Middleware chain.
- defaultModel?: string - Fallback model.

## router.handle(request)

Routes a request through middleware and handler. Returns RouteResponse.

## router.stream(request)

Routes a streaming request. Returns AsyncIterable<RouteChunk>.

## RouteRule

- pattern: string - Wildcard pattern (e.g. "gpt-4*").
- handler: (req) => Promise<RouteResponse>
- streamHandler?: (req) => AsyncIterable<RouteChunk>

## Middleware

Each middleware can define before, after, and error hooks:

```ts
interface Middleware {
  name: string;
  before?: (ctx, next) => Promise<void>;
  after?: (ctx) => Promise<void>;
  error?: (ctx) => Promise<void>;
}
```

## Built-in Middleware

- rateLimit({ windowMs, maxRequests }) - Per-user sliding window.
- quota({ budget, resetMs? }) - Per-user token budget.
- redaction({ patterns, replacement? }) - Pattern redaction in messages.
- logging({ log? }) - Request/response logging.
- policy({ check }) - Custom policy approval.
- timeout({ ms }) - Request timeout.

## RouteError

Thrown with status and code for HTTP-like error handling.
