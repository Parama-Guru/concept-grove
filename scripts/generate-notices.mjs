import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
const notices = new Map()
const missing = []

for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/') || entry.dev) continue
  const directory = join(root, path)
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  const files = (await readdir(directory)).filter((name) => /^(?:licen[cs]e|copying|ofl|notice)(?:\..+)?$/i.test(name)).sort()
  if (!files.length) {
    const upstream = join(root, 'third-party', manifest.name, 'LICENSE')
    try {
      const text = (await readFile(upstream, 'utf8')).replace(/\r\n/g, '\n').trim()
      const group = notices.get(text) ?? []
      group.push(`${manifest.name}@${manifest.version} — upstream LICENSE (vendored)`)
      notices.set(text, group)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      missing.push(manifest.name)
    }
  }
  for (const file of files) {
    const text = (await readFile(join(directory, file), 'utf8')).replace(/\r\n/g, '\n').trim()
    const group = notices.get(text) ?? []
    group.push(`${manifest.name}@${manifest.version} — ${file}`)
    notices.set(text, group)
  }
}

if (missing.length) throw new Error(`Missing license texts: ${missing.join(', ')}. Review attribution before building.`)

const ownLicense = await readFile(join(root, 'LICENSE'), 'utf8')
const sections = [...notices].map(([text, packages]) => `${packages.join('\n')}\n\n${text}`)
const output = `Concept Grove — license and third-party notices\n\nOriginal application and flashcards\n\n${ownLicense.trim()}\n\n${sections.join('\n\n' + '='.repeat(72) + '\n\n')}\n`
await writeFile(join(root, 'public', 'THIRD_PARTY_NOTICES.txt'), output, 'utf8')
console.log(`Bundled ${sections.length} license notices for runtime dependencies and fonts.`)