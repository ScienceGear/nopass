import { Redis } from "ioredis";
import { env, isProduction } from "./env.js";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    client.on("error", (err) => {
      if (isProduction) console.error("[redis]", err.message);
    });
  }
  return client;
}

export async function pingRedis(): Promise<boolean> {
  try {
    await getRedis().ping();
    return true;
  } catch {
    return false;
  }
}
