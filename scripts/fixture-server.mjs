import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'

const root = resolve('fixtures')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1))
    const file = normalize(join(root, relative))
    if (!file.startsWith(root) || !(await stat(file)).isFile()) throw new Error('Not found')
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    response.end(await readFile(file))
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  }
})

server.listen(4173, '127.0.0.1', () => {
  console.log('Fixture form: http://127.0.0.1:4173')
})
