import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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

describe('static root serving', () => {
  it('serves a real /robots.txt instead of the SPA page', async () => {
    const staticDir = await mkdtemp(join(tmpdir(), 'calendar-static-'))
    const robots = 'User-agent: *\nAllow: /\n'

    await writeFile(join(staticDir, 'index.html'), '<!doctype html>')
    await writeFile(join(staticDir, 'robots.txt'), robots)

    const app = buildApp({ staticRoot: staticDir })

    await app.listen({ host: '127.0.0.1', port: 0 })

    try {
      const address = app.server.address()

      if (address === null || typeof address === 'string') {
        throw new Error('The test server did not expose a TCP port')
      }

      const origin = `http://127.0.0.1:${String(address.port)}`
      const robotsResponse = await fetch(`${origin}/robots.txt`)

      expect(robotsResponse.status).toBe(200)
      expect(robotsResponse.headers.get('content-type')).toContain('text/plain')

      const robotsBody = await robotsResponse.text()
      expect(robotsBody).toBe(robots)
      expect(robotsBody).not.toContain('<')

      const spaResponse = await fetch(`${origin}/booking/abc123`)

      expect(spaResponse.status).toBe(200)
      expect(spaResponse.headers.get('content-type')).toContain('text/html')
    } finally {
      await app.close()
      await rm(staticDir, { recursive: true, force: true })
    }
  })
})
