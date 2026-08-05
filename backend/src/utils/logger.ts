import { isProduction } from "../config/env.js";

type Level = "info" | "warn" | "error";

function write(level: Level, msg: string, meta?: unknown) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}${
    meta === undefined ? "" : ` ${typeof meta === "string" ? meta : safeJson(meta)}`
  }`;
  // console.error writes to stderr so it survives stdout pipes and isn't dropped.
  // In production we avoid console.log entirely and use stderr for everything.
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (!isProduction) {
    // eslint-disable-next-line no-console
    console.error(line);
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = {
  info: (msg: string, meta?: unknown) => write("info", msg, meta),
  warn: (msg: string, meta?: unknown) => write("warn", msg, meta),
  error: (msg: string, meta?: unknown) => write("error", msg, meta),
};
