import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireRole } from './RequireRole'
import { ErpLayout } from '@/layouts/ErpLayout'
import { PwaLayout } from '@/layouts/PwaLayout'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardPage } from '@/features/erp/dashboard/DashboardPage'
import { HomePage } from '@/features/pwa/home/HomePage'
import { BodegaPage } from '@/features/erp/bodega/BodegaPage'
import { ComprasPage } from '@/features/erp/compras/ComprasPage'
import { PresupuestosPage } from '@/features/erp/presupuestos/PresupuestosPage'
import { PresupuestoEditor } from '@/features/erp/presupuestos/PresupuestoEditor'
import { ObrasPage } from '@/features/erp/obras/ObrasPage'
import { ObraForm } from '@/features/erp/obras/ObraForm'
import { ObraDetalle } from '@/features/erp/obras/ObraDetalle'
import { HojaServicioPage } from '@/features/pwa/hoja-servicio/HojaServicioPage'
import { AsistenciaPage } from '@/features/pwa/asistencia/AsistenciaPage'
import { SyncPage } from '@/features/pwa/sync/SyncPage'
import { TerrenoPage } from '@/features/erp/terreno/TerrenoPage'
import { PersonalPage } from '@/features/erp/personal/PersonalPage'
import { MaestrosPage } from '@/features/erp/maestros/MaestrosPage'
import { AuditoriaPage } from '@/features/erp/auditoria/AuditoriaPage'
import { UsuariosList } from '@/features/erp/usuarios/UsuariosList'
import { RetiroPage } from '@/features/pwa/retiro/RetiroPage'


export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/erp',
    element: (
      <RequireRole accion="dashboard.ver">
        <ErpLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'presupuestos', element: <RequireRole accion="presupuestos.ver"><PresupuestosPage /></RequireRole> },
      { path: 'presupuestos/nuevo', element: <RequireRole accion="presupuestos.crear"><PresupuestoEditor /></RequireRole> },
      { path: 'presupuestos/:id', element: <RequireRole accion="presupuestos.ver"><PresupuestoEditor /></RequireRole> },
      { path: 'obras', element: <RequireRole accion="obras.ver"><ObrasPage /></RequireRole> },
      { path: 'obras/nueva', element: <RequireRole accion="obras.crear"><ObraForm /></RequireRole> },
      { path: 'obras/:id', element: <RequireRole accion="obras.ver"><ObraDetalle /></RequireRole> },
      { path: 'terreno', element: <RequireRole accion="terreno.ver"><TerrenoPage /></RequireRole> },
      { path: 'personal', element: <RequireRole accion="personal.ver"><PersonalPage /></RequireRole> },
      { path: 'maestros', element: <RequireRole accion="maestros.ver"><MaestrosPage /></RequireRole> },
      { path: 'auditoria', element: <RequireRole accion="auditoria.ver"><AuditoriaPage /></RequireRole> },
      { path: 'usuarios', element: <RequireRole accion="usuarios.ver"><UsuariosList /></RequireRole> },
      { path: 'bodega', element: <RequireRole accion="bodega.ver"><BodegaPage /></RequireRole> },
      { path: 'compras', element: <RequireRole accion="compras.ver"><ComprasPage /></RequireRole> },
    ],
  },
  {
    path: '/app',
    element: (
      <RequireRole accion="pwa.usar">
        <PwaLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'asistencia', element: <AsistenciaPage /> },
      { path: 'hoja-servicio', element: <HojaServicioPage /> },
      { path: 'retiro', element: <RetiroPage /> },
      { path: 'sync', element: <SyncPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
])
