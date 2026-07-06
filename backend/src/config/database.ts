import { PrismaClient } from '@prisma/client'
import { logger } from '@/utils/logger'

declare global {
  // `var` (not `let`/`const`) is required here: only `var`
  // declarations inside `declare global` augment the
  // `typeof globalThis` type. ESLint's `no-var` rule doesn't
  // understand this TypeScript-ism, hence the per-line disable.
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

// Prevent multiple instances of Prisma Client in development
const prisma = globalThis.__prisma || new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
})

if (process.env.NODE_ENV === 'development') {
  globalThis.__prisma = prisma
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect()
    logger.info('Database connected successfully')
  } catch (error) {
    logger.error('Database connection failed:', error)
    throw error
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect()
    logger.info('Database disconnected successfully')
  } catch (error) {
    logger.error('Database disconnection failed:', error)
    throw error
  }
}

export { prisma }
export default prisma
