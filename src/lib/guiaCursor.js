/**
 * Guía visual del asistente: un cursor azul que se mueve hasta el lugar al que llevas a la persona y HACE CLIC de verdad en el menú
 * (para que se vea cómo llegar), y luego completa la navegación. Todo es opcional y a prueba de fallos:
 * - sin la barra lateral visible (teléfono, menú cerrado) o con «reducir movimiento» activado, navega directo sin animación;
 * - si la persona toca una tecla o hace clic mientras el cursor viaja, se cancela la animación y se llega de inmediato;
 * - pase lo que pase, al final se navega a la URL que decidió el servidor.
 */

const AZUL = '#2563EB'

/** Partes de una URL del ERP: la sección del menú (`/erp/obras`), la ruta completa y si trae filtros. @param {string} url */
export function pasosDeGuia(url) {
  const [ruta, consulta = ''] = String(url ?? '').split('?')
  const m = /^(\/erp\/[a-z0-9_-]+)(\/[A-Za-z0-9_-]+)?\/?$/.exec(ruta)
  if (!m) return { seccion: null, ruta, consulta, esDetalle: false }
  return { seccion: m[1], ruta: m[1] + (m[2] ?? ''), consulta, esDetalle: Boolean(m[2]) }
}

const CURSOR = `<svg width="30" height="34" viewBox="0 0 30 34" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 5px rgba(37,99,235,.55))">
  <path d="M3 2 L3 26 L9.4 20.4 L14 31 L19 28.8 L14.4 18.4 L23 18.2 Z" fill="${AZUL}" stroke="#FFFFFF" stroke-width="2.2" stroke-linejoin="round"/></svg>`

const reducido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

function visible(el) {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
}

/** Espera hasta `ms` a que exista lo que devuelve `buscar()`. */
async function esperar(buscar, ms = 1800) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const el = buscar()
    if (el) return el
    await pausa(80)
  }
  return null
}

/** Espera a que el elemento esté a la vista y haya dejado de moverse (por ejemplo, al terminar un desplazamiento suave). */
async function esperarQuieto(el, ms = 2600) {
  const fin = Date.now() + ms
  let ultimo = null
  while (Date.now() < fin) {
    const r = el.getBoundingClientRect()
    const pos = `${Math.round(r.top)}|${Math.round(r.left)}`
    if (visible(el) && pos === ultimo) return true
    ultimo = pos
    await pausa(110)
  }
  return visible(el)
}

const centro = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }

/** Desde dónde sale el cursor: el panel del asistente (o la esquina inferior derecha). */
function origen() {
  const panel = document.querySelector('[role="dialog"][aria-label="Asistente de IA"]')
  if (panel && visible(panel)) { const r = panel.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height * 0.55 } }
  return { x: innerWidth - 60, y: innerHeight - 60 }
}

/** Mueve el cursor hasta el elemento, lo resalta y hace clic. Devuelve false si la persona canceló. */
async function moverYClicar(cursor, el, cancelado, { clic = true } = {}) {
  const { x: x0, y: y0 } = cursor.pos
  const { x, y } = centro(el)
  const distancia = Math.hypot(x - x0, y - y0)
  const duracion = Math.min(1100, 420 + distancia * 0.9)
  const curva = { x: (x0 + x) / 2 + Math.min(80, distancia * 0.12), y: (y0 + y) / 2 - Math.min(70, distancia * 0.1) } // trayectoria con una leve curva
  const viaje = cursor.el.animate([
    { transform: `translate(${x0}px, ${y0}px)` }, { transform: `translate(${curva.x}px, ${curva.y}px)`, offset: 0.55 }, { transform: `translate(${x}px, ${y}px)` },
  ], { duration: duracion, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'forwards' })
  await Promise.race([viaje.finished.catch(() => {}), new Promise((r) => { cursor.alCancelar = r })])
  cursor.pos = { x, y }
  if (cancelado()) return false
  // El «clic»: el cursor se hunde un poco, el elemento destella y se expande un anillo azul.
  cursor.el.animate([{ transform: `translate(${x}px, ${y}px) scale(1)` }, { transform: `translate(${x}px, ${y}px) scale(.82)` }, { transform: `translate(${x}px, ${y}px) scale(1)` }], { duration: 260, fill: 'forwards' })
  el.animate([{ boxShadow: '0 0 0 0 rgba(37,99,235,.65)' }, { boxShadow: '0 0 0 12px rgba(37,99,235,0)' }], { duration: 520 })
  const anillo = document.createElement('div')
  Object.assign(anillo.style, { position: 'fixed', left: `${x - 18}px`, top: `${y - 18}px`, width: '36px', height: '36px', borderRadius: '50%', border: `3px solid ${AZUL}`, pointerEvents: 'none', zIndex: 2147483000 })
  document.body.appendChild(anillo)
  anillo.animate([{ transform: 'scale(.3)', opacity: 0.9 }, { transform: 'scale(1.9)', opacity: 0 }], { duration: 520, easing: 'ease-out' }).finished.finally(() => anillo.remove())
  await pausa(240)
  if (cancelado()) return false
  if (clic) el.click() // sin `clic` solo se señala: el efecto se ve, pero no se pulsa nada
  return true
}

/**
 * Lleva a la persona hasta `url` mostrando el recorrido. `navigate` es el de react-router.
 * @param {string} url  @param {(to: string) => void} navigate
 */
export async function guiarA(url, navigate) {
  const actual = () => location.pathname + location.search
  const { seccion, ruta, esDetalle } = pasosDeGuia(url)
  const enlaceMenu = seccion ? document.querySelector(`aside a[href="${seccion}"]`) : null
  if (reducido() || typeof document === 'undefined' || !visible(enlaceMenu)) { navigate(url); return }

  let cancelado = false
  const cursor = { el: document.createElement('div'), pos: origen(), alCancelar: null }
  Object.assign(cursor.el.style, { position: 'fixed', left: '0', top: '0', width: '30px', height: '34px', margin: '-3px 0 0 -3px', pointerEvents: 'none', zIndex: 2147483001, willChange: 'transform', transform: `translate(${cursor.pos.x}px, ${cursor.pos.y}px)` })
  cursor.el.innerHTML = CURSOR
  const etiqueta = document.createElement('span')
  etiqueta.textContent = 'Asistente'
  Object.assign(etiqueta.style, { position: 'absolute', left: '26px', top: '26px', padding: '2px 8px', borderRadius: '999px', background: AZUL, color: '#fff', font: '600 11px system-ui, sans-serif', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(37,99,235,.45)' })
  cursor.el.appendChild(etiqueta)
  document.body.appendChild(cursor.el)
  cursor.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' })

  const cancelar = () => { cancelado = true; cursor.alCancelar?.() }
  const teclas = (e) => { if (e.key === 'Escape') cancelar() }
  window.addEventListener('pointerdown', cancelar, { once: true, capture: true })
  window.addEventListener('keydown', teclas)
  try {
    if (location.pathname !== seccion || esDetalle) {
      if (await moverYClicar(cursor, enlaceMenu, () => cancelado)) {
        if (esDetalle) { // dentro de la sección: si el enlace del detalle está a la vista, también se hace clic en él
          // El detalle puede ser un enlace, o una fila clicable de la lista (por ejemplo la obra «OB-0003»).
          const id = ruta.split('/').pop()
          const enlace = await esperar(() => document.querySelector(`main a[href="${ruta}"]`) ?? [...document.querySelectorAll('main tbody tr')].find((f) => f.textContent.includes(id)), 1200)
          if (enlace && !cancelado) {
            enlace.scrollIntoView({ behavior: 'smooth', block: 'center' }) // una fila de más abajo en la lista: se desplaza a la vista y se espera a que quede quieta
            if (!cancelado && await esperarQuieto(enlace) && !cancelado) await moverYClicar(cursor, enlace, () => cancelado)
          }
        }
      }
    }
  } catch { /* la animación es un adorno: si algo falla se navega igual */ } finally {
    window.removeEventListener('pointerdown', cancelar, { capture: true })
    window.removeEventListener('keydown', teclas)
    if (actual() !== url) navigate(url) // completa lo que el clic no cubre (filtros, ancla…)
    cursor.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, delay: 450, fill: 'forwards' }).finished.finally(() => cursor.el.remove())
  }
}


// ───────────────────────── Copiloto: ejecución visual de las acciones del agente (`ui_actions`) ─────────────────────────
/**
 * El agente opera la interfaz a la vista de la persona, con un cursor propio («Apex AI») que dice qué está haciendo.
 * Recibe un PLAN ya validado (ver `planDeAcciones` en features/ia/agente.js): el servidor autorizó cada acción y el cliente volvió a
 * comprobarla contra las pantallas y permisos de la persona. Reglas:
 * - nunca pulsa el botón final de un formulario: lo deja resaltado para que lo confirme la persona (humano en el circuito);
 * - cualquier clic o la tecla Escape cancela: la animación se corta y se llega directo al destino;
 * - con «reducir movimiento», o sin menú lateral a la vista, hace lo mismo sin animación.
 */
const objetivo = (id) => document.querySelector(`[data-agent-target="${id}"]`)
const campoDe = (clave) => document.querySelector(`[data-agent-field="${clave}"]`)
const fijarValor = (el, valor) => {
  // Los campos son controlados por React: se usa el setter nativo y se avisa con un evento `input`, igual que al teclear.
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function crearCursor(texto) {
  const cursor = { el: document.createElement('div'), pos: origen(), alCancelar: null, etiqueta: document.createElement('span') }
  Object.assign(cursor.el.style, { position: 'fixed', left: '0', top: '0', width: '30px', height: '34px', margin: '-3px 0 0 -3px', pointerEvents: 'none', zIndex: 2147483001, willChange: 'transform', transform: `translate(${cursor.pos.x}px, ${cursor.pos.y}px)` })
  cursor.el.setAttribute('data-agent-cursor', '')
  cursor.el.innerHTML = CURSOR
  const halo = document.createElement('span') // halo luminoso que late alrededor de la punta
  Object.assign(halo.style, { position: 'absolute', left: '-14px', top: '-14px', width: '40px', height: '40px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(96,165,250,.55) 0%, rgba(37,99,235,0) 70%)', zIndex: -1 })
  halo.animate([{ transform: 'scale(.8)', opacity: 0.9 }, { transform: 'scale(1.5)', opacity: 0.25 }, { transform: 'scale(.8)', opacity: 0.9 }], { duration: 1500, iterations: Infinity })
  cursor.el.prepend(halo)
  cursor.etiqueta.textContent = texto
  Object.assign(cursor.etiqueta.style, { position: 'absolute', left: '26px', top: '26px', padding: '3px 10px', borderRadius: '999px', background: 'linear-gradient(135deg,#1D4ED8,#2563EB)', color: '#fff', font: '600 11.5px system-ui, sans-serif', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(37,99,235,.5)', maxWidth: '18rem', overflow: 'hidden', textOverflow: 'ellipsis' })
  cursor.el.appendChild(cursor.etiqueta)
  document.body.appendChild(cursor.el)
  cursor.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' })
  cursor.decir = (t) => { cursor.etiqueta.textContent = t }
  return cursor
}

/** Borde brillante sobre un elemento durante `ms` (para señalar un indicador, una alerta o el botón que debe pulsar la persona). */
function iluminar(el, ms = 2600) {
  const previo = { outline: el.style.outline, outlineOffset: el.style.outlineOffset, borderRadius: el.style.borderRadius }
  Object.assign(el.style, { outline: `3px solid ${AZUL}`, outlineOffset: '4px' })
  if (!getComputedStyle(el).borderRadius || getComputedStyle(el).borderRadius === '0px') el.style.borderRadius = '10px'
  const brillo = el.animate([{ boxShadow: '0 0 0 0 rgba(37,99,235,.0)' }, { boxShadow: '0 0 26px 6px rgba(59,130,246,.65)' }, { boxShadow: '0 0 0 0 rgba(37,99,235,.0)' }], { duration: 1300, iterations: Math.max(1, Math.round(ms / 1300)) })
  brillo.finished.catch(() => {}).finally(() => Object.assign(el.style, previo))
}

/** Lleva hasta `url` haciendo clic en el menú (y en la fila del detalle si aplica). Devuelve false si la persona canceló. */
async function recorrer(cursor, url, navigate, cancelado) {
  const { seccion, ruta, esDetalle } = pasosDeGuia(url)
  const enlaceMenu = seccion ? (objetivo(`menu-${seccion.split('/').pop()}`) ?? document.querySelector(`aside a[href="${seccion}"]`)) : null
  if ((location.pathname !== seccion || esDetalle) && visible(enlaceMenu)) {
    if (!await moverYClicar(cursor, enlaceMenu, cancelado)) return false
    if (esDetalle) {
      const id = ruta.split('/').pop()
      const enlace = await esperar(() => document.querySelector(`main a[href="${ruta}"]`) ?? [...document.querySelectorAll('main tbody tr')].find((f) => f.textContent.includes(id)), 1200)
      if (enlace && !cancelado()) {
        enlace.scrollIntoView({ behavior: 'smooth', block: 'center' })
        if (await esperarQuieto(enlace) && !cancelado()) await moverYClicar(cursor, enlace, cancelado)
      }
    }
  }
  if (location.pathname + location.search !== url) navigate(url)
  return !cancelado()
}

const ETIQUETA_CAMPO = { rut: 'RUT', razon_social: 'razón social', giro: 'giro', comuna: 'comuna', contacto: 'contacto', telefono: 'teléfono', email: 'correo' }

/** Ejecuta sin animación (movimiento reducido, teléfono o cancelación): se llega al mismo resultado de una vez. */
async function ejecutarDirecto(plan, navigate) {
  for (const a of plan) {
    if (a.url && location.pathname + location.search !== a.url) navigate(a.url)
    if (a.tipo === 'HIGHLIGHT_ELEMENT') {
      const el = await esperar(() => objetivo(a.objetivo), 2500)
      if (el) { el.scrollIntoView({ block: 'center' }); iluminar(el) }
    }
    if (a.tipo === 'FILL_FORM') {
      (await esperar(() => objetivo(a.abrir), 2500))?.click()
      for (const [clave, valor] of Object.entries(a.campos)) {
        const el = await esperar(() => campoDe(clave), 1500)
        if (el && !el.disabled) fijarValor(el, valor)
      }
      const boton = await esperar(() => objetivo(a.confirmar), 800)
      if (boton) iluminar(boton, 5200)
    }
  }
}

/**
 * Ejecuta el plan con el cursor del agente. `alDecir(texto)` recibe cada estado («Navegando a Bodega…») por si la interfaz quiere mostrarlo.
 * @param {Array<object>} plan salida de `planDeAcciones`  @param {(to: string) => void} navigate  @param {{alDecir?: (t: string) => void}} [opciones]
 */
export async function ejecutarPlan(plan, navigate, { alDecir } = {}) {
  if (!plan?.length || typeof document === 'undefined') return
  if (reducido() || !visible(document.querySelector('aside nav'))) { await ejecutarDirecto(plan, navigate); return }

  let cancelado = false
  const cursor = crearCursor('Apex AI')
  const decir = (t) => { cursor.decir(t); alDecir?.(t) }
  const cancelar = () => { cancelado = true; cursor.alCancelar?.() }
  const teclas = (e) => { if (e.key === 'Escape') cancelar() }
  const esCancelado = () => cancelado
  window.addEventListener('pointerdown', cancelar, { once: true, capture: true })
  window.addEventListener('keydown', teclas)
  let hecho = 0
  try {
    for (const a of plan) {
      if (cancelado) break
      if (a.tipo === 'NAVIGATE') {
        decir(`Navegando a ${a.etiqueta || 'la pantalla'}…`)
        await recorrer(cursor, a.url, navigate, esCancelado)
      } else if (a.tipo === 'SEARCH_OR_FILTER') {
        decir('Aplicando filtro…')
        const buscador = objetivo(a.objetivo)
        if (visible(buscador)) await moverYClicar(cursor, buscador, esCancelado, { clic: false }) // se señala el buscador sin abrir su ventana
        for (let i = 1; i <= a.texto.length && !cancelado; i++) { decir(`Buscando: «${a.texto.slice(0, i)}»`); await pausa(55) } // letra por letra
        if (!cancelado) await pausa(250)
        navigate(a.url)
        const filtro = await esperar(() => objetivo('filtro-activo'), 1500)
        if (filtro && !cancelado) { await moverYClicar(cursor, filtro, esCancelado, { clic: false }); iluminar(filtro, 1300) }
      } else if (a.tipo === 'HIGHLIGHT_ELEMENT') {
        decir(`Mira aquí: ${a.descripcion || 'esto'}`)
        if (location.pathname !== a.url.split('?')[0]) await recorrer(cursor, a.url, navigate, esCancelado)
        const el = await esperar(() => objetivo(a.objetivo), 2500)
        if (el && !cancelado) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          if (await esperarQuieto(el) && !cancelado) { await moverYClicar(cursor, el, esCancelado, { clic: false }); iluminar(el) }
        }
      } else if (a.tipo === 'FILL_FORM') {
        if (location.pathname !== a.url.split('?')[0]) { decir(`Navegando a ${a.etiqueta || a.nombre}…`); await recorrer(cursor, a.url, navigate, esCancelado) }
        decir(`Abriendo «${a.nombre}»…`)
        const abrir = await esperar(() => objetivo(a.abrir), 2500)
        if (!abrir || cancelado) break
        if (!campoDe(Object.keys(a.campos)[0])) await moverYClicar(cursor, abrir, esCancelado) // abre el formulario (si no estaba abierto ya)
        for (const [clave, valor] of Object.entries(a.campos)) {
          if (cancelado) break
          const el = await esperar(() => campoDe(clave), 1500)
          if (!el || el.disabled) continue
          decir(`Completando ${ETIQUETA_CAMPO[clave] ?? clave}…`)
          if (!await moverYClicar(cursor, el, esCancelado, { clic: false })) break
          el.focus()
          for (let i = 1; i <= valor.length && !cancelado; i++) { fijarValor(el, valor.slice(0, i)); await pausa(28) }
          if (cancelado) fijarValor(el, valor) // si se cancela a mitad de un campo, no queda a medio escribir
        }
        const boton = await esperar(() => objetivo(a.confirmar), 800)
        if (boton && !cancelado) {
          decir('Listo. Revisa y confirma tú')
          await moverYClicar(cursor, boton, esCancelado, { clic: false }) // humano en el circuito: el agente NUNCA pulsa el botón final
          iluminar(boton, 5200)
          await pausa(900)
        }
      }
      hecho += 1
    }
  } catch { /* la animación es un adorno: si algo falla se completa en directo */ } finally {
    window.removeEventListener('pointerdown', cancelar, { capture: true })
    window.removeEventListener('keydown', teclas)
    // Lo que no se alcanzó a animar (cancelación o error) se completa sin animación, salvo rellenar un formulario: eso no se hace a espaldas de la persona.
    const resto = plan.slice(hecho).filter((a) => a.tipo !== 'FILL_FORM')
    if (resto.length) await ejecutarDirecto(resto, navigate).catch(() => {})
    cursor.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, delay: 600, fill: 'forwards' }).finished.finally(() => cursor.el.remove())
  }
}
