import { create } from 'zustand'
import { ESCALA, esNoche, normalizarApariencia } from '@/domain/temas'

/**
 * Apariencia por persona (día↔noche, paleta y tamaño de letra): se guarda en este navegador bajo el id de la persona,
 * así que cambiarla no afecta a nadie más. `tema` ('claro'|'oscuro') se deriva de la barra para quien solo necesita saber de qué lado está.
 */
const clave = (usuarioId) => `fyag.apariencia.${usuarioId}`
const claveAntigua = (usuarioId) => `fyag.tema.${usuarioId}`

function leer(usuarioId, nivelDefecto) {
  try {
    const guardado = localStorage.getItem(clave(usuarioId))
    if (guardado) return normalizarApariencia(JSON.parse(guardado), nivelDefecto)
    const antiguo = localStorage.getItem(claveAntigua(usuarioId)) // preferencia de la versión anterior: solo claro/oscuro
    if (antiguo) return normalizarApariencia({ nivel: antiguo === 'claro' ? 0 : 100 }, nivelDefecto)
  } catch { /* sin almacenamiento o dato roto: se usan los valores por defecto */ }
  return normalizarApariencia(null, nivelDefecto)
}

const guardar = (usuarioId, { nivel, claro, oscuro, escala }) => {
  try { localStorage.setItem(clave(usuarioId), JSON.stringify({ nivel, claro, oscuro, escala })) } catch { /* el cambio dura la sesión */ }
}

const derivar = (a) => ({ ...a, tema: esNoche(a.nivel) ? 'oscuro' : 'claro' })

export const useTemaStore = create((set, get) => {
  const cambiar = (parche) => {
    const { usuarioId, nivel, claro, oscuro, escala } = get()
    const siguiente = normalizarApariencia({ nivel, claro, oscuro, escala, ...parche })
    guardar(usuarioId, siguiente)
    set(derivar(siguiente))
  }
  return {
    ...derivar(normalizarApariencia(null)),
    usuarioId: null,
    /** @param nivelDefecto 100 en el ERP (empieza oscuro) y 0 en la app de terreno (empieza claro), mientras la persona no elija. */
    cargar: (usuarioId, nivelDefecto = 100) => set({ usuarioId, ...derivar(leer(usuarioId, nivelDefecto)) }),
    setNivel: (nivel) => cambiar({ nivel }),
    setPaleta: (tipo, id) => cambiar({ [tipo]: id }),
    setEscala: (escala) => cambiar({ escala }),
    alternar: () => cambiar({ nivel: esNoche(get().nivel) ? 0 : 100 }),
    restablecer: (nivelDefecto = 100) => cambiar({ ...normalizarApariencia(null, nivelDefecto) }),
  }
})

export { ESCALA }
