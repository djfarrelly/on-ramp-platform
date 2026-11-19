import type { Database } from './client'
import { lanes } from './schema'

// Retain the original lane IDs: real imports already reference these core records.
const laneDefinitions = [
  {
    slug: 'corporate-careers',
    name: 'Corporate Careers',
    tagline: 'Find work that takes you forward.',
    description:
      'Explore a career change, reconnect with the workforce, or take your experience in a new direction. Find organizations and programs to help you take that next step.',
  },
  {
    slug: 'entrepreneurship',
    name: 'Entrepreneurship',
    tagline: 'Turn your idea into your next chapter.',
    description:
      'From your first idea to your next stage of growth, discover guidance, practical tools and a community to help you build a business.',
  },
  {
    slug: 'startup-ecosystem',
    name: 'Startup Ecosystem',
    tagline: 'Build something bigger, together.',
    description:
      'Find founder communities, startup support and opportunities to connect. Explore the people and programs that help new ventures take shape.',
  },
  {
    slug: 'learning-development',
    name: 'Learning & Development',
    tagline: 'Open a door with a new skill.',
    description:
      'Make room for what’s next. Explore flexible learning, technical skills and professional development that fit your goals and your life.',
  },
] as const

export async function seedCore(db: Database) {
  await db
    .insert(lanes)
    .values(
      laneDefinitions.map((lane, i) => ({
        ...lane,
        id: `019a7e00-0000-7000-8000-${(i + 1).toString(16).padStart(12, '0')}`,
        sortOrder: i + 1,
      })),
    )
    .onConflictDoNothing()
}
