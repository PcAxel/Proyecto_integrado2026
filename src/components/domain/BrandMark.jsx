/**
 * Logo original de Frío y Agroindustria SpA. Sus tonos azul marino se pierden sobre fondos oscuros,
 * por eso va sobre una placa blanca (`placa`), que es como se usa en la barra lateral y el login.
 */
export function BrandMark({ height = 40, placa = false, className = '' }) {
  const img = <img src="/logo-fyag.png" alt="Frío y Agroindustria SpA" style={{ height }} className="w-auto select-none" draggable={false} />
  if (!placa) return <span className={className}>{img}</span>
  return <span className={`inline-flex items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5 ${className}`} style={{ padding: Math.round(height * 0.12) }}>{img}</span>
}
