import { db } from '@/mocks/db'
import { calcularStock, estadoStock } from '@/domain/cardex'
import { costoRealObra } from '@/domain/obras'
import { kpisGerencia, comparativoObras } from '@/domain/kpis'
import { alertasOperativas, alertasVencimiento, ordenarAlertas } from '@/domain/alertas'
import { can } from '@/domain/rbac'
import { fechaLocal } from '@/domain/format'
import { respond, requirePermiso, ahora } from './http'

/**
 * Resumen de gerencia. Cada bloque solo se calcula si el rol puede ver sus datos de origen (P5);
 * el resto llega como null/ausente y la UI no lo dibuja.
 */
export const dashboardService = {
  resumen() {
    return respond(() => {
      const { rol } = requirePermiso('dashboard.ver')
      const hoy = fechaLocal()
      const ve = (accion) => can(rol, accion)

      const articulos = ve('bodega.ver')
        ? db.all('articulos').map((a) => {
          const stock = calcularStock(db.all('cardex'), a.id)
          const base = { ...a, stock, estado_stock: estadoStock(stock, a.stock_minimo) }
          if (!ve('costos_compra.ver')) delete base.costo_unitario
          return base
        })
        : null
      const obras = ve('obras.ver') ? db.all('obras') : null
      const presupuestos = ve('presupuestos.ver') ? db.all('presupuestos') : null
      const hojas = ve('terreno.ver') ? db.all('hojas') : null
      const retiros = ve('bodega.ver') ? db.all('retiros') : null
      const costos = obras && ve('costos.ver')
        ? Object.fromEntries(obras.map((o) => [o.id, costoRealObra(o.id, db.all('cardex'), db.all('hojas')).total]))
        : null

      const kpis = kpisGerencia({ presupuestos, obras, hojas, retiros, articulos, costos })
      const comparativo = presupuestos && obras && costos ? comparativoObras(obras, presupuestos, costos) : null
      const alertas = ordenarAlertas([
        ...alertasOperativas({ obras: obras ?? [], articulos: articulos ?? [], hojas: hojas ?? [], retiros: retiros ?? [], hoy }),
        ...(ve('personal.ver') ? alertasVencimiento({ personal: db.all('personal'), flota: db.all('flota'), hoy }) : []),
      ])
      const actividad = ve('auditoria.ver')
        ? db.all('auditoria').slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id)).slice(0, 8)
        : null
      return { kpis, comparativo, alertas, actividad, generado: ahora() }
    })
  },
}
