// OBS-02 / SEC-08: one JSON object per line with a fixed minimum shape (UTC timestamp,
// level, operation, request id, duration, safe status or error). Anything that could
// carry a secret is redacted by key name or by value shape before it is written, and
// errors are reduced to a safe name/code: messages and stacks can quote request data.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = {
  requestId?: string;
  durationMs?: number;
  status?: number | string;
  error?: unknown;
  [key: string]: unknown;
};

export const REDACTED = "[redacted]";

// Keys whose values are never logged, whatever they contain.
const SENSITIVE_KEY = /pass(word|wd)?|secret|token|cookie|authorization|api[-_]?key|credential|connection|database[-_]?url|session/i;
// Values that look like connection strings or bearer credentials, wherever they appear.
const SENSITIVE_VALUE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s@]+@\S+|\bbearer\s+\S+/gi;
const MAX_DEPTH = 5;

export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.replace(SENSITIVE_VALUE, REDACTED);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Date) return value.toISOString();
  const output: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(inner, depth + 1);
  }
  return output;
}

/** Name and, when present, a short string `code`; never the message or stack. */
export function safeError(error: unknown): { name: string; code?: string } {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && code.length <= 64 ? { name: error.name, code } : { name: error.name };
  }
  return { name: "UnknownError" };
}

type Sink = (line: string, level: LogLevel) => void;

const defaultSink: Sink = (line, level) => {
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
};

export function createLogger(options: { sink?: Sink; now?: () => Date } = {}) {
  const sink = options.sink ?? defaultSink;
  const now = options.now ?? (() => new Date());

  function write(level: LogLevel, operation: string, fields: LogFields = {}) {
    const { error, ...rest } = fields;
    const entry: Record<string, unknown> = {
      timestamp: now().toISOString(),
      level,
      operation,
      ...(redact(rest) as Record<string, unknown>),
    };
    if (error !== undefined) entry.error = safeError(error);
    sink(JSON.stringify(entry), level);
  }

  return {
    debug: (operation: string, fields?: LogFields) => write("debug", operation, fields),
    info: (operation: string, fields?: LogFields) => write("info", operation, fields),
    warn: (operation: string, fields?: LogFields) => write("warn", operation, fields),
    error: (operation: string, fields?: LogFields) => write("error", operation, fields),
  };
}

export const logger = createLogger();

/** The caller's `x-request-id` when it is a sane token, otherwise a fresh one. */
export function getRequestId(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  return incoming && /^[A-Za-z0-9._-]{8,100}$/.test(incoming) ? incoming : crypto.randomUUID();
}
