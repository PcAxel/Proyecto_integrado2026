import { useState } from 'react'
import { KeyRound, Mail } from 'lucide-react'
import { authService } from '@/services/auth.service'
import { Button, Input } from '@/components/ui'

/**
 * Recuperar la contraseña: 1) correo → el servidor envía un código de 6 dígitos (la respuesta es la misma exista o no el correo);
 * 2) código + contraseña nueva. Al terminar, la persona vuelve al ingreso. No toca el autenticador (2FA).
 * @param {{Marco: import('react').ElementType, emailInicial?: string, onTerminado: (mensaje: string) => void, onVolver: () => void}} props
 */
export function RecuperarPassword({ Marco, emailInicial = '', onTerminado, onVolver }) {
  const [paso, setPaso] = useState('correo') // correo | codigo
  const [email, setEmail] = useState(emailInicial)
  const [codigo, setCodigo] = useState('')
  const [password, setPassword] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [cargando, setCargando] = useState(false)

  const ejecutar = (fn) => async (e) => {
    e.preventDefault()
    setError(null)
    setCargando(true)
    try { await fn() } catch (err) { setError(err.message) } finally { setCargando(false) }
  }

  const pedirCodigo = ejecutar(async () => {
    const r = await authService.solicitarRecuperacion(email.trim())
    setInfo(r.detail)
    setPaso('codigo')
  })

  const cambiar = ejecutar(async () => {
    if (password !== repetida) { setError('Las contraseñas no coinciden.'); return }
    const r = await authService.confirmarRecuperacion(email.trim(), codigo, password)
    onTerminado(r.detail)
  })

  if (paso === 'correo') {
    return (
      <Marco titulo="Recuperar contraseña" subtitulo="Te enviaremos un código de 6 dígitos al correo de tu cuenta.">
        <form onSubmit={pedirCodigo} className="space-y-4">
          <Input label="Correo" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p role="alert" className="text-sm font-medium text-crit">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={cargando} icon={Mail}>Enviar código</Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onVolver}>Volver al ingreso</Button>
        </form>
      </Marco>
    )
  }

  return (
    <Marco titulo="Elige tu contraseña nueva" subtitulo="Escribe el código que llegó a tu correo y tu contraseña nueva.">
      <form onSubmit={cambiar} className="space-y-4">
        {info && <p role="status" className="rounded-lg bg-harvest-bg px-3 py-2 text-sm font-medium text-warn">{info}</p>}
        <Input label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required mono size="lg" autoFocus
          value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} />
        <Input label="Contraseña nueva" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Input label="Repite la contraseña" type="password" autoComplete="new-password" minLength={8} required value={repetida} onChange={(e) => setRepetida(e.target.value)} />
        {error && <p role="alert" className="text-sm font-medium text-crit">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={cargando} disabled={codigo.length !== 6} icon={KeyRound}>Cambiar contraseña</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => { setPaso('correo'); setError(null); setCodigo('') }}>Pedir otro código</Button>
      </form>
    </Marco>
  )
}
