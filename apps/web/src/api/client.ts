import { client } from './generated/client.gen'

client.setConfig({ baseUrl: '/' })

export { client as apiClient }
export * from './generated/sdk.gen'
export type * from './generated/types.gen'
