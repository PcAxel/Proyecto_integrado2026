import { describe, it, expect } from 'vitest'
import { detectarPlataforma, estaInstalada, modoInstalacion } from '../plataforma'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1',
  iphoneGoogle: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/300.0 Mobile/15E148 Safari/604.1',
  ipadOs13: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
}

describe('plataforma: detección', () => {
  it('iPhone con Safari', () => expect(detectarPlataforma({ userAgent: UA.iphoneSafari })).toEqual({ os: 'ios', safari: true, ipad: false }))
  it('iPhone con Chrome o app de Google no es Safari', () => {
    expect(detectarPlataforma({ userAgent: UA.iphoneChrome }).safari).toBe(false)
    expect(detectarPlataforma({ userAgent: UA.iphoneGoogle }).safari).toBe(false)
  })
  it('iPadOS 13+ se detecta aunque se presente como Mac', () => {
    expect(detectarPlataforma({ userAgent: UA.ipadOs13, platform: 'MacIntel', maxTouchPoints: 5 })).toEqual({ os: 'ios', safari: true, ipad: true })
  })
  it('un Mac real (sin pantalla táctil) no es iOS', () => {
    expect(detectarPlataforma({ userAgent: UA.macSafari, platform: 'MacIntel', maxTouchPoints: 0 }).os).toBe('otro')
  })
  it('Android', () => expect(detectarPlataforma({ userAgent: UA.androidChrome }).os).toBe('android'))
  it('sin datos no falla', () => expect(detectarPlataforma().os).toBe('otro'))
})

describe('plataforma: modo de instalación', () => {
  const android = { os: 'android', safari: false, ipad: false }
  const iosSafari = { os: 'ios', safari: true, ipad: false }
  const iosChrome = { os: 'ios', safari: false, ipad: false }
  it('ya instalada gana sobre todo', () => {
    expect(estaInstalada({ displayStandalone: true })).toBe(true)
    expect(estaInstalada({ navigatorStandalone: true })).toBe(true)
    expect(estaInstalada({})).toBe(false)
    expect(modoInstalacion({ plataforma: iosSafari, instalada: true, promptDisponible: false })).toBe('instalada')
  })
  it('Android con prompt → botón nativo; sin prompt → manual', () => {
    expect(modoInstalacion({ plataforma: android, instalada: false, promptDisponible: true })).toBe('prompt')
    expect(modoInstalacion({ plataforma: android, instalada: false, promptDisponible: false })).toBe('manual')
  })
  it('iOS: Safari → guía; otro navegador → abrir en Safari (aunque haya prompt)', () => {
    expect(modoInstalacion({ plataforma: iosSafari, instalada: false, promptDisponible: false })).toBe('guia-ios')
    expect(modoInstalacion({ plataforma: iosChrome, instalada: false, promptDisponible: true })).toBe('abrir-en-safari')
  })
})
