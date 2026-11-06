import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ShieldCheck, Smartphone, ScanLine } from 'lucide-react'
import { Button, Input } from '@/components/ui'

/** Número + texto de un paso de la guía. */
function Paso({ n, icon: Icon, children }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white" aria-hidden="true">{n}</span>
      <p className="pt-1 text-[15px] leading-snug text-ink"><Icon className="mr-1.5 inline h-4 w-4 text-brand" aria-hidden="true" />{children}</p>
    </li>
  )
}

/**
 * Configuración guiada de la autenticación de dos pasos (primer ingreso): el servidor entrega una URI
 * `otpauth://` y aquí se dibuja como QR. El secreto aún no está guardado en el usuario: se activa al confirmar el primer código.
 * @param {{qrUri: string, secret: string, onConfirmar: (code: string) => Promise<void>, onVolver: () => void, error?: string|null}} props
 */
export function ConfigurarDosPasos({ qrUri, secret, onConfirmar, onVolver, error }) {
  const [code, setCode] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setEnviando(true)
    try { await onConfirmar(code) } finally { setEnviando(false) }
  }

  return (
    <div className="space-y-6">
      <ol className="space-y-3">
        <Paso n={1} icon={Smartphone}>Descarga <b>Google Authenticator</b> o <b>Authy</b> en tu celular.</Paso>
        <Paso n={2} icon={ScanLine}>Abre la aplicación y <b>escanea este código QR</b>.</Paso>
        <Paso n={3} icon={ShieldCheck}>Escribe abajo el <b>código de 6 dígitos</b> que muestra la aplicación.</Paso>
      </ol>

      <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-white p-5">
        <QRCodeSVG value={qrUri} size={192} level="M" marginSize={2} role="img" aria-label="Código QR para vincular tu autenticador" />
        <details className="w-full text-center text-xs text-ink-soft">
          <summary className="cursor-pointer select-none">¿No puedes escanearlo? Ingresa la clave a mano</summary>
          <p className="mt-2 select-all break-all font-mono text-sm text-ink">{secret}</p>
        </details>
      </div>

      <form onSubmit={enviar} className="space-y-4">
        <Input
          label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
          required mono size="lg" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        {error && <p role="alert" className="text-sm font-medium text-crit">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={enviando} disabled={code.length !== 6} icon={ShieldCheck}>Confirmar y Vincular</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onVolver}>Volver</Button>
      </form>
    </div>
  )
}
