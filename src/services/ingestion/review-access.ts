import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { users } from '../../db/schema'

export class ReviewAccessError extends Error {}
export class ReviewConflictError extends Error {}

export async function assertStaff(db: Database, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (
    !user ||
    !['admin', 'mt_staff'].includes(user.platformRole) ||
    user.status !== 'active'
  )
    throw new ReviewAccessError('An active staff reviewer is required')
  return user
}
