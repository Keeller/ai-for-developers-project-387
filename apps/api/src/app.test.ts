import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

describe('GET /api/health', () => {
  it('starts the application and responds over HTTP', async () => {
    const app = buildApp()

    await app.listen({ host: '127.0.0.1', port: 0 })

    try {
      const address = app.server.address()

      if (address === null || typeof address === 'string') {
        throw new Error('The test server did not expose a TCP port')
      }

      const response = await fetch(
        `http://127.0.0.1:${String(address.port)}/api/health`,
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        status: 'ok',
        service: 'calendar-api',
      })
    } finally {
      await app.close()
    }
  })
})

describe('generated contract routes', () => {
  it('registers owner routes and validates their request bodies', async () => {
    const app = buildApp()

    await app.listen({ host: '127.0.0.1', port: 0 })

    try {
      const address = app.server.address()

      if (address === null || typeof address === 'string') {
        throw new Error('The test server did not expose a TCP port')
      }

      const endpoint = `http://127.0.0.1:${String(address.port)}/api/manage/event-types`
      const invalidResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(invalidResponse.status).toBe(400)

      const validResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicId: 'discovery-call',
          name: 'Discovery call',
          durationMinutes: 30,
        }),
      })

      expect(validResponse.status).toBe(503)
      await expect(validResponse.json()).resolves.toEqual({
        code: 'internal_error',
        message: 'База данных временно недоступна.',
      })
    } finally {
      await app.close()
    }
  })
})

describe('static file serving', () => {
  it('serves robots.txt as plain text and keeps the SPA fallback', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'static-root-'))
    const robotsContent = 'User-agent: *\nAllow: /\n'
    const indexContent = '<!doctype html><html lang="ru"></html>\n'
    writeFileSync(join(staticRoot, 'robots.txt'), robotsContent)
    writeFileSync(join(staticRoot, 'index.html'), indexContent)

    const app = buildApp({ staticRoot })

    await app.listen({ host: '127.0.0.1', port: 0 })

    try {
      const address = app.server.address()

      if (address === null || typeof address === 'string') {
        throw new Error('The test server did not expose a TCP port')
      }

      const robotsResponse = await fetch(
        `http://127.0.0.1:${String(address.port)}/robots.txt`,
      )

      expect(robotsResponse.status).toBe(200)
      expect(robotsResponse.headers.get('content-type')).toMatch(/^text\/plain/)
      await expect(robotsResponse.text()).resolves.toBe(robotsContent)

      const fallbackResponse = await fetch(
        `http://127.0.0.1:${String(address.port)}/booking/discovery-call`,
      )

      expect(fallbackResponse.status).toBe(200)
      expect(fallbackResponse.headers.get('content-type')).toMatch(
        /^text\/html/,
      )
      await expect(fallbackResponse.text()).resolves.toBe(indexContent)
    } finally {
      await app.close()
      rmSync(staticRoot, { recursive: true, force: true })
    }
  })
})
