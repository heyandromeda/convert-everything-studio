// Builds a preview and points the stable preview hostname at it.
// Vercel CLI prints a URL in a terminal and a JSON object when an agent is detected.
import { execFileSync } from 'node:child_process'

const ALIAS = 'convert-everything-preview.vercel.app'

function run(args, { capture = false } = {}) {
  return execFileSync('vercel', args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
}

function deploymentUrl(output) {
  const text = output.trim()
  try {
    const parsed = JSON.parse(text)
    const url = parsed.deployment?.url || parsed.url
    if (typeof url === 'string' && url.length > 0) return url.startsWith('http') ? url : `https://${url}`
  } catch {
    // Terminal output is a URL, sometimes with a leading "Preview" line.
  }
  const match = text.match(/https:\/\/[^\s"]+\.vercel\.app/)
  if (match) return match[0]
  throw new Error('Could not read the preview deployment URL from the Vercel CLI output.')
}

run(['build', '--target', 'preview', '--yes'])
const url = deploymentUrl(run(['deploy', '--prebuilt', '--target', 'preview', '--yes'], { capture: true }))
run(['alias', 'set', url, ALIAS, '--scope', 'heyandromeda'])
console.log(`https://${ALIAS}`)
console.log(url)
