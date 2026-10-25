// Regenera docs/matriz-permisos.md desde src/domain/rbac.js. Uso: npm run docs:permisos
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { generarMatrizMarkdown, verificarSegregacion } from '../src/domain/matrizPermisos.js'

const destino = fileURLToPath(new URL('../docs/matriz-permisos.md', import.meta.url))
writeFileSync(destino, generarMatrizMarkdown())
const fallas = verificarSegregacion().filter((v) => !v.cumple)
console.log(`docs/matriz-permisos.md actualizado · ${fallas.length === 0 ? 'segregación OK' : `${fallas.length} regla(s) NO se cumplen`}`)
if (fallas.length) { fallas.forEach((f) => console.error(`  ✗ ${f.regla}: ${f.detalle}`)); process.exit(1) }
