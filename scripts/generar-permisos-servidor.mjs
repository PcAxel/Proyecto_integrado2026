// Genera backend/erp/permisos_generados.py a partir de PERMISOS (src/domain/rbac.js): el servidor aplica
// exactamente la misma matriz que el frontend. Uso: npm run permisos:servidor
import { writeFileSync } from 'node:fs'
import { PERMISOS } from '../src/domain/rbac.js'

// Rol de la matriz → rol del backend. Operaciones absorbe a Bodega; Consulta no existe en el backend.
const A_API = { ADMIN_GENERAL: 'ADMIN', ADMINISTRACION: 'FINANZAS', BODEGA: 'OPERACIONES', SUPERVISOR: 'OPERACIONES', TECNICO: 'TECNICO', RRHH: 'RRHH' }

const filas = Object.entries(PERMISOS).map(([accion, roles]) => {
  const api = [...new Set(roles.map((r) => A_API[r]).filter(Boolean))].sort()
  return `    '${accion}': {${api.map((r) => `'${r}'`).join(', ')}},`
})
const salida = `# GENERADO por scripts/generar-permisos-servidor.mjs desde src/domain/rbac.js. No editar a mano.
# Una prueba falla si este archivo no coincide con la matriz del frontend.
PERMISOS = {
${filas.join('\n')}
}
`
const destino = new URL('../backend/erp/permisos_generados.py', import.meta.url)
if (process.argv.includes('--check')) {
  const { readFileSync } = await import('node:fs')
  if (readFileSync(destino, 'utf8') !== salida) { console.error('permisos_generados.py desactualizado: npm run permisos:servidor'); process.exit(1) }
  console.log('permisos_generados.py al día')
} else {
  writeFileSync(destino, salida)
  console.log('backend/erp/permisos_generados.py actualizado')
}
