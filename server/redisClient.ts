import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';

dotenv.config();

function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function sanitizeRedisEnvValue(
  raw: string | undefined,
  possiblePrefixes: string[] = []
): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  let val = stripMatchingQuotes(raw);
  for (const prefix of possiblePrefixes) {
    const prefixEq = `${prefix}=`;
    if (val.startsWith(prefixEq)) {
      val = val.slice(prefixEq.length).trim();
      break;
    }
  }
  val = stripMatchingQuotes(val);
  return val || undefined;
}

export function normalizeRedisRestUrl(raw: string | undefined): string | undefined {
  const cleaned = sanitizeRedisEnvValue(raw, ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']);
  if (!cleaned) return undefined;
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return cleaned;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const rawUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const url = normalizeRedisRestUrl(rawUrl);
const token = sanitizeRedisEnvValue(
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  ['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN']
);

let redisClient: Redis | null = null;
const memoryStore = new Map<string, any>();

if (url && token) {
  try {
    redisClient = new Redis({
      url,
      token,
    });
    console.log('[GHAD AI KV] Vercel KV / Upstash Redis connected successfully.');
  } catch (err) {
    console.warn('[GHAD AI KV] Failed to initialize Upstash Redis client, falling back to memory store:', err);
  }
} else if (rawUrl) {
  console.warn('[GHAD AI KV] Invalid Redis REST URL format (expected https://...). Falling back to memory store.');
} else {
  console.log('[GHAD AI KV] Redis environment variables not found. Using in-memory fallback store.');
}

function isWrongTypeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return msg.includes('WRONGTYPE');
}

async function migrateWrongTypeToList(client: Redis, key: string): Promise<void> {
  let existingItems: any[] = [];
  try {
    const rawVal = await client.get(key);
    if (Array.isArray(rawVal)) {
      existingItems = rawVal;
    } else if (typeof rawVal === 'string') {
      try {
        const parsed = JSON.parse(rawVal);
        if (Array.isArray(parsed)) existingItems = parsed;
      } catch {
        // Ignore unparseable legacy string
      }
    }
  } catch {
    // Ignore read failure prior to key reset
  }
  await client.del(key);
  if (existingItems.length > 0) {
    await client.rpush(key, ...existingItems.slice(0, 200));
  }
}

export const kv = {
  async get(key: string): Promise<any> {
    if (redisClient) {
      try {
        return await redisClient.get(key);
      } catch (err) {
        console.warn(`[GHAD AI KV] GET error for key ${key}:`, err);
      }
    }
    return memoryStore.get(key) ?? null;
  },

  async set(key: string, value: any): Promise<any> {
    if (redisClient) {
      try {
        return await redisClient.set(key, value);
      } catch (err) {
        console.warn(`[GHAD AI KV] SET error for key ${key}:`, err);
      }
    }
    memoryStore.set(key, value);
    return 'OK';
  },

  async lpush(key: string, value: any): Promise<number> {
    if (redisClient) {
      try {
        return await redisClient.lpush(key, value);
      } catch (err) {
        if (isWrongTypeError(err)) {
          try {
            await migrateWrongTypeToList(redisClient, key);
            return await redisClient.lpush(key, value);
          } catch (retryErr) {
            console.warn(`[GHAD AI KV] LPUSH recovery error for key ${key}:`, retryErr);
          }
        } else {
          console.warn(`[GHAD AI KV] LPUSH error for key ${key}:`, err);
        }
      }
    }
    const list = memoryStore.get(key) || [];
    if (!Array.isArray(list)) {
      memoryStore.set(key, [value]);
      return 1;
    }
    list.unshift(value);
    memoryStore.set(key, list);
    return list.length;
  },

  async lrange(key: string, start: number, stop: number): Promise<any[]> {
    if (redisClient) {
      try {
        return await redisClient.lrange(key, start, stop);
      } catch (err) {
        if (isWrongTypeError(err)) {
          try {
            await migrateWrongTypeToList(redisClient, key);
            return await redisClient.lrange(key, start, stop);
          } catch (retryErr) {
            console.warn(`[GHAD AI KV] LRANGE recovery error for key ${key}:`, retryErr);
          }
        } else {
          console.warn(`[GHAD AI KV] LRANGE error for key ${key}:`, err);
        }
      }
    }
    const list = memoryStore.get(key) || [];
    if (!Array.isArray(list)) return [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  },

  async ltrim(key: string, start: number, stop: number): Promise<any> {
    if (redisClient) {
      try {
        return await redisClient.ltrim(key, start, stop);
      } catch (err) {
        if (isWrongTypeError(err)) {
          try {
            await migrateWrongTypeToList(redisClient, key);
            return await redisClient.ltrim(key, start, stop);
          } catch (retryErr) {
            console.warn(`[GHAD AI KV] LTRIM recovery error for key ${key}:`, retryErr);
          }
        } else {
          console.warn(`[GHAD AI KV] LTRIM error for key ${key}:`, err);
        }
      }
    }
    const list = memoryStore.get(key) || [];
    if (!Array.isArray(list)) {
      memoryStore.set(key, []);
      return 'OK';
    }
    const end = stop === -1 ? list.length : stop + 1;
    memoryStore.set(key, list.slice(start, end));
    return 'OK';
  },

  async lrem(key: string, count: number, value: any): Promise<number> {
    if (redisClient) {
      try {
        return await redisClient.lrem(key, count, value);
      } catch (err) {
        if (isWrongTypeError(err)) {
          try {
            await migrateWrongTypeToList(redisClient, key);
            return await redisClient.lrem(key, count, value);
          } catch (retryErr) {
            console.warn(`[GHAD AI KV] LREM recovery error for key ${key}:`, retryErr);
          }
        } else {
          console.warn(`[GHAD AI KV] LREM error for key ${key}:`, err);
        }
      }
    }
    const list = memoryStore.get(key) || [];
    if (!Array.isArray(list)) return 0;
    let removed = 0;
    const nextList = list.filter((item) => {
      if (removed < Math.abs(count) || count === 0) {
        if (JSON.stringify(item) === JSON.stringify(value)) {
          removed++;
          return false;
        }
      }
      return true;
    });
    memoryStore.set(key, nextList);
    return removed;
  },

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    if (redisClient) {
      try {
        return await redisClient.hincrby(key, field, increment);
      } catch (err) {
        console.warn(`[GHAD AI KV] HINCRBY error for key ${key}, field ${field}:`, err);
      }
    }
    let hash = memoryStore.get(key) || {};
    if (typeof hash !== 'object') hash = {};
    const current = Number(hash[field]) || 0;
    hash[field] = current + increment;
    memoryStore.set(key, hash);
    return hash[field];
  },

  async hgetall(key: string): Promise<Record<string, any>> {
    if (redisClient) {
      try {
        return (await redisClient.hgetall(key)) || {};
      } catch (err) {
        console.warn(`[GHAD AI KV] HGETALL error for key ${key}:`, err);
      }
    }
    return memoryStore.get(key) || {};
  },
};
