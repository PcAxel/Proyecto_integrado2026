import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Stepper, Skeleton } from '@/components/ui'
import { obrasService, articulosService, personalService, enviarOEncolar } from '@/services'
import { PASOS_HOJA, borradorVacio, validarPasoHoja, primerPasoIncompleto } from '@/domain/hojas'
import { useSyncStore } from '@/stores/syncStore'
import { useResource } from '@/hooks/useResource'
import { cargarBorrador, guardarBorrador, limpiarBorrador } from './borrador'
import { PasoObra } from './PasoObra'
import { PasoChecklist } from './PasoChecklist'
import { PasoFotos } from './PasoFotos'
import { PasoHoras } from './PasoHoras'
import { PasoCierre } from './PasoCierre'

/** Wizard de 5 pasos. El borrador se guarda en IndexedDB para no perder datos si se corta la señal. */
export function HojaServicioPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const online = useSyncStore((s) => s.online)
  const [estado, setEstado] = useState(null) // { draft, paso, lineas }
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const obras = useResource(() => obrasService.list({ estado: 'EN_CURSO' }), [])
  const catalogo = useResource(() => articulosService.catalogo(), [])
  const vehiculos = useResource(() => personalService.vehiculosParaTerreno(), [])

  useEffect(() => {
    cargarBorrador().then((b) => {
      const obraParam = params.get('obra')
      if (obraParam && b?.draft.obra_id !== obraParam) setEstado({ draft: borradorVacio(obraParam), paso: 1, lineas: [] })
      else setEstado(b ?? { draft: borradorVacio(), paso: 0, lineas: [] })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (estado) guardarBorrador(estado) }, [estado])
  // La primera vez se propone el vehículo asignado al técnico; después respeta lo que elija (incluido «No usé vehículo»).
  useEffect(() => {
    if (!estado || !vehiculos.data || estado.vehiculoAuto) return
    const propio = vehiculos.data.find((v) => v.asignado)
    setEstado((s) => ({
      ...s,
      vehiculoAuto: true,
      draft: propio && !s.draft.vehiculo_id ? { ...s.draft, vehiculo_id: propio.id, km_salida: propio.km_actual, km_regreso: null } : s.draft,
    }))
  }, [estado, vehiculos.data])

  if (!estado) return <div className="card"><Skeleton rows={5} /></div>
  const { draft, paso, lineas } = estado
  const obra = obras.data?.find((o) => o.id === draft.obra_id)
  const setDraft = (d) => { setError(null); setEstado((s) => ({ ...s, draft: d })) }
  const setLineas = (l) => setEstado((s) => ({ ...s, lineas: l, draft: { ...s.draft, materiales: l.map((x) => ({ articulo_id: x.articulo.id, cantidad: x.cantidad })) } }))
  const irAPaso = (p) => { setError(null); setEstado((s) => ({ ...s, paso: p })) }
  const ultimo = paso === PASOS_HOJA.length - 1

  const avanzar = () => {
    const v = validarPasoHoja(paso, draft)
    if (!v.ok) return setError(v.error)
    return irAPaso(paso + 1)
  }

  const enviar = async () => {
    const faltante = primerPasoIncompleto(draft)
    if (faltante !== -1) { setError(validarPasoHoja(faltante, draft).error); return irAPaso(faltante) }
    setEnviando(true)
    try {
      const gps = draft.fotos.at(-1)
      const r = await enviarOEncolar('HOJA', {
        obra_id: draft.obra_id, checklist_json: draft.checklist, horas_trabajadas: draft.horas_trabajadas, materiales: draft.materiales,
        fotos: draft.fotos, gps: { lat: gps.lat, lng: gps.lng }, firma_cliente: true, firma_img: draft.firma, observaciones: draft.observaciones.trim(),
        vehiculo_id: draft.vehiculo_id || null, km_salida: draft.vehiculo_id ? draft.km_salida : null, km_regreso: draft.vehiculo_id ? draft.km_regreso : null,
        client_id: draft.client_id,
      }, { obra_nombre: obra?.nombre })
      await limpiarBorrador()
      if (r.encolado) toast.info('Sin señal: la hoja quedó guardada y se enviará sola al reconectar.')
      else toast.success('Hoja de servicio enviada')
      navigate('/app', { replace: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-4 space-y-2">
        <Stepper steps={PASOS_HOJA} current={paso} />
        <h1 className="text-lg font-bold">{paso + 1}. {PASOS_HOJA[paso]}</h1>
      </div>

      <div className="flex-1 pb-4">
        {paso === 0 && <PasoObra obras={obras.data} draft={draft} setDraft={setDraft} />}
        {paso === 1 && <PasoChecklist draft={draft} setDraft={setDraft} />}
        {paso > 1 && !obra && <div className="card"><Skeleton rows={4} /></div>}
        {paso === 2 && obra && <PasoFotos obra={obra} draft={draft} setDraft={setDraft} />}
        {paso === 3 && obra && <PasoHoras draft={draft} setDraft={setDraft} catalogo={catalogo.data ?? []} lineas={lineas} setLineas={setLineas} vehiculos={vehiculos.data ?? []} />}
        {paso === 4 && obra && <PasoCierre obra={obra} draft={draft} setDraft={setDraft} lineas={lineas} irAPaso={irAPaso} vehiculos={vehiculos.data ?? []} />}
      </div>

      <div className="sticky -bottom-4 -mx-4 -mb-4 space-y-2 border-t border-line bg-surface p-3 pb-7">
        {error && <p role="alert" className="text-center text-sm font-medium text-crit">{error}</p>}
        <div className="flex gap-2">
          {paso > 0 && <Button type="button" variant="secondary" size="lg" icon={ChevronLeft} onClick={() => irAPaso(paso - 1)} aria-label="Paso anterior" />}
          {ultimo
            ? <Button type="button" size="lg" className="flex-1" icon={Send} loading={enviando} onClick={enviar}>{online ? 'Enviar hoja' : 'Guardar para enviar'}</Button>
            : <Button type="button" size="lg" className="flex-1" onClick={avanzar}>Siguiente<ChevronRight className="h-5 w-5" /></Button>}
        </div>
      </div>
    </div>
  )
}
