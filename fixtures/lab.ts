import { createServer } from 'node:http'
import type { RequestListener } from 'node:http'
import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { fixturePath } from '@reac/core'

const configurationFixture: RequestListener = (request, response) => {
  if (request.url !== fixturePath || request.method !== 'HEAD') {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  }).end()
}

export async function startFixture(handler = configurationFixture) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  return { port, close: () => new Promise<void>((resolve) => {
    server.close(() => resolve())
    server.closeAllConnections()
  }) }
}

