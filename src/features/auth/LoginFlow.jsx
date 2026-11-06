import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { ConfigurarDosPasos } from './ConfigurarDosPasos'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/stores/authStore'
import { Button, Input } from '@/components/ui'

/**
 * Inicio de sesión real en 2 pasos contra Django:
 *  1) correo + contraseña → desafío firmado (sin JWT);
 *  2) código TOTP de 6 dígitos (con QR de vinculación si es el primer ingreso) → JWT definitivo.
 * El marco visual lo pone quien lo usa (`Marco`), porque /login y /instalar se ven distinto.
 * @param {{Marco: import('react').ElementType, onListo: (user: import('@/domain/rolesApi').usuarioDesdeApi) => void, aviso?: string|null}} props
 */
export function LoginFlow({ Marco, onListo, aviso }) {
  const iniciarSesion = useAuthStore((s) => s.iniciarSesion)
  const [paso, setPaso] = useState('credenciales') // credenciales | vincular (setup_2fa) | codigo (verify_2fa)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [setup, setSetup] = useState(null) // { qr_uri, secret, temp_token }
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)

  const ejecutar = (fn) => async (e) => {
    e.preventDefault()
    setError(null)
    setCargando(true)
    try { await fn() } catch (err) { setError(err.message) } finally { setCargando(false) }
  }

  const entrar = (r) => {
    setPassword('')
    iniciarSesion(r)
    onListo(useAuthStore.getState().user)
  }

  const enviarCredenciales = ejecutar(async () => {
    const r = await authService.login(email.trim(), password)
    if (r.step === 'setup_2fa') {
      setSetup(r)
      setPaso('vincular')
    } else {
      setChallenge(r.challenge_token)
      setPaso('codigo')
    }
  })

  const enviarCodigo = ejecutar(async () => entrar(await authService.verify2fa(challenge, code)))

  // Primer ingreso: el primer código válido activa el 2FA y entrega los JWT definitivos.
  const confirmarVinculacion = async (codigo) => {
    setError(null)
    try { entrar(await authService.verifySetup2fa(setup.temp_token, codigo)) } catch (err) { setError(err.message) }
  }

  const volver = () => { setPaso('credenciales'); setCode(''); setSetup(null); setError(null) }

  if (paso === 'credenciales') {
    return (
      <Marco titulo="Bienvenido a FYAG" subtitulo="Ingresa con tu correo y contraseña.">
        <form onSubmit={enviarCredenciales} className="space-y-4">
          {aviso && <p role="status" className="rounded-lg bg-harvest-bg px-3 py-2 text-sm font-medium text-warn">{aviso}</p>}
          <Input label="Correo" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p role="alert" className="text-sm font-medium text-crit">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={cargando} icon={KeyRound}>Continuar</Button>
        </form>
      </Marco>
    )
  }

  if (paso === 'vincular') {
    return (
      <Marco titulo="Protege tu cuenta de FYAG (Primer Ingreso)" subtitulo="Para entrar necesitamos verificar tu identidad con tu celular. Solo se configura una vez.">
        <ConfigurarDosPasos qrUri={setup.qr_uri} secret={setup.secret} onConfirmar={confirmarVinculacion} onVolver={volver} error={error} />
      </Marco>
    )
  }

  return (
    <Marco titulo="Código de verificación" subtitulo="Escribe el código de 6 dígitos de tu aplicación autenticadora.">
      <form onSubmit={enviarCodigo} className="space-y-4">
        <Input
          label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
          required mono size="lg" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        {error && <p role="alert" className="text-sm font-medium text-crit">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={cargando} disabled={code.length !== 6} icon={ShieldCheck}>Verificar</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={volver}>Volver</Button>
      </form>
    </Marco>
  )
}
