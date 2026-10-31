import { useMemo, useState } from 'react'
import { ScanLine, Plus, Minus, X } from 'lucide-react'
import { Button, IconButton, Input, Mono, EmptyState } from '@/components/ui'

/**
 * Selector de materiales para la PWA: escáner (lector tipo teclado o botón demo), búsqueda y
 * cantidades con botones de 56 px. `lineas` = [{articulo:{id,sku,nombre,unidad}, cantidad}].
 */
export function MaterialPicker({ catalogo, lineas, onChange, vacio = 'Escanea o busca un código para agregarlo.' }) {
  const [busqueda, setBusqueda] = useState('')
  const sugerencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (q.length < 2) return []
    return catalogo.filter((a) => (a.sku.toLowerCase().includes(q) || a.nombre.toLowerCase().includes(q)) && !lineas.some((l) => l.articulo.id === a.id)).slice(0, 5)
  }, [busqueda, catalogo, lineas])

  const agregar = (a) => {
    if (!lineas.some((l) => l.articulo.id === a.id)) onChange([...lineas, { articulo: a, cantidad: 1 }])
    setBusqueda('')
  }
  const onEnter = (e) => {
    if (e.key !== 'Enter') return
    // Un lector de código de barras tipo teclado termina con Enter: SKU exacto.
    const exacto = catalogo.find((a) => a.sku.toLowerCase() === busqueda.trim().toLowerCase())
    if (exacto) agregar(exacto)
    else if (sugerencias.length === 1) agregar(sugerencias[0])
  }
  const simularEscaneo = () => {
    const libres = catalogo.filter((a) => !lineas.some((l) => l.articulo.id === a.id))
    if (libres.length) agregar(libres[Math.floor(Math.random() * libres.length)])
  }
  const cambiar = (id, delta) => onChange(lineas.map((l) => (l.articulo.id === id ? { ...l, cantidad: Math.max(1, l.cantidad + delta) } : l)))

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <Input size="lg" mono className="flex-1" label="Escanear o buscar" placeholder="SKU o nombre" value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)} onKeyDown={onEnter} autoComplete="off" />
        <Button type="button" size="lg" variant="secondary" icon={ScanLine} className="shrink-0" onClick={simularEscaneo}>Escanear</Button>
      </div>
      {sugerencias.map((a) => (
        <button key={a.id} type="button" onClick={() => agregar(a)} className="card flex min-h-14 w-full items-center justify-between px-4 py-2 text-left active:bg-slate-50">
          <span><span className="block text-base font-medium">{a.nombre}</span><Mono className="text-sm text-ink-soft">{a.sku}</Mono></span>
          <Plus className="h-5 w-5 text-brand" />
        </button>
      ))}
      {lineas.length === 0 && <div className="card"><EmptyState icon={ScanLine} title="Sin materiales" hint={vacio} /></div>}
      {lineas.map(({ articulo, cantidad }) => (
        <div key={articulo.id} className="card p-3">
          <div className="flex items-start justify-between gap-2">
            <div><p className="text-base font-medium">{articulo.nombre}</p><Mono className="text-sm text-ink-soft">{articulo.sku} · {articulo.unidad}</Mono></div>
            <IconButton icon={X} label="Quitar de la lista" size="sm" onClick={() => onChange(lineas.filter((l) => l.articulo.id !== articulo.id))} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Button type="button" variant="secondary" size="lg" className="w-16" icon={Minus} aria-label="Menos" onClick={() => cambiar(articulo.id, -1)} />
            <Mono className="text-2xl font-semibold">{cantidad}</Mono>
            <Button type="button" variant="secondary" size="lg" className="w-16" icon={Plus} aria-label="Más" onClick={() => cambiar(articulo.id, 1)} />
          </div>
        </div>
      ))}
    </div>
  )
}
