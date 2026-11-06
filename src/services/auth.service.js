import { request } from './api'

/** Endpoints de autenticación (los cuatro primeros no llevan token). */
export const authService = {
  /** → { step: 'verify_2fa', challenge_token } | { step: 'setup_2fa', qr_uri, secret, temp_token } */
  login: (email, password) => request('/auth/login/', { method: 'POST', body: { email, password }, auth: false }),
  /** Usuarios con 2FA activo: código de 6 dígitos → tokens JWT. */
  verify2fa: (challenge_token, code) => request('/auth/2fa/verify/', { method: 'POST', body: { challenge_token, code }, auth: false }),
  /** Primer ingreso: primer código contra el secreto temporal → activa el 2FA y entrega los tokens JWT. */
  verifySetup2fa: (temp_token, code) => request('/auth/verify-setup-2fa/', { method: 'POST', body: { temp_token, code }, auth: false }),
  /** Restaura la sesión desde la cookie HttpOnly (al abrir la app). Rota la cookie. */
  refresh: () => request('/auth/refresh/', { method: 'POST', auth: false }),
  logout: () => request('/auth/logout/', { method: 'POST', auth: false }),
  me: () => request('/auth/me/'),
  acceptTerms: (version) => request('/auth/accept-terms/', { method: 'POST', body: { version } }),
}
