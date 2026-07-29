import { createRouter, rateLimit, quota, redaction } from "../src/index";
import type { RouteRequest, RouteResponse } from "../src/index";

async function main() {
  const router = createRouter({
    routes: [
      {
        pattern: "*",
        handler: async (req: RouteRequest): Promise<RouteResponse> => ({
          id: req.id,
          model: req.model,
          content: `Response to: ${req.messages[0]?.content ?? ""}`,
          usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
          finishReason: "stop"
        })
      }
    ],
    middleware: [
      rateLimit({ windowMs: 60_000, maxRequests: 10 }),
      quota({ budget: 500 }),
      redaction({
        patterns: [
          /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
          /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
        ]
      })
    ]
  });

  const res = await router.handle({
    id: "req-1",
    model: "gpt-4o",
    messages: [{ role: "user", content: "My email is test@example.com and card is 1234567890123456" }],
    userId: "user-1"
  });

  console.log("Response:", res.content);
  console.log("Usage:", res.usage);
}

main().catch(console.error);
