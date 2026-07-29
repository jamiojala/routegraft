import { createRouter, logging } from "../src/index";
import type { RouteRequest, RouteResponse } from "../src/index";

async function main() {
  const router = createRouter({
    routes: [
      {
        pattern: "gpt-4*",
        handler: async (req: RouteRequest): Promise<RouteResponse> => {
          return {
            id: req.id,
            model: "gpt-4",
            content: `GPT-4 says: ${req.messages[0]?.content ?? ""}`,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            finishReason: "stop"
          };
        }
      },
      {
        pattern: "claude*",
        handler: async (req: RouteRequest): Promise<RouteResponse> => {
          return {
            id: req.id,
            model: "claude",
            content: `Claude says: ${req.messages[0]?.content ?? ""}`,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            finishReason: "stop"
          };
        }
      }
    ],
    middleware: [logging({})]
  });

  const res1 = await router.handle({
    id: "req-1",
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello!" }],
    userId: "user-1"
  });
  console.log("Response 1:", res1.content);

  const res2 = await router.handle({
    id: "req-2",
    model: "claude-3.5-sonnet",
    messages: [{ role: "user", content: "Hi!" }],
    userId: "user-1"
  });
  console.log("Response 2:", res2.content);
}

main().catch(console.error);
