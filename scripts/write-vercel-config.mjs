// Regenerates the root vercel.json from security-headers.mjs. Run after changing the CSP.
import { writeFileSync } from 'node:fs'
import { vercelConfig } from '../security-headers.mjs'

writeFileSync(new URL('../vercel.json', import.meta.url), JSON.stringify(vercelConfig(), null, 2) + '\n')
console.log('vercel.json written')
