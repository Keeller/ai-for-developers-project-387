import { defineConfig } from '@hey-api/openapi-ts'

const input = './generated/openapi.yaml'

export default defineConfig([
  {
    input,
    output: {
      path: '../../apps/web/src/api/generated',
    },
    plugins: [
      '@hey-api/typescript',
      '@hey-api/client-fetch',
      {
        name: '@hey-api/sdk',
        operations: {
          strategy: 'flat',
        },
      },
    ],
  },
  {
    input,
    output: {
      entryFile: false,
      path: '../../apps/api/src/generated',
    },
    plugins: ['@hey-api/typescript', 'fastify'],
  },
])
