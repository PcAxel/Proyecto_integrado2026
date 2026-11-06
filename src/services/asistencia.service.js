import { db } from '@/mocks/db'
import { dentroDeGeocerca } from '@/domain/geo'
import {
  TIPOS_MARCA, ESTADOS_ASISTENCIA, marcasDelDia, validarMarca, estadoDelDia, horasTrabajadas, horasEnCurso, jornadaSinSalida, horaDe, llegoTarde,
} from '@/domain/asistencia'
import { fechaLocal } from '@/domain/format'
import { respond, requirePermiso, ApiError, ahora } from './http'
import { registrarAuditoria } from './auditoria.service'

const fichaDe = (usuarioId) => db.all('personal').find((p) => p.usuario_id === usuarioId)

/** Marca con la distancia a la obra (si la hubo) para mostrarla en terreno y en RRHH. */
function vistaMarca(m) {
  const obra = m.obra_id ? db.find('obras', m.obra_id) : null
  return {
    ...m,
    obra_nombre: obra?.nombre ?? null,
    geocerca: obra && Number.isFinite(m.lat) ? dentroDeGeocerca(m, obra.ubicacion, obra.ubicacion.radio_m) : null,
  }
}

/**
 * Reloj control. Las marcas son inmutables (P1): no se editan ni se borran, y cada una queda en la auditoría (P4).
 * La hora la captura el dispositivo (puede llegar tarde si no había señal); el servidor rechaza horas futuras.
 */
export const asistenciaService = {
  /** Estado del técnico en la app: sus marcas de hoy y cuál es la próxima acción. */
  miDia() {
    return respond(() => {
      const u = requirePermiso('asistencia.marcar')
      const ficha = fichaDe(u.id)
      if (!ficha) throw new ApiError(403, 'El usuario no tiene ficha de personal.')
      const marcas = marcasDelDia(db.all('asistencia'), ficha.id, fechaLocal()).map(vistaMarca)
      return { tecnico_id: ficha.id, marcas, sin_salida_previa: jornadaSinSalida(db.all('asistencia'), ficha.id, fechaLocal()) }
    })
  },

  /**
   * Registra una entrada o salida. Idempotente por `client_id`: un reintento de la cola no duplica la marca.
   * La hora la fija el servidor; solo una marca `diferida` (hecha sin conexión y enviada después) conserva la hora del dispositivo.
   * @param {{tipo:'ENTRADA'|'SALIDA', lat:number, lng:number, capturado_en?:string, obra_id?:string|null, gps_simulado?:boolean, client_id?:string}} data
   */
  marcar({ tipo, lat, lng, precision_m = null, capturado_en, diferida = false, obra_id = null, gps_simulado = false, client_id }) {
    return respond(() => {
      const u = requirePermiso('asistencia.marcar')
      const ficha = fichaDe(u.id)
      if (!ficha) throw new ApiError(403, 'El usuario no tiene ficha de personal.')
      const previa = client_id && db.all('asistencia').find((m) => m.client_id === client_id)
      if (previa) return vistaMarca(previa)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ApiError(422, 'No se pudo obtener la ubicación para marcar.')
      const fecha = diferida && capturado_en ? capturado_en : ahora()
      if (fecha > ahora()) throw new ApiError(422, 'La hora de la marca no puede ser futura.')
      const v = validarMarca(tipo, marcasDelDia(db.all('asistencia'), ficha.id, fecha.slice(0, 10)))
      if (!v.ok) throw new ApiError(409, v.error)
      if (obra_id && !db.find('obras', obra_id)?.tecnicos.includes(ficha.id)) throw new ApiError(403, 'No estás asignado a esa obra.')
      const marca = db.insert('asistencia', { id: db.nextId('asistencia'), tecnico_id: ficha.id, tipo, fecha, obra_id, lat, lng, precision_m, gps_simulado, client_id: client_id ?? null,
        diferida, ...(diferida && { capturado_en }) })
      registrarAuditoria({ entidad: 'Asistencia', entidad_id: marca.id, accion: tipo === TIPOS_MARCA.ENTRADA ? 'MARCAR_ENTRADA' : 'MARCAR_SALIDA', nuevo: { tecnico_id: ficha.id, fecha, obra_id } })
      return vistaMarca(marca)
    })
  },

  /** Asistencia de hoy de todos los técnicos activos (RRHH). */
  hoy() {
    return respond(() => {
      requirePermiso('asistencia.ver')
      const dia = fechaLocal()
      const hora = horaDe(ahora())
      const marcas = db.all('asistencia')
      return db.all('personal').filter((p) => p.activo).map((p) => {
        const delDia = marcasDelDia(marcas, p.id, dia).map(vistaMarca)
        const entrada = delDia.find((m) => m.tipo === TIPOS_MARCA.ENTRADA)
        const salida = [...delDia].reverse().find((m) => m.tipo === TIPOS_MARCA.SALIDA)
        const estado = estadoDelDia(delDia, hora)
        return {
          tecnico_id: p.id, nombre: p.nombre, cargo: p.cargo, estado,
          entrada: entrada?.fecha ?? null, salida: estado === ESTADOS_ASISTENCIA.FINALIZADA ? salida?.fecha ?? null : null,
          horas: horasTrabajadas(delDia),
          horas_en_curso: horasEnCurso(delDia, hora),
          sin_salida_previa: jornadaSinSalida(marcas, p.id, dia),
          diferida: delDia.some((m) => m.diferida),
          atrasado: entrada ? llegoTarde(horaDe(entrada.fecha)) : false,
          obra_nombre: entrada?.obra_nombre ?? null,
          geocerca: entrada?.geocerca ?? null,
          precision_m: entrada?.precision_m ?? null,
          fuera_geocerca: entrada?.geocerca ? !entrada.geocerca.dentro : false,
        }
      }).sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.nombre.localeCompare(b.nombre))
    })
  },
}

const ORDEN = { AUSENTE: 0, PENDIENTE: 1, EN_JORNADA: 2, FINALIZADA: 3 }
