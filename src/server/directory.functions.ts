import { createServerFn } from '@tanstack/react-start'
import { directoryPageInput, laneSlug, slugInput } from '../lib/contracts'

export const loadHome = createServerFn({ method: 'GET' }).handler(async () => {
  const { withWorkerDatabase, callDirectoryMethod } =
    await import('./directory-rpc')
  return withWorkerDatabase(async (db) => {
    const [lanes, programs, organizations] = await Promise.all([
      callDirectoryMethod(db, 'lanes.list', {}),
      callDirectoryMethod(db, 'directory.searchOpportunities', { limit: 4 }),
      callDirectoryMethod(db, 'directory.searchOrganizations', { limit: 4 }),
    ])
    return { lanes, programs, organizations }
  })
})

export const loadDirectory = createServerFn({ method: 'GET' })
  .validator(directoryPageInput)
  .handler(async ({ data }) => {
    const { withWorkerDatabase, callDirectoryMethod } =
      await import('./directory-rpc')
    return withWorkerDatabase(async (db) => {
      const filters = {
        query: data.q,
        lane: data.lane,
        region: data.region || undefined,
        limit: 12,
        offset: (data.page - 1) * 12,
      }
      const [lanes, programs, organizations] = await Promise.all([
        callDirectoryMethod(db, 'lanes.list', {}),
        callDirectoryMethod(db, 'directory.searchOpportunities', {
          ...filters,
          deliveryMode: data.format,
        }),
        callDirectoryMethod(db, 'directory.searchOrganizations', filters),
      ])
      return { lanes, programs, organizations }
    })
  })

export const loadOrganization = createServerFn({ method: 'GET' })
  .validator(slugInput)
  .handler(async ({ data }) => {
    const { withWorkerDatabase, callDirectoryMethod } =
      await import('./directory-rpc')
    const { notFound } = await import('@tanstack/react-router')
    try {
      return await withWorkerDatabase((db) =>
        callDirectoryMethod(db, 'directory.getOrganization', data),
      )
    } catch (e) {
      const { DirectoryNotFoundError } = await import('../services/directory')
      if (e instanceof DirectoryNotFoundError) throw notFound()
      throw e
    }
  })

export const loadOpportunity = createServerFn({ method: 'GET' })
  .validator(slugInput)
  .handler(async ({ data }) => {
    const { withWorkerDatabase, callDirectoryMethod } =
      await import('./directory-rpc')
    const { notFound } = await import('@tanstack/react-router')
    try {
      return await withWorkerDatabase((db) =>
        callDirectoryMethod(db, 'directory.getOpportunity', data),
      )
    } catch (e) {
      const { DirectoryNotFoundError } = await import('../services/directory')
      if (e instanceof DirectoryNotFoundError) throw notFound()
      throw e
    }
  })

export const loadLane = createServerFn({ method: 'GET' })
  .validator(laneSlug)
  .handler(async ({ data }) => {
    const { withWorkerDatabase, callDirectoryMethod } =
      await import('./directory-rpc')
    const { notFound } = await import('@tanstack/react-router')
    return withWorkerDatabase(async (db) => {
      const lanes = await callDirectoryMethod(db, 'lanes.list', {})
      const lane = lanes.find((l) => l.slug === data)
      if (!lane) throw notFound()
      const [programs, organizations] = await Promise.all([
        callDirectoryMethod(db, 'directory.searchOpportunities', {
          lane: data,
        }),
        callDirectoryMethod(db, 'directory.searchOrganizations', {
          lane: data,
        }),
      ])
      return { lane, programs, organizations }
    })
  })
