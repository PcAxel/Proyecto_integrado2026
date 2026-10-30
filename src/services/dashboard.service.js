import { db } from '@/mocks/db'
import { calcularStock, estadoStock } from '@/domain/cardex'
import { costoRealObra, validarCierreObra } from '@/domain/obras'
import { evaluarChecklist } from '@/domain/checklist'
import { simularRentabilidad } from '@/domain/rentabilidad'
import { construirTareas } from '@/domain/tareas'
import { kpisGerencia, comparativoObras } from '@/domain/kpis'
import { alertasOperativas, alertasVencimiento, ordenarAlertas, diasHasta } from '@/domain/alertas'
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

      const personal = ve('personal.ver') ? db.all('personal') : null
      const flota = ve('personal.ver') ? db.all('flota') : null
      const vencimientos = personal && flota ? alertasVencimiento({ personal, flota, hoy }) : []
      const documentos = personal && flota
        ? { total: personal.filter((p) => p.activo).length + flota.filter((v) => v.activo).length * 2, vencidos: vencimientos.filter((a) => a.severidad === 'CRITICA').length }
        : null
      const kpis = kpisGerencia({ presupuestos, obras, hojas, retiros, articulos, costos, personal, flota, documentos })
      const comparativo = presupuestos && obras && costos ? comparativoObras(obras, presupuestos, costos) : null
      const alertas = ordenarAlertas([
        ...alertasOperativas({ obras: obras ?? [], articulos: articulos ?? [], hojas: hojas ?? [], retiros: retiros ?? [], hoy }),
        ...(ve('personal.ver') ? alertasVencimiento({ personal: personal ?? [], flota: flota ?? [], hoy }) : []),
      ])
      const actividad = ve('auditoria.ver')
        ? db.all('auditoria').slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id)).slice(0, 8)
        : null
      // «Pendientes para ti»: las fuentes salen de los datos visibles para el rol; el dominio decide qué tarea le corresponde.
      const cardex = db.all('cardex')
      const fuentes = {
        presupuestosPorAprobar: (presupuestos ?? []).filter((p) => p.estado === 'ENVIADO').map((p) => {
          const sim = simularRentabilidad(p)
          return { id: p.id, titulo: p.titulo, margenPct: sim.margenPct, bajoMinimo: sim.bajoMinimo }
        }),
        obrasListasParaCerrar: (obras ?? []).filter((o) => o.estado === 'EN_CURSO' && validarCierreObra({
          obra: o, presupuesto: o.presupuesto_id ? db.find('presupuestos', o.presupuesto_id) : null,
          hojas: db.all('hojas'), movimientos: cardex, pendientesSync: o.pendientes_sync ?? 0,
        }).puedeFinalizar).map((o) => ({ id: o.id, nombre: o.nombre })),
        obrasCU30: (obras ?? []).filter((o) => o.es_emergencia_sin_presupuesto && o.estado !== 'FINALIZADA').map((o) => ({ id: o.id, nombre: o.nombre })),
        hojasPorAuditar: (hojas ?? []).filter((h) => h.estado === 'ENVIADA').map((h) => ({
          id: h.id, obra_nombre: db.find('obras', h.obra_id)?.nombre ?? h.obra_id,
          critico: evaluarChecklist(h.checklist_json).resultado === 'CRITICO', dias: Math.max(0, -diasHasta(h.fecha, hoy)),
        })),
        retirosPendientes: (retiros ?? []).filter((r) => r.estado === 'PENDIENTE').map((r) => ({
          id: r.id, obra_nombre: db.find('obras', r.obra_id)?.nombre ?? r.obra_id, items: r.items.length,
          faltaStock: r.items.some((it) => calcularStock(cardex, it.articulo_id) < it.cantidad),
        })),
        articulosEnAlerta: articulos ? { sinStock: articulos.filter((a) => a.activo && a.estado_stock === 'SIN_STOCK').length, bajo: articulos.filter((a) => a.activo && a.estado_stock === 'BAJO').length } : undefined,
        vencimientos,
        vehiculosEnTaller: (flota ?? []).filter((v) => v.activo && v.estado === 'EN_TALLER').map((v) => ({ patente: v.patente })),
      }
      const tareas = construirTareas({ rol, fuentes })
      return { kpis, comparativo, alertas, actividad, tareas, generado: ahora() }
    })
  },
}
