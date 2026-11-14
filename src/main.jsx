import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/app/router'
import { Providers } from '@/app/providers'
import { iniciarCapturaInstalacion } from '@/lib/pwaInstall'
import { mostrarAvisoApex } from '@/lib/marcaApex'
import '@/styles/index.css'

iniciarCapturaInstalacion()
mostrarAvisoApex() // aviso de propiedad intelectual en la consola del navegador

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </React.StrictMode>,
)
