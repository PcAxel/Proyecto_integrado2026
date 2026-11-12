import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { ConfigurarDosPasos } from './ConfigurarDosPasos'
import { RecuperarPassword } from './RecuperarPassword'
import { formatoEspera, resumenFallo, textoRestantes } from '@/domain/bloqueoLogin'
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
  const [paso, setPaso] = useState('credenciales') // credenciales | vincular (setup_2fa) | codigo (verify_2fa) | recuperar | bloqueada
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [setup, setSetup] = useState(null) // { qr_uri, secret, temp_token }
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [fallo, setFallo] = useState(null)  // lo que el servidor contó del último intento fallido (intentos que quedan, espera, bloqueo)
  const [espera, setEspera] = useState(0)    // segundos que faltan para poder intentar de nuevo
  const [exito, setExito] = useState(null)

  useEffect(() => {
    if (espera <= 0) return undefined
    const id = setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [espera])

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

  const enviarCredenciales = async (e) => {
    e.preventDefault()
    if (espera > 0) return
    setError(null)
    setExito(null)
    setCargando(true)
    try { await credenciales() } catch (err) {
      const f = resumenFallo(err.data)
      setFallo(f)
      setEspera(f?.espera ?? 0)
      setPassword('')
      if (f?.bloqueada) setPaso('bloqueada')
      else setError(f?.restantes !== null && f?.restantes !== undefined && err.data?.code === 'invalid_credentials' ? `${err.message} ${textoRestantes(f.restantes)}` : err.message)
    } finally { setCargando(false) }
  }

  const credenciales = async () => {
    const r = await authService.login(email.trim(), password)
    setFallo(null)
    if (r.step === 'setup_2fa') {
      setSetup(r)
      setPaso('vincular')
    } else {
      setChallenge(r.challenge_token)
      setPaso('codigo')
    }
  }

  const enviarCodigo = ejecutar(async () => entrar(await authService.verify2fa(challenge, code)))

  // Primer ingreso: el primer código válido activa el 2FA y entrega los JWT definitivos.
  const confirmarVinculacion = async (codigo) => {
    setError(null)
    try { entrar(await authService.verifySetup2fa(setup.temp_token, codigo)) } catch (err) { setError(err.message) }
  }

  const volver = () => { setPaso('credenciales'); setCode(''); setSetup(null); setError(null) }

  if (paso === 'recuperar') {
    return (
      <RecuperarPassword Marco={Marco} emailInicial={email}
        onTerminado={(msg) => { setExito(msg); setFallo(null); setEspera(0); setError(null); setPaso('credenciales') }}
        onVolver={() => setPaso('credenciales')} />
    )
  }

  if (paso === 'bloqueada') {
    return (
      <Marco titulo="Cuenta bloqueada" subtitulo="Por seguridad, tu cuenta se bloqueó tras demasiados intentos fallidos.">
        <div className="space-y-4">
          <p role="alert" className="rounded-lg bg-crit-bg px-3 py-2 text-sm font-medium text-crit">Comunícate con el administrador para que desbloquee tu cuenta. Cuando lo haga, podrás entrar con tu contraseña de siempre.</p>
          <Button type="button" variant="ghost" className="w-full" onClick={() => { setPaso('credenciales'); setFallo(null); setError(null) }}>Volver al ingreso</Button>
        </div>
      </Marco>
    )
  }

  if (paso === 'credenciales') {
    return (
      <Marco titulo="Bienvenido a FYAG" subtitulo="Ingresa con tu correo y contraseña.">
        <form onSubmit={enviarCredenciales} className="space-y-4">
          {aviso && <p role="status" className="rounded-lg bg-harvest-bg px-3 py-2 text-sm font-medium text-warn">{aviso}</p>}
          {exito && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-sm font-medium text-ok">{exito}</p>}
          <Input label="Correo" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p role="alert" className="text-sm font-medium text-crit">{error}</p>}
          {fallo?.sugerirRecuperar && (
            <div role="note" className="space-y-2 rounded-lg border border-warn/40 bg-warn-bg px-3 py-2.5 text-sm text-warn">
              <p className="font-semibold">¿No recuerdas tu contraseña?</p>
              <p>{fallo.oficina
                ? 'Puedes recuperarla con un código que enviamos a tu correo. Si sigues intentando, tu cuenta se bloqueará y solo el administrador podrá desbloquearla.'
                : 'Puedes recuperarla con un código que enviamos a tu correo. Si sigues intentando, tendrás que esperar cada vez más tiempo.'}</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => setPaso('recuperar')}>Recuperar mi contraseña</Button>
            </div>
          )}
          <Button type="submit" size="lg" className="w-full" loading={cargando} disabled={espera > 0} icon={KeyRound}>{espera > 0 ? `Espera ${formatoEspera(espera)}` : 'Continuar'}</Button>
          {!fallo?.sugerirRecuperar && <button type="button" onClick={() => setPaso('recuperar')} className="w-full text-center text-xs font-medium underline-offset-2 hover:underline">¿Olvidaste tu contraseña?</button>}
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
