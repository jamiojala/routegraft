# RouteGraft

[![CI](https://img.shields.io/github/actions/workflow/status/jamiojala/routegraft/ci.yml?branch=main&label=CI)](https://github.com/jamiojala/routegraft/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40jamiojala%2Froutegraft)](https://www.npmjs.com/package/@jamiojala/routegraft)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](./LICENSE)

`@jamiojala/routegraft` is composable middleware for AI endpoints with streaming, quotas, redaction, and policy hooks.

It routes requests to handlers based on model patterns, and runs a middleware chain before and after each request. Built-in middleware for rate limiting, token quotas, PII redaction, logging, policy enforcement, and timeouts.

## Why RouteGraft

Every AI endpoint eventually needs the same cross-cutting concerns: rate limits, cost quotas, redaction, logging, and policy. RouteGraft gives you a composable middleware pipeline so you add them once and they run on every call.

- Wildcard model routing (e.g. `gpt-4*`, `claude*`)
- Before/after/error middleware hooks
- Rate limiting with per-user sliding windows
- Token quota tracking with reset intervals
- Pattern-based redaction for PII and secrets
- Custom policy hooks for request approval
- Request timeout enforcement
- Streaming support with async iterables
- Zero runtime dependencies

## Install

```bash
pnpm add @jamiojala/routegraft
```

## Quick Start

```ts
import { createRouter, rateLimit, logging } from "@jamiojala/routegraft";

const router = createRouter({
  routes: [
    { pattern: "gpt-4*", handler: gpt4Handler },
    { pattern: "*", handler: defaultHandler }
  ],
  middleware: [
    rateLimit({ windowMs: 60_000, maxRequests: 100 }),
    logging({})
  ]
});

const res = await router.handle({
  id: "req-1",
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
  userId: "user-1"
});
```

## Middleware

```ts
import { createRouter, rateLimit, quota, redaction, logging, policy } from "@jamiojala/routegraft";

const router = createRouter({
  routes: [...],
  middleware: [
    rateLimit({ windowMs: 60_000, maxRequests: 100 }),
    quota({ budget: 1_000_000, resetMs: 3_600_000 }),
    redaction({ patterns: [/card_pattern/g], replacement: "[REDACTED]" }),
    policy({
      check: async (req) => ({ allowed: true })
    }),
    logging({})
  ]
});
```

## Streaming

```ts
for await (const chunk of router.stream(req)) {
  if (!chunk.done) {
    process.stdout.write(chunk.delta);
  }
}
```

## Custom Middleware

```ts
const myMiddleware = {
  name: "my-middleware",
  async before(ctx, next) {
    // Modify request, check conditions, etc.
    await next();
  },
  async after(ctx) {
    // Inspect or modify response
  },
  async error(ctx) {
    // Handle errors
  }
};
```

## API

See [docs/api.md](./docs/api.md) for the full reference.

## Documentation

- [Quick Start](./docs/quickstart.md)
- [API Reference](./docs/api.md)

## Development

```bash
pnpm install
pnpm check
```

## Examples

- [Basic routing](./examples/basic.ts)
- [Quota and redaction](./examples/quota.ts)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
