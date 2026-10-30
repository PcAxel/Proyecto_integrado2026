import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { asistenciaService, obrasService, enviarOEncolar } from '@/services'
import { useSyncStore } from '@/stores/syncStore'
import { useResource } from '@/hooks/useResource'
import { obtenerPosicion } from '@/lib/gps'
import { COMUNAS_NUBLE } from '@/domain/geo'
import { siguienteMarca, validarMarca, TIPOS_MARCA, horaDe } from '@/domain/asistencia'
import { fechaLocal, isoLocal } from '@/domain/format'
import { nuevoClientId } from '@/domain/sync'

/**
 * Asistencia del técnico en el día: las marcas ya enviadas más las que esperan señal en la cola,
 * y la única acción válida ahora (entrada o salida). Lo usan la pantalla del reloj y el inicio.
 */
export function useAsistencia() {
  const dia = useResource(() => asistenciaService.miDia(), [])
  const pendientes = useSyncStore((s) => s.pendientes)
  const gpsModo = useSyncStore((s) => s.gpsModo)
  const [marcando, setMarcando] = useState(false)
  const enVuelo = useRef(false) // evita que un doble toque dispare dos marcas antes de que el estado se actualice
  const hoy = fechaLocal()

  const enCola = pendientes
    .filter((p) => p.tipo === 'ASISTENCIA' && p.payload.capturado_en.startsWith(hoy))
    .map((p) => ({ id: p.id, tipo: p.payload.tipo, fecha: p.payload.capturado_en, client_id: p.payload.client_id, enCola: true, obra_nombre: null, geocerca: null }))
  const enviadas = (dia.data?.marcas ?? []).filter((m) => !enCola.some((q) => q.client_id === m.client_id))
  const marcas = [...enviadas, ...enCola].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const siguiente = siguienteMarca(marcas)

  const marcar = useCallback(async (tipo) => {
    if (enVuelo.current) return null
    const valida = validarMarca(tipo, marcas)
    if (!valida.ok) {
      toast.error(valida.error)
      return null
    }
    enVuelo.current = true
    setMarcando(true)
    try {
      const obras = await obrasService.list({ estado: 'EN_CURSO' })
      const obra = obras[0] ?? null
      const referencia = obra?.ubicacion ?? COMUNAS_NUBLE['Chillán']
      const pos = await obtenerPosicion(referencia, gpsModo)
      const capturado_en = isoLocal()
      const r = await enviarOEncolar('ASISTENCIA', {
        tipo, lat: pos.lat, lng: pos.lng, capturado_en, obra_id: obra?.id ?? null, gps_simulado: pos.simulado,
      }, { obra_nombre: obra ? `${tipo === TIPOS_MARCA.ENTRADA ? 'Entrada' : 'Salida'} · ${obra.nombre}` : 'Reloj control' })
      const etiqueta = tipo === TIPOS_MARCA.ENTRADA ? 'Entrada' : 'Salida'
      if (r.encolado) toast.warning(`${etiqueta} guardada a las ${horaDe(capturado_en)}. Se enviará al recuperar la señal.`)
      else toast.success(`${etiqueta} registrada a las ${horaDe(capturado_en)}`)
      dia.reload()
      return r
    } catch (e) {
      toast.error(e.message || 'No se pudo registrar la marca.')
      return null
    } finally {
      enVuelo.current = false
      setMarcando(false)
    }
  }, [marcas, gpsModo, dia])

  return { cargando: dia.loading && !dia.data, marcas, siguiente, ultima: marcas.at(-1) ?? null, marcando, marcar }
}
