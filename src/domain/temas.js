/**
 * Apariencia por persona: dos paletas claras, dos oscuras y una barra que pasa de la clara a la oscura de forma progresiva.
 * Cada paleta define TODOS los tokens `--c-*` (ternas «r g b», como las usa Tailwind con `rgb(var(--c-x) / <alpha>)`).
 */

const P = (o) => o

const CREMA = P({
  canvas: '243 238 227', surface: '252 250 245', line: '224 216 200', 'line-strong': '203 191 168',
  ink: '18 48 47', 'ink-soft': '75 106 107', 'ink-faint': '123 148 148',
  'slate-50': '248 245 238', 'slate-100': '239 234 223', 'slate-200': '224 216 200', 'slate-300': '203 191 168', 'slate-400': '143 163 161',
  'slate-500': '103 130 128', 'slate-600': '75 106 107', 'slate-700': '52 80 79', 'slate-800': '31 60 60', 'slate-900': '18 48 47',
  brand: '46 111 115', 'brand-dark': '15 61 62', 'brand-light': '127 179 184', 'brand-tint': '221 235 232', accion: '198 96 31', 'accion-dark': '176 82 24',
  ok: '27 127 82', 'ok-bg': '220 239 227', warn: '154 91 0', 'warn-bg': '248 232 200', crit: '184 53 43', 'crit-bg': '246 221 216', 'harvest-bg': '248 232 200',
  'f-bg': '243 238 227', 'f-panel': '252 250 245', 'f-deep': '207 227 224', 'f-ice': '63 115 120', 'f-cream': '18 48 47', 'f-teal': '46 111 115',
})

const HIELO = P({
  canvas: '238 243 246', surface: '255 255 255', line: '221 229 235', 'line-strong': '195 208 217',
  ink: '18 34 47', 'ink-soft': '81 99 111', 'ink-faint': '125 144 157',
  'slate-50': '246 249 251', 'slate-100': '235 241 245', 'slate-200': '221 229 235', 'slate-300': '195 208 217', 'slate-400': '143 162 175',
  'slate-500': '97 118 132', 'slate-600': '71 92 107', 'slate-700': '52 72 90', 'slate-800': '31 51 68', 'slate-900': '18 34 47',
  brand: '12 124 153', 'brand-dark': '9 102 129', 'brand-light': '61 180 210', 'brand-tint': '230 245 249', accion: '12 124 153', 'accion-dark': '9 102 129',
  ok: '27 138 88', 'ok-bg': '225 244 234', warn: '184 110 0', 'warn-bg': '253 240 213', crit: '199 58 48', 'crit-bg': '252 230 227', 'harvest-bg': '253 240 213',
  'f-bg': '238 243 246', 'f-panel': '255 255 255', 'f-deep': '207 227 234', 'f-ice': '12 100 130', 'f-cream': '18 34 47', 'f-teal': '12 124 153',
})

const PETROLEO = P({
  canvas: '10 15 20', surface: '13 21 28', line: '26 42 51', 'line-strong': '38 64 74',
  ink: '234 220 200', 'ink-soft': '157 191 194', 'ink-faint': '111 148 152',
  'slate-50': '15 26 34', 'slate-100': '20 34 43', 'slate-200': '27 45 56', 'slate-300': '42 67 80', 'slate-400': '94 127 134',
  'slate-500': '127 163 168', 'slate-600': '155 187 190', 'slate-700': '188 211 209', 'slate-800': '216 221 210', 'slate-900': '234 220 200',
  brand: '63 143 149', 'brand-dark': '46 111 115', 'brand-light': '127 179 184', 'brand-tint': '18 56 59', accion: '198 96 31', 'accion-dark': '176 82 24',
  ok: '70 201 143', 'ok-bg': '18 52 42', warn: '232 163 61', 'warn-bg': '58 42 18', crit: '239 106 95', 'crit-bg': '58 26 23', 'harvest-bg': '58 42 18',
  'f-bg': '10 15 20', 'f-panel': '13 21 28', 'f-deep': '15 61 62', 'f-ice': '127 179 184', 'f-cream': '234 220 200', 'f-teal': '46 111 115',
})

const MEDIANOCHE = P({
  canvas: '9 12 24', surface: '15 20 36', line: '30 38 62', 'line-strong': '46 57 90',
  ink: '226 232 246', 'ink-soft': '160 172 200', 'ink-faint': '112 124 156',
  'slate-50': '14 19 34', 'slate-100': '19 25 44', 'slate-200': '27 35 58', 'slate-300': '43 54 85', 'slate-400': '95 108 145',
  'slate-500': '130 143 178', 'slate-600': '158 170 200', 'slate-700': '190 199 222', 'slate-800': '215 221 238', 'slate-900': '232 236 248',
  brand: '96 140 240', 'brand-dark': '66 105 200', 'brand-light': '150 180 255', 'brand-tint': '22 36 74', accion: '224 120 50', 'accion-dark': '196 100 36',
  ok: '70 201 143', 'ok-bg': '16 48 44', warn: '232 163 61', 'warn-bg': '56 42 20', crit: '239 106 95', 'crit-bg': '58 26 30', 'harvest-bg': '56 42 20',
  'f-bg': '9 12 24', 'f-panel': '15 20 36', 'f-deep': '34 52 110', 'f-ice': '150 175 235', 'f-cream': '226 232 246', 'f-teal': '66 105 200',
})

export const PALETAS = {
  claro: {
    crema: { nombre: 'Crema', tokens: CREMA },
    hielo: { nombre: 'Hielo', tokens: HIELO },
  },
  oscuro: {
    petroleo: { nombre: 'Petróleo', tokens: PETROLEO },
    medianoche: { nombre: 'Medianoche', tokens: MEDIANOCHE },
  },
}

/** Tokens que se usan como TEXTO o color de énfasis: cambian de golpe cerca del centro de la barra para no quedar gris sobre gris. */
const PRIMER_PLANO = new Set([
  'ink', 'ink-soft', 'ink-faint', 'slate-400', 'slate-500', 'slate-600', 'slate-700', 'slate-800', 'slate-900',
  'brand', 'brand-dark', 'brand-light', 'accion', 'accion-dark', 'ok', 'warn', 'crit', 'f-ice', 'f-cream', 'f-teal',
])

export const ESCALA = { min: 85, max: 140, paso: 5, defecto: 100 }
export const NIVEL_NOCHE = 50  // desde aquí el modo se considera «oscuro» (color-scheme, gráficos)

const limitar = (n, a, b) => Math.min(b, Math.max(a, n))
const terna = (s) => s.split(' ').map(Number)

/**
 * Mezcla la paleta clara con la oscura según `nivel` (0 = día puro, 100 = noche pura). Los fondos y líneas avanzan de forma lineal;
 * los textos y acentos cambian en una franja estrecha alrededor de 50, donde el fondo es gris medio y ambos colores se leen igual de bien.
 * @returns {Record<string,string>} token → «r g b»
 */
export function mezclar(claro, oscuro, nivel) {
  const t = limitar(Number(nivel) / 100, 0, 1)
  const u = limitar((t - 0.46) / 0.08, 0, 1)
  const suave = u * u * (3 - 2 * u)
  const salida = {}
  for (const k of Object.keys(claro)) {
    const w = PRIMER_PLANO.has(k) ? suave : t
    const a = terna(claro[k])
    const b = terna(oscuro[k])
    salida[k] = a.map((v, i) => Math.round(v + (b[i] - v) * w)).join(' ')
  }
  return salida
}

export const esNoche = (nivel) => nivel >= NIVEL_NOCHE

/** Estado válido a partir de lo guardado (o de nada): valores desconocidos vuelven al defecto. */
export function normalizarApariencia(crudo, nivelDefecto = 100) {
  const c = crudo && typeof crudo === 'object' ? crudo : {}
  const num = (v, a, b, def) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? limitar(Math.round(Number(v)), a, b) : def)
  return {
    nivel: num(c.nivel, 0, 100, nivelDefecto),
    claro: c.claro in PALETAS.claro ? c.claro : 'crema',
    oscuro: c.oscuro in PALETAS.oscuro ? c.oscuro : 'petroleo',
    escala: limitar(Math.round(num(c.escala, ESCALA.min, ESCALA.max, ESCALA.defecto) / ESCALA.paso) * ESCALA.paso, ESCALA.min, ESCALA.max),
  }
}

/** Tokens listos para aplicar según la apariencia elegida. */
export function tokensDe({ nivel, claro, oscuro }) {
  return mezclar(PALETAS.claro[claro].tokens, PALETAS.oscuro[oscuro].tokens, nivel)
}
