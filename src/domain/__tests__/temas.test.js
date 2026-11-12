import { describe, expect, it } from 'vitest'
import { PALETAS, ESCALA, esNoche, mezclar, normalizarApariencia, tokensDe } from '../temas'

const { crema, hielo } = PALETAS.claro
const { petroleo, medianoche } = PALETAS.oscuro

describe('paletas', () => {
  it('las cuatro definen exactamente los mismos tokens (si falta uno, la mezcla dejaría un color sin valor)', () => {
    const base = Object.keys(crema.tokens).sort()
    for (const p of [hielo, petroleo, medianoche]) expect(Object.keys(p.tokens).sort()).toEqual(base)
  })
  it('todos los valores son ternas r g b entre 0 y 255', () => {
    for (const p of [crema, hielo, petroleo, medianoche]) {
      for (const v of Object.values(p.tokens)) expect(v).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/) && v.split(' ').forEach((n) => expect(Number(n)).toBeLessThanOrEqual(255))
    }
  })
})

describe('mezclar (barra día ↔ noche)', () => {
  it('en 0 es la paleta clara y en 100 la oscura, sin restos', () => {
    expect(mezclar(crema.tokens, petroleo.tokens, 0)).toEqual(crema.tokens)
    expect(mezclar(crema.tokens, petroleo.tokens, 100)).toEqual(petroleo.tokens)
  })
  it('los fondos avanzan de forma progresiva', () => {
    const f = (n) => Number(mezclar(crema.tokens, petroleo.tokens, n).canvas.split(' ')[0])
    expect(f(0)).toBeGreaterThan(f(25)); expect(f(25)).toBeGreaterThan(f(50)); expect(f(50)).toBeGreaterThan(f(75)); expect(f(75)).toBeGreaterThan(f(100))
  })
  it('el texto sigue claro/oscuro hasta cerca del centro y cambia en una franja angosta', () => {
    const ink = (n) => mezclar(crema.tokens, petroleo.tokens, n).ink
    expect(ink(40)).toBe(crema.tokens.ink)
    expect(ink(60)).toBe(petroleo.tokens.ink)
    expect(ink(50)).not.toBe(ink(40))
  })
  it('un nivel fuera de rango se acota', () => {
    expect(mezclar(crema.tokens, petroleo.tokens, -20)).toEqual(crema.tokens)
    expect(mezclar(crema.tokens, petroleo.tokens, 900)).toEqual(petroleo.tokens)
  })
  it('tokensDe usa las paletas elegidas', () => {
    expect(tokensDe({ nivel: 0, claro: 'hielo', oscuro: 'medianoche' })).toEqual(hielo.tokens)
    expect(tokensDe({ nivel: 100, claro: 'hielo', oscuro: 'medianoche' })).toEqual(medianoche.tokens)
  })
  it('esNoche cambia en la mitad', () => { expect([esNoche(49), esNoche(50)]).toEqual([false, true]) })
})

describe('normalizarApariencia', () => {
  it('sin datos usa los defectos (y el nivel que pide el marco)', () => {
    expect(normalizarApariencia(null)).toEqual({ nivel: 100, claro: 'crema', oscuro: 'petroleo', escala: 100 })
    expect(normalizarApariencia(undefined, 0).nivel).toBe(0)
  })
  it('descarta valores inválidos y acota los números', () => {
    const a = normalizarApariencia({ nivel: 'x', claro: 'rosa', oscuro: 5, escala: 500 }, 40)
    expect(a).toEqual({ nivel: 40, claro: 'crema', oscuro: 'petroleo', escala: ESCALA.max })
    expect(normalizarApariencia({ nivel: -5, escala: 10 })).toMatchObject({ nivel: 0, escala: ESCALA.min })
  })
  it('la letra se ajusta al paso de la barra', () => { expect(normalizarApariencia({ escala: 112 }).escala).toBe(110) })
  it('conserva lo válido', () => {
    expect(normalizarApariencia({ nivel: 30, claro: 'hielo', oscuro: 'medianoche', escala: 120 })).toEqual({ nivel: 30, claro: 'hielo', oscuro: 'medianoche', escala: 120 })
  })
})
