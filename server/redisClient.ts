import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

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
} else {
  console.log('[GHAD AI KV] Redis environment variables not found. Using in-memory fallback store.');
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
        console.warn(`[GHAD AI KV] LPUSH error for key ${key}:`, err);
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
        console.warn(`[GHAD AI KV] LRANGE error for key ${key}:`, err);
      }
    }
    const list = memoryStore.get(key) || [];
    if (!Array.isArray(list)) return [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  },

  async lrem(key: string, count: number, value: any): Promise<number> {
    if (redisClient) {
      try {
        return await redisClient.lrem(key, count, value);
      } catch (err) {
        console.warn(`[GHAD AI KV] LREM error for key ${key}:`, err);
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
