import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { PERMISOS } from '@/domain/rbac'

const SRC = join(process.cwd(), 'src')

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? archivos(p) : [p]
  })
}
const todos = archivos(SRC).filter((p) => /\.(js|jsx)$/.test(p))
const esTest = (p) => /__tests__|\.test\.|test-setup/.test(p)
const codigo = todos.filter((p) => !esTest(p))
const leer = (p) => readFileSync(p, 'utf8')
const rel = (p) => relative(SRC, p)

describe('principios de arquitectura', () => {
  it('P7: no hay placeholders ni código omitido', () => {
    const malos = codigo.filter((p) => /\bTODO\b|\bFIXME\b|\.\.\.\s*resto del c[oó]digo|[Ll]orem [Ii]psum/.test(leer(p)))
    expect(malos.map(rel)).toEqual([])
  })

  it('P1/P2: ninguna pantalla usa íconos de borrado ni importa Trash', () => {
    const malos = codigo.filter((p) => /\bTrash2?\b|\bDeleteIcon\b/.test(leer(p)))
    expect(malos.map(rel)).toEqual([])
  })

  it('P1/P2: los servicios no exponen remove/destroy/delete', () => {
    const servicios = codigo.filter((p) => rel(p).startsWith('services/'))
    const malos = servicios.filter((p) => /^\s*(remove|destroy|delete|eliminar|borrar)\s*[:(]/m.test(leer(p)))
    expect(malos.map(rel)).toEqual([])
  })

  it('P3: el dominio es puro (solo importa módulos del propio dominio)', () => {
    const dominio = codigo.filter((p) => rel(p).startsWith('domain/'))
    expect(dominio.length).toBeGreaterThan(10)
    const externos = dominio.flatMap((p) => [...leer(p).matchAll(/from\s+'([^']+)'/g)].map((m) => [rel(p), m[1]])).filter(([, spec]) => !spec.startsWith('./'))
    expect(externos).toEqual([])
  })

  it('la UI accede a datos solo a través de servicios (no importa la base mock)', () => {
    const ui = codigo.filter((p) => /^(features|components|layouts|app|hooks)\//.test(rel(p)))
    const malos = ui.filter((p) => /@\/mocks\/(db|seed)/.test(leer(p)))
    expect(malos.map(rel)).toEqual([])
  })

  it('P5: toda acción RBAC usada en rutas y componentes existe en PERMISOS', () => {
    const usadas = new Set()
    for (const p of codigo) {
      const t = leer(p)
      for (const m of t.matchAll(/(?:accion=|can\([^,]+,\s*)["']([a-z_]+\.[a-z_]+|exportar)["']/g)) usadas.add(m[1])
      for (const m of t.matchAll(/requirePermiso\('([^']+)'\)/g)) usadas.add(m[1])
    }
    const inexistentes = [...usadas].filter((a) => !(a in PERMISOS))
    expect(usadas.size).toBeGreaterThan(20)
    expect(inexistentes).toEqual([])
  })

  it('P1: el servicio de Cardex solo declara su contrato', () => {
    const t = leer(join(SRC, 'services/cardex.service.js'))
    const bloque = t.slice(t.indexOf('export const cardexService'))
    const metodos = [...bloque.matchAll(/^  (\w+)\(/gm)].map((m) => m[1]).sort()
    expect(metodos).toEqual(['create', 'list', 'reingresarSobrante', 'retrieve', 'reversar'])
  })
})
