import { Request, Response, NextFunction, RequestHandler } from 'express'
import { logger } from '@/utils/logger'

export interface AppError extends Error {
  statusCode?: number
  isOperational?: boolean
  code?: string | number
  errors?: unknown
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let error = { ...err }
  error.message = err.message

  // Log error
  logger.error({
    error: error,
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
    },
  })

  // Mongoose bad ObjectId (kept for backward compat with any leftover code)
  if (err.name === 'CastError') {
    const message = 'Resource not found'
    error = { ...error, message, statusCode: 404 }
  }

  // Mongoose duplicate key (kept for backward compat)
  if (err.code === 11000) {
    const message = 'Duplicate field value entered'
    error = { ...error, message, statusCode: 400 }
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const raw = (err as { errors?: Record<string, { message?: string }> }).errors || {}
    const message = Object.values(raw)
      .map((v) => v?.message || '')
      .filter(Boolean)
      .join(', ')
    error = { ...error, message, statusCode: 400 }
  }

  // Prisma: map P-codes to HTTP statuses
  // Reference: https://www.prisma.io/docs/orm/reference/error-reference#error-codes
  if (err.name === 'PrismaClientKnownRequestError') {
    const code = err.code
    const field = (err as any)?.meta?.target
    if (code === 'P2002') {
      error = { ...error, message: `Duplicate field value${field ? `: ${String(field)}` : ''}`, statusCode: 409 }
    } else if (code === 'P2025') {
      error = { ...error, message: 'Resource not found', statusCode: 404 }
    } else if (code === 'P2003') {
      error = { ...error, message: 'Foreign key constraint failed', statusCode: 400 }
    } else if (code === 'P2000') {
      // Value too long for column
      error = { ...error, message: 'Value too long for column', statusCode: 400 }
    } else {
      error = { ...error, message: `Database error: ${code || 'unknown'}`, statusCode: 500 }
    }
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  })
}

type AsyncHandlerFn = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown> | void

export function asyncHandler(fn: AsyncHandlerFn): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
