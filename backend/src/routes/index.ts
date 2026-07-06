import { Router, Application } from 'express'
import authRoutes from './auth'
import providerRoutes from './providers'
import sessionRoutes from './sessions'
import paymentRoutes from './payments'
import zkRoutes from './zk'

const router = Router()

// API versioning
router.use('/api/v1/auth', authRoutes)
router.use('/api/v1/providers', providerRoutes)
router.use('/api/v1/sessions', sessionRoutes)
router.use('/api/v1/payments', paymentRoutes)
router.use('/api/v1/zk', zkRoutes)

export function setupRoutes(app: Application): void {
  app.use(router)
}

export default router
