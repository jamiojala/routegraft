export interface RouteRequest {
  id: string;
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
  userId?: string;
  apiKey?: string;
}

export interface RouteResponse {
  id: string;
  model: string;
  content: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason?: string;
  metadata?: Record<string, unknown>;
}

export interface RouteChunk {
  id: string;
  delta: string;
  done: boolean;
}

export type RouteHandler = (req: RouteRequest) => Promise<RouteResponse>;
export type StreamHandler = (req: RouteRequest) => AsyncIterable<RouteChunk>;

export interface MiddlewareContext {
  request: RouteRequest;
  response: RouteResponse | undefined;
  error: Error | undefined;
  metadata: Record<string, unknown>;
}

export type NextFn = () => Promise<void>;

export interface Middleware {
  name: string;
  before?: (ctx: MiddlewareContext, next: NextFn) => Promise<void>;
  after?: (ctx: MiddlewareContext) => Promise<void>;
  error?: (ctx: MiddlewareContext) => Promise<void>;
}

export interface RouteRule {
  /** Pattern to match against model name (supports wildcards). */
  pattern: string;
  /** Handler for this route. */
  handler: RouteHandler;
  /** Optional streaming handler. */
  streamHandler?: StreamHandler;
}

export interface RouteGraftOptions {
  /** Route rules, evaluated in order. First match wins. */
  routes: RouteRule[];
  /** Middleware chain, executed in order. */
  middleware?: Middleware[];
  /** Default model if request doesn't specify one. */
  defaultModel?: string;
}

export class RouteError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = "RouteError";
  }
}
