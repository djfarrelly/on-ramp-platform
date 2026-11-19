import { createServerFn } from '@tanstack/react-start'
import { slugInput } from '../lib/contracts'

export const loadEvent = createServerFn({ method: 'GET' })
  .validator(slugInput)
  .handler(async ({ data }) => {
    const { withWorkerDatabase, callDirectoryMethod } =
      await import('./directory-rpc')
    const { notFound } = await import('@tanstack/react-router')
    try {
      return await withWorkerDatabase((db) =>
        callDirectoryMethod(db, 'directory.getEvent', data),
      )
    } catch (error) {
      const { DirectoryNotFoundError } = await import('../services/directory')
      if (error instanceof DirectoryNotFoundError) throw notFound()
      throw error
    }
  })
