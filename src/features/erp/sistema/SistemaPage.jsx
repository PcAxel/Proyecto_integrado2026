import { useState } from 'react'
import { Activity, Database, KeyRound, RefreshCw, ShieldOff, UserCheck, UserX, Lock, Mail, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, KpiTile, Badge, Button, Skeleton, Modal, Input } from '@/components/ui'
import { ROL_API_LABEL } from '@/components/domain'
import { ErrorEstado } from '@/components/ErrorEstado'
import { sistemaService } from '@/services'
import { useResource } from '@/hooks/useResource'
import { useAuthStore } from '@/stores/authStore'

const SERVICIOS = { postgresql: 'Base de datos principal', valkey: 'Caché y límites de uso', mongodb: 'Evidencia fotográfica' }

function Fila({ nombre, detalle, children }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0"><p className="text-sm font-medium">{nombre}</p>{detalle && <p className="text-xs text-ink-soft">{detalle}</p>}</div>
      {children}
    </li>
  )
}

/** Envía un correo de prueba y muestra el motivo exacto si falla: así TI arregla el correo sin leer los registros del servidor. */
function ProbarCorreo({ onClose }) {
  const miCorreo = useAuthStore((s) => s.user?.email ?? '')
  const [destino, setDestino] = useState(miCorreo)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const enviar = async () => {
    setEnviando(true)
    setResultado(null)
    try { setResultado(await sistemaService.probarCorreo(destino.trim())) } catch (e) { toast.error(e.message) } finally { setEnviando(false) }
  }
  return (
    <Modal open onClose={onClose} title="Probar el correo del sistema"
      footer={<><Button variant="secondary" onClick={onClose}>Cerrar</Button><Button icon={Mail} loading={enviando} disabled={!destino.trim()} onClick={enviar}>Enviar correo de prueba</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">Envía un mensaje real con el servicio de correo del servidor. Es lo mismo que usan los códigos para recuperar contraseñas y las credenciales de cuentas nuevas.</p>
        <Input label="Enviar a" type="email" value={destino} onChange={(e) => setDestino(e.target.value)} />
        {resultado && (
          <div role="status" className={`rounded-lg border p-3 text-sm ${resultado.ok ? 'border-ok/40 bg-ok-bg text-ok' : 'border-crit/40 bg-crit-bg text-crit'}`}>
            <p className="flex items-center gap-2 font-semibold">{resultado.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{resultado.ok ? 'El servicio aceptó el envío' : 'No se pudo enviar'}</p>
            <p className="mt-1">{resultado.motivo}</p>
            <p className="mt-2 text-xs opacity-80">Remitente configurado: <b>{resultado.remitente}</b> (debe estar verificado en Brevo).</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Estado del sistema para TI: salud de los servicios, integraciones configuradas y resumen de accesos. Solo lectura. */
export function SistemaPage() {
  const { data, loading, error, reload } = useResource(() => sistemaService.estado(), [])
  const a = data?.accesos
  const [probando, setProbando] = useState(false)
  return (
    <div className="space-y-5">
      <PageHeader title="Estado del Sistema" subtitle="Salud de los servicios e integraciones. Las claves nunca se muestran aquí."
        actions={<Button variant="secondary" icon={RefreshCw} onClick={reload} loading={loading}>Comprobar ahora</Button>} />
      {error ? <Card><ErrorEstado error={error} onReintentar={reload} /></Card> : !data ? <Card><Skeleton rows={6} /></Card> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile label="Accesos activos" value={a.activos} icon={UserCheck} hint={`${a.inactivos} desactivados`} />
            <KpiTile label="Cuentas bloqueadas" value={a.bloqueados} icon={Lock} tone={a.bloqueados ? 'crit' : 'ok'} hint="Por intentos fallidos" />
            <KpiTile label="Sin 2FA vinculado" value={a.sin_2fa} icon={ShieldOff} tone={a.sin_2fa ? 'warn' : 'ok'} hint="Aún no entran por primera vez" />
            <KpiTile label="Desactivados" value={a.inactivos} icon={UserX} hint="Conservan su historial" />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card data-agent-target="servicios-sistema" title="Servicios" subtitle="Comprobados al abrir esta pantalla" icon={Database}>
              <ul className="divide-y divide-line">
                {Object.entries(data.servicios).map(([k, v]) => (
                  <Fila key={k} nombre={SERVICIOS[k] ?? k}><Badge tone={v === 'ok' ? 'ok' : 'crit'}>{v === 'ok' ? 'Operativo' : 'Sin respuesta'}</Badge></Fila>
                ))}
              </ul>
            </Card>
            <Card data-agent-target="integraciones-sistema" title="Integraciones" subtitle="Las claves se configuran en el servidor, como variables de entorno" icon={KeyRound}>
              <ul className="divide-y divide-line">
                <Fila nombre="Asistente de IA" detalle="Clave del proveedor de IA"><Badge tone={data.integraciones.ia ? 'ok' : 'warn'}>{data.integraciones.ia ? 'Configurada' : 'Sin clave'}</Badge></Fila>
                <Fila nombre="Correo de accesos" detalle="Envío de credenciales y códigos"><div className="flex items-center gap-2"><Badge tone={data.integraciones.correo ? 'ok' : 'warn'}>{data.integraciones.correo ? 'Configurado' : 'Sin clave'}</Badge><Button size="sm" variant="secondary" icon={Mail} onClick={() => setProbando(true)}>Probar</Button></div></Fila>
                <Fila nombre="Factura electrónica (DTE)" detalle="Proveedor de emisión"><Badge tone={data.integraciones.dte_proveedor === 'simulado' ? 'warn' : 'ok'}>{data.integraciones.dte_proveedor === 'simulado' ? 'Simulado' : data.integraciones.dte_proveedor}</Badge></Fila>
                <Fila nombre="Modo de depuración" detalle="Debe estar apagado en producción"><Badge tone={data.entorno.debug ? 'warn' : 'ok'}>{data.entorno.debug ? 'Encendido' : 'Apagado'}</Badge></Fila>
              </ul>
            </Card>
          </div>
          <Card title="Accesos activos por rol" subtitle={`Términos vigentes: ${data.entorno.version_terminos}`} icon={Activity}>
            <ul className="grid gap-x-8 sm:grid-cols-2">
              {Object.entries(a.por_rol).map(([rol, n]) => (
                <li key={rol} className="flex items-center justify-between border-b border-line py-2.5 text-sm"><span>{ROL_API_LABEL[rol] ?? rol}</span><span className="font-semibold tabular-nums">{n}</span></li>
              ))}
            </ul>
          </Card>
        </>
      )}
      {probando && <ProbarCorreo onClose={() => setProbando(false)} />}
    </div>
  )
}
