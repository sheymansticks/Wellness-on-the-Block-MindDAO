import { Prisma, ProviderType } from '@prisma/client'
import { prisma } from '@/config/database'
import { logger } from '@/utils/logger'

export interface ListProvidersInput {
  type?: ProviderType
  isOnline?: boolean
  isVerified?: boolean
  specialty?: string
  language?: string
  page?: number
  limit?: number
}

export interface RegisterProviderInput {
  userId: string
  type: ProviderType
  bio: string
  specialties: string[]
  languages: string[]
  education?: string[]
  certifications?: string[]
  licenseNumber?: string
  licenseExpiry?: Date | string
  pricePerSession: number
  currency?: string
  sessionDuration?: number
  timezone?: string
  experience?: number
  availability?: Prisma.InputJsonValue
  consultationFee?: number
}

export interface UpdateProviderInput {
  bio?: string
  specialties?: string[]
  languages?: string[]
  education?: string[]
  certifications?: string[]
  licenseNumber?: string
  licenseExpiry?: Date | string
  pricePerSession?: number
  currency?: string
  sessionDuration?: number
  timezone?: string
  availability?: Prisma.InputJsonValue
  isOnline?: boolean
}

// --- Reads ----------------------------------------------------------------

export async function listProviders(input: ListProvidersInput) {
  const page = Math.max(1, input.page ?? 1)
  const limit = Math.min(100, Math.max(1, input.limit ?? 20))
  const skip = (page - 1) * limit

  const where: Prisma.ProviderWhereInput = {}
  if (input.type) where.type = input.type
  if (input.isOnline !== undefined) where.isOnline = input.isOnline
  if (input.isVerified !== undefined) where.isVerified = input.isVerified
  if (input.specialty) where.specialties = { has: input.specialty }
  if (input.language) where.languages = { has: input.language }

  const [items, total] = await Promise.all([
    prisma.provider.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ isVerified: 'desc' }, { rating: 'desc' }, { createdAt: 'desc' }],
      include: {
        user: {
          select: {
            id: true,
            publicKey: true,
            isVerified: true,
            identityCommitment: true,
            profile: { select: { firstName: true, lastName: true, avatar: true } },
          },
        },
      },
    }),
    prisma.provider.count({ where }),
  ])

  return {
    items: items.map((p) => sanitizeProvider(p)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

export async function searchProviders(query: string, page = 1, limit = 20) {
  if (!query || query.trim().length < 2) {
    const err: Error & { statusCode?: number } = new Error('Query must be at least 2 characters')
    err.statusCode = 400
    throw err
  }
  const skip = (page - 1) * limit
  const q = query.trim()

  // Postgres array-string overlap and free-text-ish search.
  const items = await prisma.provider.findMany({
    where: {
      OR: [
        { bio: { contains: q, mode: 'insensitive' } },
        { specialties: { has: q } },
        { languages: { has: q } },
        { user: { profile: { firstName: { contains: q, mode: 'insensitive' } } } },
        { user: { profile: { lastName: { contains: q, mode: 'insensitive' } } } },
      ],
    },
    skip,
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          publicKey: true,
          isVerified: true,
          profile: { select: { firstName: true, lastName: true, avatar: true } },
        },
      },
    },
  })
  return { items: items.map((p) => sanitizeProvider(p)), query: q }
}

export async function getProvider(providerId: string) {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    include: {
      user: {
        select: {
          id: true,
          publicKey: true,
          isVerified: true,
          identityCommitment: true,
          profile: true,
        },
      },
      services: { where: { isActive: true } },
      reviews: {
        take: 10,
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!provider) {
    const err: Error & { statusCode?: number } = new Error('Provider not found')
    err.statusCode = 404
    throw err
  }
  return sanitizeProvider(provider, true)
}

// --- Mutations ------------------------------------------------------------

export async function registerProvider(input: RegisterProviderInput) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } })
  if (!user) throw createHttpError(404, 'User not found')
  if (user.role !== 'PROVIDER') throw createHttpError(403, 'User is not a PROVIDER')

  const existing = await prisma.provider.findUnique({ where: { userId: input.userId } })
  if (existing) throw createHttpError(409, 'Provider profile already exists for this user')

  const provider = await prisma.provider.create({
    data: {
      userId: input.userId,
      type: input.type,
      bio: input.bio,
      specialties: input.specialties,
      languages: input.languages,
      education: input.education ?? [],
      certifications: input.certifications ?? [],
      licenseNumber: input.licenseNumber,
      licenseExpiry: parseDate(input.licenseExpiry),
      pricePerSession: input.pricePerSession,
      currency: input.currency ?? 'USD',
      sessionDuration: input.sessionDuration ?? 60,
      timezone: input.timezone ?? 'UTC',
      experience: input.experience ?? 0,
      availability: input.availability ?? Prisma.JsonNull,
      consultationFee: input.consultationFee,
    },
    include: { user: true },
  })
  logger.info(`Provider registered: ${provider.id} (user ${input.userId})`)
  return sanitizeProvider(provider)
}

export async function updateProvider(providerId: string, userId: string, input: UpdateProviderInput) {
  const provider = await prisma.provider.findUnique({ where: { id: providerId } })
  if (!provider) throw createHttpError(404, 'Provider not found')
  if (provider.userId !== userId) throw createHttpError(403, 'You can only update your own profile')

  const updated = await prisma.provider.update({
    where: { id: providerId },
    data: {
      bio: input.bio,
      specialties: input.specialties,
      languages: input.languages,
      education: input.education,
      certifications: input.certifications,
      licenseNumber: input.licenseNumber,
      licenseExpiry: parseDate(input.licenseExpiry),
      pricePerSession: input.pricePerSession,
      currency: input.currency,
      sessionDuration: input.sessionDuration,
      timezone: input.timezone,
      availability: input.availability,
      isOnline: input.isOnline,
    },
  })
  return sanitizeProvider(updated)
}

export async function verifyProvider(providerId: string, adminUserId: string) {
  // Caller-side admin guard is normally enforced by middleware; we double-check.
  const admin = await prisma.user.findUnique({ where: { id: adminUserId } })
  if (!admin || admin.role !== 'ADMIN') throw createHttpError(403, 'Only admins can verify providers')

  const provider = await prisma.provider.findUnique({ where: { id: providerId } })
  if (!provider) throw createHttpError(404, 'Provider not found')

  const updated = await prisma.provider.update({
    where: { id: providerId },
    data: { isVerified: true, verificationDate: new Date() },
  })

  await prisma.auditLog.create({
    data: {
      userId: adminUserId,
      action: 'PROVIDER_VERIFIED',
      resource: `providers:${providerId}`,
      details: { providerUserId: updated.userId },
    },
  })
  return sanitizeProvider(updated)
}

// --- Availability + reviews -----------------------------------------------

export async function getProviderSlots(providerId: string) {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, availability: true, timezone: true, sessionDuration: true },
  })
  if (!provider) throw createHttpError(404, 'Provider not found')
  return provider
}

export async function updateAvailability(
  providerId: string,
  userId: string,
  availability: Prisma.InputJsonValue,
) {
  const provider = await prisma.provider.findUnique({ where: { id: providerId } })
  if (!provider) throw createHttpError(404, 'Provider not found')
  if (provider.userId !== userId) throw createHttpError(403, 'You can only edit your own availability')

  await prisma.provider.update({
    where: { id: providerId },
    data: { availability },
  })
  return { ok: true }
}

export async function listReviews(providerId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit
  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where: { providerId, isVerified: true },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.review.count({ where: { providerId, isVerified: true } }),
  ])
  return {
    // Cast to a structural shape: when the Prisma client is generated the
    // row type will refine itself; until then this keeps strict mode quiet.
    items: items.map((r: {
      id: string
      sessionId: string
      rating: number
      comment: string | null
      anonymous: boolean
      createdAt: Date
    }) => ({
      id: r.id,
      sessionId: r.sessionId,
      rating: r.rating,
      comment: r.comment,
      anonymous: r.anonymous,
      createdAt: r.createdAt,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

// --- Helpers --------------------------------------------------------------

function sanitizeProvider(p: ProviderWithRelations, includeReviews = false) {
  const base = {
    id: p.id,
    type: p.type,
    isOnline: p.isOnline,
    isVerified: p.isVerified,
    verificationDate: p.verificationDate,
    rating: p.rating,
    totalSessions: p.totalSessions,
    experience: p.experience,
    bio: p.bio,
    specialties: p.specialties,
    languages: p.languages,
    education: p.education,
    certifications: p.certifications,
    licenseNumber: p.licenseNumber,
    licenseExpiry: p.licenseExpiry,
    pricePerSession: p.pricePerSession,
    currency: p.currency,
    sessionDuration: p.sessionDuration,
    consultationFee: p.consultationFee,
    timezone: p.timezone,
    createdAt: p.createdAt,
    user: p.user
      ? {
          id: p.user.id,
          publicKey: p.user.publicKey,
          isVerified: p.user.isVerified,
          identityCommitment: p.user.identityCommitment,
          profile: p.user.profile
            ? {
                firstName: p.user.profile.firstName,
                lastName: p.user.profile.lastName,
                avatar: p.user.profile.avatar ?? null,
              }
            : null,
        }
      : undefined,
  }
  if (includeReviews) {
    return { ...base, services: p.services, reviews: p.reviews }
  }
  return base
}

/**
 * Structural type that captures the `Provider` fields used by the
 * mapper below. Caller rows come from `prisma.provider.findMany`,
 * `prisma.provider.findUnique`, `prisma.provider.create`, and
 * `prisma.provider.update` with varying `include` clauses; `user`,
 * `services`, and `reviews` are therefore optional.
 */
interface ProviderWithRelations {
  id: string
  type: ProviderType
  isOnline: boolean
  isVerified: boolean
  verificationDate: Date | null
  rating: number | null
  totalSessions: number
  experience: number
  bio: string | null
  specialties: string[]
  languages: string[]
  education: string[]
  certifications: string[]
  licenseNumber: string | null
  licenseExpiry: Date | null
  pricePerSession: number
  currency: string
  sessionDuration: number
  consultationFee: number | null
  timezone: string
  createdAt: Date
  user?: {
    id: string
    publicKey: string
    isVerified: boolean
    identityCommitment?: string | null
    profile?: {
      firstName: string
      lastName: string
      avatar: string | null
    } | null
  } | null
  services?: Array<{ id: string }>
  reviews?: Array<{
    id: string
    sessionId: string
    rating: number
    comment: string | null
    anonymous: boolean
    createdAt: Date
  }>
}

function parseDate(input?: Date | string): Date | undefined {
  if (!input) return undefined
  if (input instanceof Date) return input
  const d = new Date(input)
  return Number.isFinite(d.getTime()) ? d : undefined
}

function createHttpError(status: number, message: string): Error {
  const err: Error & { statusCode?: number } = new Error(message)
  err.statusCode = status
  return err
}
