import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'

describe('permisos del servidor', () => {
  it('backend/erp/permisos_generados.py coincide con la matriz del frontend (si falla: npm run permisos:servidor)', () => {
    expect(() => execFileSync('node', ['scripts/generar-permisos-servidor.mjs', '--check'], { stdio: 'pipe' })).not.toThrow()
  })
})
