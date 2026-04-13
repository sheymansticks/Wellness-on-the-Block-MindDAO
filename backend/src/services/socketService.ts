import { Server as SocketIOServer, Socket } from 'socket.io'
import { logger } from '@/utils/logger'
import { verifyToken } from '@/services/authService'

interface AuthenticatedSocket extends Socket {
  userId?: string
  role?: string
}

export function setupSocketHandlers(io: SocketIOServer): void {
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token
      if (!token) {
        return next(new Error('Authentication required'))
      }

      const decoded = await verifyToken(token)
      socket.userId = decoded.userId
      socket.role = decoded.role
      next()
    } catch (error) {
      logger.error('Socket authentication error:', error)
      next(new Error('Invalid authentication token'))
    }
  })

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`User ${socket.userId} connected via WebSocket`)

    // Join user-specific room
    socket.join(`user_${socket.userId}`)

    // Handle session-related events
    socket.on('join-session', (sessionId: string) => {
      socket.join(`session_${sessionId}`)
      logger.info(`User ${socket.userId} joined session ${sessionId}`)
    })

    socket.on('leave-session', (sessionId: string) => {
      socket.leave(`session_${sessionId}`)
      logger.info(`User ${socket.userId} left session ${sessionId}`)
    })

    socket.on('session-message', (data: { sessionId: string; message: any }) => {
      socket.to(`session_${data.sessionId}`).emit('session-message', {
        ...data,
        senderId: socket.userId,
        timestamp: new Date().toISOString()
      })
    })

    socket.on('typing', (data: { sessionId: string; isTyping: boolean }) => {
      socket.to(`session_${data.sessionId}`).emit('typing', {
        userId: socket.userId,
        isTyping: data.isTyping
      })
    })

    // Handle provider availability
    socket.on('update-availability', (isOnline: boolean) => {
      if (socket.role === 'PROVIDER') {
        socket.broadcast.emit('provider-status', {
          providerId: socket.userId,
          isOnline
        })
      }
    })

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`User ${socket.userId} disconnected`)
      if (socket.role === 'PROVIDER') {
        socket.broadcast.emit('provider-status', {
          providerId: socket.userId,
          isOnline: false
        })
      }
    })
  })
}

export { io }
