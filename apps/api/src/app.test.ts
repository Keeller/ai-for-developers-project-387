import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

describe('static delivery', () => {
  let staticRoot: string

  beforeAll(async () => {
    staticRoot = await mkdtemp(join(tmpdir(), 'calendar-static-'))
    await writeFile(
      join(staticRoot, 'index.html'),
      '<!doctype html><html><body>spa</body></html>',
    )
    await writeFile(join(staticRoot, 'robots.txt'), 'User-agent: *\nAllow: /\n')
  })

  afterAll(async () => {
    await rm(staticRoot, { recursive: true, force: true })
  })

  it('serves robots.txt as plain text instead of the SPA fallback', async () => {
    const app = buildApp({ staticRoot })

    await app.listen({ host: '127.0.0.1', port: 0 })

    try {
      const address = app.server.address()

      if (address === null || typeof address === 'string') {
        throw new Error('The test server did not expose a TCP port')
      }

      const response = await fetch(
        `http://127.0.0.1:${String(address.port)}/robots.txt`,
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/plain')

      const body = await response.text()

      expect(body).not.toContain('<')
      expect(body).toContain('User-agent: *')
      expect(body).toContain('Allow: /')
    } finally {
      await app.close()
    }
  })

  it('falls back to index.html for unknown non-API routes', async () => {
    const app = buildApp({ staticRoot })

    await app.listen({ host: '127.0.0.1', port: 0 })

    try {
      const address = app.server.address()

      if (address === null || typeof address === 'string') {
        throw new Error('The test server did not expose a TCP port')
      }

      const response = await fetch(
        `http://127.0.0.1:${String(address.port)}/some-page`,
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      await expect(response.text()).resolves.toContain('spa')
    } finally {
      await app.close()
    }
  })
})

describe('robots.txt source file', () => {
  it('ships plain-text robots.txt directives in apps/web', async () => {
    const filePath = fileURLToPath(
      new URL('../../web/public/robots.txt', import.meta.url),
    )
    const content = await readFile(filePath, 'utf8')

    expect(content).not.toContain('<')
    expect(content).toContain('User-agent:')
    expect(content).toContain('Allow:')
  })
})
