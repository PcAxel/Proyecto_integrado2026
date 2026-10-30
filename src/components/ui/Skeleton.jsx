/** Marcador de carga con brillo que recorre las barras (se detiene con «reducir movimiento»). */
export function Skeleton({ rows = 3 }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="relative h-4 overflow-hidden rounded bg-slate-100" style={{ width: `${95 - ((i * 13) % 35)}%` }}>
          <div className="absolute inset-y-0 -left-full w-full animate-shimmer bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        </div>
      ))}
    </div>
  )
}
