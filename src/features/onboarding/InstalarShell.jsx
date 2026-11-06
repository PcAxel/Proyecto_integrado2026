import { BrandMark } from '@/components/domain'

/** Marco común de las pantallas del flujo de instalación. */
export function InstalarShell({ titulo, subtitulo, children, ancho = 'max-w-md' }) {
  return (
    <main className="flex min-h-full items-center justify-center bg-gradient-to-br from-deep via-deep to-[#081E2C] px-4 py-10">
      <div className={`w-full ${ancho}`}>
        <div className="mb-6 flex justify-center"><BrandMark height={64} placa /></div>
        <div className="card p-6 sm:p-8">
          <h1 className="t-display text-[1.9rem] leading-tight">{titulo}</h1>
          {subtitulo && <p className="mt-2 text-sm text-ink-soft">{subtitulo}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  )
}
