import { create } from 'zustand'
import { dividirTexto, elegirVoz, normalizarPrefsLector } from '@/domain/lectura'
import { crearTraductor, disponibilidadTraduccion, traduccionSoportada } from '@/lib/traduccion'

/**
 * Estado ÚNICO del lector de textos: solo se lee una cosa a la vez en toda la página. Guarda qué se lee (`fuente`), en qué trozo va (para los subtítulos)
 * y la traducción al inglés si el navegador la trae. Todo se activa solo cuando alguien lo pide: sin interacción no hace nada.
 */
const CLAVE = 'fyag.lector'
const soportado = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
const leerPrefs = () => { try { return normalizarPrefsLector(JSON.parse(localStorage.getItem(CLAVE))) } catch { return normalizarPrefsLector(null) } }
const guardarPrefs = ({ subtitulos }) => { try { localStorage.setItem(CLAVE, JSON.stringify({ subtitulos })) } catch { /* sin almacenamiento: dura la sesión */ } }

let voz = null
let ticket = 0       // identifica la lectura vigente: los avisos de una lectura cancelada se ignoran
let traductor = null
let vocesEscuchadas = false

const elegir = () => { voz = elegirVoz(window.speechSynthesis.getVoices()) }
const reposo = { estado: 'inactivo', fuente: null, trozos: [], indice: -1, traducciones: {} }

export const useLectorStore = create((set, get) => ({
  soportado: soportado(),
  ...reposo,
  subtitulos: leerPrefs().subtitulos,
  ingles: false,
  traduccion: { estado: traduccionSoportada() ? 'inactiva' : 'no-soportado', progreso: 0 }, // inactiva | preparando | lista | no-soportado | error
  ultimaSeleccion: '',

  setUltimaSeleccion: (texto) => set({ ultimaSeleccion: texto }),
  setSubtitulos: (v) => { set({ subtitulos: v }); guardarPrefs({ subtitulos: v }) },

  iniciar: (texto, fuente = 'general') => {
    if (!soportado()) return
    const trozos = dividirTexto(texto)
    if (!trozos.length) return
    if (!vocesEscuchadas) { vocesEscuchadas = true; window.speechSynthesis.addEventListener?.('voiceschanged', elegir) }
    elegir()
    window.speechSynthesis.cancel() // corta la lectura anterior, sea de este u otro botón
    const mio = ++ticket
    set({ estado: 'hablando', fuente, trozos, indice: 0, traducciones: {} })
    const fin = () => { if (ticket === mio) set(reposo) }
    trozos.forEach((trozo, i) => {
      const u = new window.SpeechSynthesisUtterance(trozo)
      u.lang = voz?.lang ?? 'es-CL'
      if (voz) u.voice = voz
      u.onstart = () => { if (ticket === mio) set({ estado: 'hablando', indice: i }) }
      if (i === trozos.length - 1) u.onend = fin
      u.onerror = fin // «canceled» al cambiar de lectura, o un fallo del motor de voz
      window.speechSynthesis.speak(u)
    })
    if (get().ingles && traductor) get().traducirTrozos(trozos, mio)
  },
  pausar: () => { if (soportado() && get().estado === 'hablando') { window.speechSynthesis.pause(); set({ estado: 'pausado' }) } },
  reanudar: () => { if (soportado() && get().estado === 'pausado') { window.speechSynthesis.resume(); set({ estado: 'hablando' }) } },
  detener: () => {
    if (!soportado()) return
    ticket += 1
    window.speechSynthesis.cancel()
    set(reposo)
  },

  /** Traduce los trozos uno a uno (el subtítulo en inglés aparece cuando está listo). Un error deja los subtítulos solo en español. */
  traducirTrozos: async (trozos, mio) => {
    for (let i = 0; i < trozos.length; i++) {
      if (ticket !== mio || !traductor) return
      try {
        const en = await traductor.translate(trozos[i])
        if (ticket === mio) set((s) => ({ traducciones: { ...s.traducciones, [i]: en } }))
      } catch {
        set({ traduccion: { estado: 'error', progreso: 0 } })
        return
      }
    }
  },

  /** Activa o apaga los subtítulos en inglés. Se llama desde un clic: si el navegador debe descargar el modelo de idioma, lo exige. */
  setIngles: async (activar) => {
    if (!activar) { set({ ingles: false }); return }
    const disp = await disponibilidadTraduccion()
    if (disp === 'no-soportado' || disp === 'unavailable') { set({ ingles: false, traduccion: { estado: 'no-soportado', progreso: 0 } }); return }
    set({ traduccion: { estado: 'preparando', progreso: 0 } })
    try {
      traductor ??= await crearTraductor((p) => set({ traduccion: { estado: 'preparando', progreso: p } }))
      set({ ingles: true, traduccion: { estado: 'lista', progreso: 100 } })
      const { trozos, estado } = get()
      if (estado !== 'inactivo') get().traducirTrozos(trozos, ticket) // ya se está leyendo: se traduce lo que falta
    } catch {
      set({ ingles: false, traduccion: { estado: 'error', progreso: 0 } })
    }
  },
}))
