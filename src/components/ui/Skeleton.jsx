export function Skeleton({ rows = 3 }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-slate-100" style={{ width: `${95 - ((i * 13) % 35)}%` }} />
      ))}
    </div>
  )
}
