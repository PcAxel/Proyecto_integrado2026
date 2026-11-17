import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROLES, PERMISOS, CATALOGO_PERMISOS, permisosDe, can } from '../rbac.js'
import { verificarSegregacion, generarMatrizMarkdown } from '../matrizPermisos.js'

describe('segregación de funciones', () => {
  it('todas las reglas verificadas se cumplen', () => {
    const fallas = verificarSegregacion().filter((v) => !v.cumple)
    expect(fallas.map((f) => `${f.regla}: ${f.detalle}`)).toEqual([])
  })

  it('Administrador General: gestiona usuarios y autoriza, pero no ejecuta', () => {
    expect(permisosDe(ROLES.ADMIN_GENERAL, 'operativa')).toEqual([])
    expect(permisosDe(ROLES.ADMIN_GENERAL, 'sistema').sort()).toEqual(['gobernanza_ia.ver', 'usuarios.crear', 'usuarios.editar']) // la gobernanza de IA la ve, pero no la cambia
    expect(can('ADMIN_GENERAL', 'gobernanza_ia.gestionar')).toBe(false)
    expect(permisosDe(ROLES.ADMIN_GENERAL, 'aprobacion').sort()).toEqual(['conteo.aprobar', 'facturacion.emitir', 'obras.cerrar', 'presupuestos.aprobar'])
    for (const a of ['cardex.crear', 'cardex.reversar', 'compras.registrar', 'articulos.gestionar', 'hojas.auditar', 'personal.editar', 'maestros.gestionar', 'presupuestos.crear', 'obras.crear', 'pwa.usar']) {
      expect(can('ADMIN_GENERAL', a)).toBe(false)
    }
  })

  it('Consulta no puede nada que no sea leer', () => {
    const todas = permisosDe(ROLES.CONSULTA)
    expect(todas.length).toBeGreaterThan(10)
    expect(todas.every((a) => CATALOGO_PERMISOS[a].tipo === 'lectura')).toBe(true)
    expect(can('CONSULTA', 'exportar')).toBe(true) // exportar es lectura
  })

  it('RRHH es el único que modifica personal y flota; Administración (Finanzas) ya no', () => {
    expect(PERMISOS['personal.editar']).toEqual(['RRHH'])
    expect(can('ADMINISTRACION', 'personal.editar')).toBe(false)
    expect(can('ADMINISTRACION', 'personal.ver')).toBe(true) // sigue viendo tarifas para costear
    expect(permisosDe(ROLES.RRHH).sort()).toEqual(['asistencia.ver', 'cumplimiento.ver', 'dashboard.ver', 'personal.editar', 'personal.ver', 'rrhh.gestionar', 'rrhh.ver'])
  })

  it('las acciones de sistema son solo de TI (Super Admin) y, sin área de TI, de la Gerencia General', () => {
    for (const a of Object.keys(PERMISOS).filter((x) => CATALOGO_PERMISOS[x].tipo === 'sistema')) {
      expect(PERMISOS[a]).toContain('SUPER_ADMIN')
      expect(PERMISOS[a].filter((r) => !['SUPER_ADMIN', 'ADMIN_GENERAL'].includes(r))).toEqual([])
    }
  })

  it('el Super Admin no opera ni aprueba el negocio, ni ve costos', () => {
    expect(permisosDe(ROLES.SUPER_ADMIN).sort()).toEqual(['auditoria.ver', 'dashboard.ver', 'gobernanza_ia.gestionar', 'gobernanza_ia.ver', 'sistema.ver', 'usuarios.crear', 'usuarios.editar', 'usuarios.ver'])
  })

  it('el Ejecutivo Comercial prepara presupuestos y clientes, pero no aprueba ni toca proveedores', () => {
    expect(permisosDe(ROLES.COMERCIAL, 'operativa').sort()).toEqual(['clientes.gestionar', 'presupuestos.crear'])
    expect(permisosDe(ROLES.COMERCIAL, 'aprobacion')).toEqual([])
    for (const a of ['proveedores.ver', 'maestros.gestionar', 'facturacion.emitir', 'obras.ver', 'bodega.ver']) expect(PERMISOS[a]).not.toContain('COMERCIAL')
  })

  it('el Auditor Externo (CONSULTA) solo tiene lecturas, incluidas facturación y finiquitos', () => {
    expect(permisosDe(ROLES.CONSULTA).every((a) => CATALOGO_PERMISOS[a].tipo === 'lectura')).toBe(true)
    for (const a of ['facturacion.ver', 'finiquitos.ver', 'presupuestos.ver', 'auditoria.ver']) expect(PERMISOS[a]).toContain('CONSULTA')
  })
})

describe('PERMISOS es estricto', () => {
  it('cada acción está catalogada y cada catálogo tiene su acción', () => {
    expect(Object.keys(PERMISOS).sort()).toEqual(Object.keys(CATALOGO_PERMISOS).sort())
  })
  it('un rol nuevo no hereda nada: no hay conjuntos derivados de la lista de roles', () => {
    const src = readFileSync(join(process.cwd(), 'src/domain/rbac.js'), 'utf8')
    expect(src).not.toMatch(/Object\.values\(ROLES\)\.filter|\.\.\.OFICINA|const OFICINA|const ALL\b/)
    for (const roles of Object.values(PERMISOS)) expect(roles.length).toBeGreaterThan(0)
  })
  it('solo nombra roles existentes y sin repetidos', () => {
    for (const [accion, roles] of Object.entries(PERMISOS)) {
      expect(roles.every((r) => r in ROLES), accion).toBe(true)
      expect(new Set(roles).size, accion).toBe(roles.length)
    }
  })
})

describe('documento docs/matriz-permisos.md', () => {
  const doc = readFileSync(join(process.cwd(), 'docs/matriz-permisos.md'), 'utf8')
  it('coincide con el código (si falla: npm run docs:permisos)', () => {
    expect(doc).toBe(generarMatrizMarkdown())
  })
  it('lista todas las acciones y todos los roles', () => {
    for (const a of Object.keys(PERMISOS)) expect(doc).toContain(`\`${a}\``)
    for (const r of Object.values(ROLES)) expect(doc).toContain(`\`${r}\``)
  })
})
