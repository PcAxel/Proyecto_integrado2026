import { db } from '@/mocks/db'
import { validarCreacionObra, costoRealObra, validarCierreObra } from '@/domain/obras'
import { can } from '@/domain/rbac'
import { respond, requirePermiso, actor, ApiError, ahora } from './http'
import { registrarAuditoria } from './auditoria.service'

function cierreDe(obra) {
  return validarCierreObra({
    obra,
    presupuesto: obra.presupuesto_id ? db.find('presupuestos', obra.presupuesto_id) : null,
    hojas: db.all('hojas'),
    movimientos: db.all('cardex'),
    pendientesSync: obra.pendientes_sync ?? 0,
  })
}

function vista(obra, rol) {
  const costos = can(rol, 'costos.ver')
  return {
    ...obra,
    supervisor_nombre: db.find('usuarios', obra.supervisor_id)?.nombre ?? obra.supervisor_id,
    tecnicos_detalle: obra.tecnicos.map((id) => {
      const p = db.find('personal', id)
      return { id, nombre: p?.nombre ?? id, cargo: p?.cargo ?? '' }
    }),
    costo_real: costos ? costoRealObra(obra.id, db.all('cardex'), db.all('hojas')) : null,
    cierre: cierreDe(obra),
  }
}

const buscar = (id) => {
  const o = db.find('obras', id)
  if (!o) throw new ApiError(404, 'Obra no encontrada.')
  return o
}

function transicion(id, cambios, accion) {
  const o = buscar(id)
  const anterior = Object.fromEntries(Object.keys(cambios).map((k) => [k, o[k]]))
  db.patch('obras', id, cambios)
  registrarAuditoria({ entidad: 'Obra', entidad_id: id, accion, anterior, nuevo: cambios })
  return o
}

export const obrasService = {
  /** Técnicos asignables (sin tarifas). */
  tecnicosDisponibles() {
    return respond(() => {
      requirePermiso('obras.crear')
      return db.all('personal').filter((p) => p.activo).map(({ id, nombre, cargo }) => ({ id, nombre, cargo }))
    })
  },
  /** Bitácora de auditoría de la obra y de lo que cuelga de ella (hojas, movimientos, retiros). */
  historial(id) {
    return respond(() => {
      requirePermiso('obras.ver')
      buscar(id)
      const hojas = new Set(db.all('hojas').filter((h) => h.obra_id === id).map((h) => h.id))
      const movs = new Set(db.all('cardex').filter((m) => m.obra_id === id).map((m) => m.id))
      const retiros = new Set(db.all('retiros').filter((r) => r.obra_id === id).map((r) => r.id))
      return db.all('auditoria')
        .filter((l) => (l.entidad === 'Obra' && l.entidad_id === id)
          || (l.entidad === 'HojaServicio' && hojas.has(l.entidad_id))
          || (l.entidad === 'MovimientoCardex' && movs.has(l.entidad_id))
          || (l.entidad === 'SolicitudRetiro' && retiros.has(l.entidad_id)))
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))
    })
  },
  /** El técnico solo ve las obras en las que está asignado (usa su ficha). */
  list({ estado, tipo } = {}) {
    return respond(() => {
      const u = actor()
      if (!can(u.rol, 'obras.ver') && !can(u.rol, 'pwa.usar')) throw new ApiError(403, 'No tiene permiso para ver obras.')
      const ficha = db.all('personal').find((p) => p.usuario_id === u.id)
      return db.all('obras')
        .filter((o) => (!estado || o.estado === estado) && (!tipo || o.tipo === tipo)
          && (u.rol !== 'TECNICO' || o.tecnicos.includes(ficha?.id)))
        .map((o) => vista(o, u.rol)).reverse()
    })
  },
  retrieve(id) {
    return respond(() => {
      const u = actor()
      const obra = buscar(id)
      if (u.rol === 'TECNICO') {
        const ficha = db.all('personal').find((p) => p.usuario_id === u.id)
        if (!obra.tecnicos.includes(ficha?.id)) throw new ApiError(403, 'No estás asignado a esta obra.')
      }
      return vista(obra, u.rol)
    })
  },
  /** Reemplaza los técnicos asignados. Los asignados son los únicos que ven la obra en la app de terreno. */
  asignarTecnicos(id, tecnicos) {
    return respond(() => {
      const u = requirePermiso('obras.crear')
      const o = buscar(id)
      if (o.estado === 'FINALIZADA') throw new ApiError(409, 'No se puede reasignar una obra finalizada.')
      const ids = [...new Set(tecnicos ?? [])]
      const invalido = ids.find((t) => !db.find('personal', t)?.activo)
      if (invalido) throw new ApiError(422, `El técnico ${invalido} no existe o está inactivo.`)
      const anterior = [...o.tecnicos]
      if (anterior.length === ids.length && anterior.every((t) => ids.includes(t))) return vista(o, u.rol)
      db.patch('obras', id, { tecnicos: ids })
      registrarAuditoria({ entidad: 'Obra', entidad_id: id, accion: 'ASIGNAR_TECNICOS', anterior: { tecnicos: anterior }, nuevo: { tecnicos: ids } })
      return vista(o, u.rol)
    })
  },
  /** CU30: Emergencia/Garantía abren sin presupuesto y quedan marcadas hasta regularizar. */
  create(data) {
    return respond(() => {
      const u = requirePermiso('obras.crear')
      const v = validarCreacionObra(data, db.all('presupuestos'))
      if (!v.ok) throw new ApiError(422, v.error)
      if (v.es_emergencia_sin_presupuesto && !can(u.rol, 'obras.emergencia')) {
        throw new ApiError(403, 'Solo Supervisor o Gerencia pueden abrir obras sin presupuesto (CU30).')
      }
      if (!db.find('clientes', data.cliente_id)) throw new ApiError(422, 'Cliente inexistente.')
      if (!data.nombre?.trim()) throw new ApiError(422, 'La obra debe tener un nombre.')
      if (!Number.isFinite(data.ubicacion?.lat) || !Number.isFinite(data.ubicacion?.lng)) throw new ApiError(422, 'Indique la ubicación de la obra.')
      if (data.presupuesto_id && db.all('obras').some((o) => o.presupuesto_id === data.presupuesto_id)) {
        throw new ApiError(422, 'El presupuesto ya está vinculado a otra obra.')
      }
      const obra = db.insert('obras', {
        tecnicos: [], supervisor_id: u.id, fecha_inicio: ahora().slice(0, 10), fecha_fin_estimada: null, fecha_cierre: null,
        sobrantes_conciliados: false, pendientes_sync: 0, ...data,
        id: db.nextId('obras'), estado: 'PLANIFICADA', presupuesto_id: data.presupuesto_id ?? null,
        es_emergencia_sin_presupuesto: v.es_emergencia_sin_presupuesto,
      })
      registrarAuditoria({ entidad: 'Obra', entidad_id: obra.id, accion: v.es_emergencia_sin_presupuesto ? 'CREAR_CU30' : 'CREAR', nuevo: { tipo: obra.tipo, presupuesto_id: obra.presupuesto_id } })
      return vista(obra, u.rol)
    })
  },
  iniciar(id) {
    return respond(() => {
      const u = requirePermiso('obras.crear')
      if (buscar(id).estado !== 'PLANIFICADA') throw new ApiError(409, 'Solo una obra PLANIFICADA puede iniciarse.')
      return vista(transicion(id, { estado: 'EN_CURSO' }, 'INICIAR'), u.rol)
    })
  },
  /** Regulariza una obra CU30 vinculándole un presupuesto aprobado. */
  regularizarPresupuesto(id, presupuesto_id) {
    return respond(() => {
      const u = requirePermiso('obras.crear')
      const o = buscar(id)
      if (!o.es_emergencia_sin_presupuesto) throw new ApiError(409, 'La obra no está pendiente de regularización.')
      const v = validarCreacionObra({ tipo: 'INSTALACION', presupuesto_id }, db.all('presupuestos'))
      if (!v.ok) throw new ApiError(422, v.error)
      if (db.all('obras').some((x) => x.presupuesto_id === presupuesto_id)) throw new ApiError(422, 'El presupuesto ya está vinculado a otra obra.')
      return vista(transicion(id, { presupuesto_id, es_emergencia_sin_presupuesto: false }, 'REGULARIZAR_CU30'), u.rol)
    })
  },
  conciliarSobrantes(id) {
    return respond(() => {
      const u = requirePermiso('cardex.reingresar')
      return vista(transicion(id, { sobrantes_conciliados: true }, 'CONCILIAR_SOBRANTES'), u.rol)
    })
  },
  /** Finaliza solo si los 6 checks del Panel de Cierre pasan. */
  finalizar(id) {
    return respond(() => {
      const u = requirePermiso('obras.cerrar')
      const o = buscar(id)
      if (o.estado !== 'EN_CURSO') throw new ApiError(409, 'Solo una obra EN_CURSO puede finalizarse.')
      const cierre = cierreDe(o)
      if (!cierre.puedeFinalizar) throw new ApiError(422, 'La obra no cumple los requisitos de cierre.', cierre)
      return vista(transicion(id, { estado: 'FINALIZADA', fecha_cierre: ahora().slice(0, 10) }, 'FINALIZAR'), u.rol)
    })
  },
}
