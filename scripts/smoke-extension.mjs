import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
let chromePath = ''
for (const candidate of chromeCandidates) {
  try { if ((await stat(candidate)).isFile()) { chromePath = candidate; break } } catch { /* try next */ }
}
if (!chromePath) throw new Error('Chrome or Edge was not found in a standard installation path.')

const fixtureRoot = resolve('fixtures')
const dist = resolve('dist')
await stat(join(dist, 'manifest.json'))
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1))
    const file = normalize(join(fixtureRoot, relative))
    if (!file.startsWith(fixtureRoot) || !(await stat(file)).isFile()) throw new Error('Not found')
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' })
    response.end(await readFile(file))
  } catch { response.writeHead(404); response.end('Not found') }
})
await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('Fixture server did not expose a TCP port.')

const profileDir = await mkdtemp(join(tmpdir(), 'my-form-autofill-smoke-'))
let browser
try {
  browser = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profileDir}`, '--remote-debugging-port=0',
    `--disable-extensions-except=${dist}`, `--load-extension=${dist}`,
    `http://127.0.0.1:${address.port}/`,
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })

  const debuggerUrl = await new Promise((resolveUrl, reject) => {
    let stderr = ''
    const timeout = setTimeout(() => reject(new Error(`Chrome DevTools endpoint did not start. ${stderr}`)), 15_000)
    browser.stderr.setEncoding('utf8')
    browser.stderr.on('data', (chunk) => {
      stderr += chunk
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) { clearTimeout(timeout); resolveUrl(match[1]) }
    })
    browser.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Chrome exited early with code ${code}. ${stderr}`)) })
  })
  const endpoint = new URL(debuggerUrl)
  const base = `http://${endpoint.host}`

  let extensionId = ''
  for (let attempt = 0; attempt < 40 && !extensionId; attempt++) {
    try {
      const preferences = JSON.parse(await readFile(join(profileDir, 'Default', 'Preferences'), 'utf8'))
      const settings = preferences.extensions?.settings ?? {}
      extensionId = Object.keys(settings).find((id) => normalize(settings[id]?.path ?? '') === normalize(dist)) ?? ''
    } catch { /* Chrome may still be writing preferences */ }
    if (!extensionId) await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  if (!extensionId) throw new Error('The unpacked extension did not appear in Chrome preferences.')

  async function openAndRead(url) {
    const target = await (await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json()
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolveOpen, reject) => { socket.onopen = resolveOpen; socket.onerror = reject })
    let id = 0
    const send = (method, params = {}) => new Promise((resolveMessage, reject) => {
      const messageId = ++id
      const timeout = setTimeout(() => reject(new Error(`CDP timed out: ${method}`)), 5_000)
      const listener = (event) => {
        const response = JSON.parse(event.data)
        if (response.id !== messageId) return
        socket.removeEventListener('message', listener); clearTimeout(timeout)
        response.error ? reject(new Error(response.error.message)) : resolveMessage(response.result)
      }
      socket.addEventListener('message', listener)
      socket.send(JSON.stringify({ id: messageId, method, params }))
    })
    await send('Runtime.enable')
    let text = ''
    for (let attempt = 0; attempt < 40 && !text; attempt++) {
      const result = await send('Runtime.evaluate', { expression: 'document.body?.innerText || ""', returnByValue: true })
      text = result.result?.value ?? ''
      if (!text) await new Promise((resolveWait) => setTimeout(resolveWait, 100))
    }
    socket.close()
    return text
  }

  const popupText = await openAndRead(`chrome-extension://${extensionId}/popup.html`)
  const optionsText = await openAndRead(`chrome-extension://${extensionId}/options.html`)
  const fixtureText = await openAndRead(`http://127.0.0.1:${address.port}/`)
  if (!popupText.includes('My Form Autofill') || !popupText.includes('Preview fields')) throw new Error('Popup did not render expected controls.')
  if (!optionsText.includes('Profiles') || !optionsText.includes('Website-specific mappings')) throw new Error('Options page did not render expected controls.')
  if (!fixtureText.includes('Autofill fixture')) throw new Error('Local fixture did not render.')
  console.log(`Chrome extension smoke test passed (${extensionId}).`)
  console.log('Popup, options page, and localhost fixture rendered from production artifacts.')
} finally {
  if (browser && !browser.killed) browser.kill()
  await new Promise((resolveClose) => server.close(resolveClose))
  await rm(profileDir, { recursive: true, force: true })
}
