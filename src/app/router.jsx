import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppGate } from './AppGate'
import { RequireRole } from './RequireRole'
import { RoleProtectedRoute } from './RoleProtectedRoute'
import { RequireInstalacion } from './RequireInstalacion'
import { LoginPage } from '@/features/auth/LoginPage'
import { InstalarPage } from '@/features/onboarding/InstalarPage'
import { TerminosPage } from '@/features/onboarding/TerminosPage'
import { DescargaPage } from '@/features/onboarding/DescargaPage'
import { UsuariosList } from '@/features/erp/usuarios/UsuariosList'
import { EvidenciaPage } from '@/features/pwa/evidencia/EvidenciaPage'
import { ErpLayout } from '@/layouts/ErpLayout'
import { PwaLayout } from '@/layouts/PwaLayout'
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
import { DocumentosPage } from '@/features/pwa/firma/DocumentosPage'
import { VistaFirmaDocumento } from '@/features/pwa/firma/VistaFirmaDocumento'
import { SyncPage } from '@/features/pwa/sync/SyncPage'
import { TerrenoPage } from '@/features/erp/terreno/TerrenoPage'
import { PersonalPage } from '@/features/erp/personal/PersonalPage'
import { ModuloRRHH } from '@/features/erp/rrhh/ModuloRRHH'
import { ModuloFinanzas } from '@/features/erp/rrhh/ModuloFinanzas'
import { MaestrosPage } from '@/features/erp/maestros/MaestrosPage'
import { AuditoriaPage } from '@/features/erp/auditoria/AuditoriaPage'
import { RetiroPage } from '@/features/pwa/retiro/RetiroPage'

/**
 * Todas las rutas cuelgan de AppGate: sin servidor no hay pantalla alguna.
 * /erp solo para Admin, Finanzas, Operaciones y RRHH; /app solo para el Técnico (el servidor valida igual cada llamada).
 */
export const router = createBrowserRouter([
  {
    element: <AppGate />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
      { path: '/login', element: <LoginPage /> },
      // Flujo de instalación (link del correo): login 2FA → términos → descarga. Estado real en Django.
      { path: '/instalar', element: <InstalarPage /> },
      { path: '/instalar/terminos', element: <RequireInstalacion nivel="sesion"><TerminosPage /></RequireInstalacion> },
      { path: '/instalar/descarga', element: <RequireInstalacion nivel="terminos"><DescargaPage /></RequireInstalacion> },
      {
        path: '/erp',
        element: (
          <RoleProtectedRoute allowedRoles={['ADMIN', 'FINANZAS', 'OPERACIONES', 'RRHH']}>
            <RequireRole accion="dashboard.ver">
              <ErpLayout />
            </RequireRole>
          </RoleProtectedRoute>
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
          { path: 'rrhh', element: <RequireRole accion="rrhh.ver"><ModuloRRHH /></RequireRole> },
          { path: 'finanzas', element: <RequireRole accion="finiquitos.ver"><ModuloFinanzas /></RequireRole> },
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
          <RoleProtectedRoute allowedRoles={['TECNICO']}>
            <RequireRole accion="pwa.usar">
              <PwaLayout />
            </RequireRole>
          </RoleProtectedRoute>
        ),
        children: [
          { index: true, element: <HomePage /> },
          { path: 'asistencia', element: <AsistenciaPage /> },
          { path: 'hoja-servicio', element: <HojaServicioPage /> },
          { path: 'retiro', element: <RetiroPage /> },
          { path: 'evidencia', element: <EvidenciaPage /> },
          { path: 'documentos', element: <DocumentosPage /> },
          { path: 'documentos/:id', element: <VistaFirmaDocumento /> },
          { path: 'sync', element: <SyncPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/login" replace /> },
    ],
  },
])
