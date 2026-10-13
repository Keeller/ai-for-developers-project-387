import { spawn, spawnSync } from 'node:child_process'

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgres://calendar:test@127.0.0.1:55433/calendar_booking_test'
const playwrightPort = process.env.PLAYWRIGHT_PORT ?? '3000'
const baseUrl = `http://127.0.0.1:${playwrightPort}`

export default async function globalSetup() {
  const server = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      PORT: playwrightPort,
    },
    stdio: 'ignore',
    windowsHide: true,
  })

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Test API exited with code ${server.exitCode}`)
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) break
    } catch {
      // The API is still starting.
    }

    if (attempt === 59) throw new Error('Test API did not become healthy')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  return () => {
    if (server.exitCode !== null) return

    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      return
    }

    server.kill('SIGTERM')
  }
}
