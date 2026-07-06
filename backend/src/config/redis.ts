import Redis from 'ioredis'
import { logger } from '@/utils/logger'

let redis: Redis

export async function connectRedis(): Promise<Redis> {
  try {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    })

    redis.on('connect', () => {
      logger.info('Redis connected successfully')
    })

    redis.on('error', (err) => {
      logger.error('Redis connection error:', err)
    })

    redis.on('close', () => {
      logger.info('Redis connection closed')
    })

    // Test connection
    await redis.ping()
    
    return redis
  } catch (error) {
    logger.error('Failed to connect to Redis:', error)
    throw error
  }
}

export function getRedisClient(): Redis {
  if (!redis) {
    throw new Error('Redis client not initialized. Call connectRedis() first.')
  }
  return redis
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit()
    logger.info('Redis disconnected successfully')
  }
}
