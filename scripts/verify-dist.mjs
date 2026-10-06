import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const root = resolve('dist')
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'))
if (manifest.manifest_version !== 3) throw new Error('Generated manifest is not Manifest V3.')
const expectedPermissions = ['activeTab', 'scripting', 'storage']
if (JSON.stringify(manifest.permissions) !== JSON.stringify(expectedPermissions)) throw new Error('Generated permissions differ from the required minimal set.')

const pending = [manifest.action?.default_popup, manifest.options_page, 'content.js'].filter(Boolean)
const checked = new Set()
while (pending.length) {
  const relative = pending.pop().replace(/^\//, '')
  if (checked.has(relative)) continue
  checked.add(relative)
  const absolute = join(root, relative)
  if (!(await stat(absolute)).isFile()) throw new Error(`Missing referenced output: ${relative}`)
  if (!/\.(?:html|js|css)$/.test(relative)) continue
  const contents = await readFile(absolute, 'utf8')
  if (/(?:src|href)=["']https?:\/\//i.test(contents)) throw new Error(`Remote executable reference found in ${relative}`)
  if (/@vite\/client|\/?src\//.test(contents)) throw new Error(`Development-server reference found in ${relative}`)
  for (const match of contents.matchAll(/(?:src|href)=["']([^"']+)["']|(?:from|import)\s*["']([^"']+)["']/g)) {
    const reference = match[1] ?? match[2]
    if (!reference || reference.startsWith('data:') || reference.startsWith('#')) continue
    const resolved = reference.startsWith('/') ? reference.slice(1) : join(dirname(relative), reference).replaceAll('\\', '/')
    pending.push(resolved)
  }
}

const allFiles = []
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else allFiles.push(path.slice(root.length + 1).replaceAll('\\', '/'))
  }
}
await walk(root)
console.log(`Verified Manifest V3 and ${checked.size} referenced files.`)
console.log(`dist/ is self-contained with ${allFiles.length} files: ${allFiles.join(', ')}`)
