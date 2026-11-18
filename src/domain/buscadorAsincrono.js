/**
 * Lógica del buscador asíncrono (sin interfaz, para poder probarla): espera a que la persona deje de escribir (`esperaMs`) y recién entonces consulta
 * al servidor; si llegan respuestas fuera de orden, descarta las viejas (siempre manda la de la última búsqueda escrita).
 * @param {{buscar:(texto:string)=>Promise<any[]>, esperaMs?:number, alCargar:(cargando:boolean)=>void, alResultado:(items:any[])=>void, alError:(e:Error)=>void}} p
 */
export function crearBuscador({ buscar, esperaMs = 250, alCargar, alResultado, alError }) {
  let temporizador = null
  let ultima = 0
  const cancelar = () => { clearTimeout(temporizador); temporizador = null; ultima += 1 }
  return {
    /** @param {string} texto @param {{inmediato?:boolean}} [opciones] `inmediato`: sin esperar (al abrir el campo). */
    consultar(texto, { inmediato = false } = {}) {
      clearTimeout(temporizador)
      const mia = ++ultima
      alCargar(true)
      temporizador = setTimeout(async () => {
        try {
          const items = await buscar(texto)
          if (mia === ultima) { alResultado(items); alCargar(false) }
        } catch (e) {
          if (mia === ultima) { alError(e); alCargar(false) }
        }
      }, inmediato ? 0 : esperaMs)
    },
    cancelar,
  }
}
