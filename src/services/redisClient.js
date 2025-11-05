// services/redisClient.js
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('[Redis] Too many retries, giving up');
        return new Error('Redis reconnect failed');
      }
      return Math.min(retries * 100, 3000); // backoff strategy
    }
  }
});

redis.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

redis.on('ready', () => {
  console.log('[Redis] Ready for commands');
});

redis.on('error', (err) => {
  console.error('[Redis] Error:', err);
});

redis.on('end', () => {
  console.warn('[Redis] Connection closed');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await redis.quit();
  console.log('[Redis] Disconnected due to app termination');
  process.exit(0);
});

await redis.connect();

export default redis;
