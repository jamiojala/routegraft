# RouteGraft Quick Start

## Install

```bash
pnpm add @jamiojala/routegraft
```

## Define Routes

```ts
import { createRouter } from "@jamiojala/routegraft";

const router = createRouter({
  routes: [
    { pattern: "gpt-4*", handler: gpt4Handler },
    { pattern: "claude*", handler: claudeHandler },
    { pattern: "*", handler: defaultHandler }
  ]
});

const res = await router.handle({
  id: "req-1",
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }]
});
```

## Middleware

```ts
import { createRouter, rateLimit, quota, redaction, logging } from "@jamiojala/routegraft";

const router = createRouter({
  routes: [...],
  middleware: [
    rateLimit({ windowMs: 60_000, maxRequests: 100 }),
    quota({ budget: 1_000_000 }),
    redaction({ patterns: [/email_pattern/, /card_pattern/] }),
    logging({})
  ]
});
```

## Policy Hooks

```ts
import { policy } from "@jamiojala/routegraft";

policy({
  check: async (req) => {
    if (req.messages.some(m => m.content.includes("forbidden"))) {
      return { allowed: false, reason: "Forbidden content" };
    }
    return { allowed: true };
  }
})
```

## Streaming

```ts
for await (const chunk of router.stream(req)) {
  if (!chunk.done) {
    process.stdout.write(chunk.delta);
  }
}
```
