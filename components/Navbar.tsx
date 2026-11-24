'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Shield, HelpCircle, Activity } from 'lucide-react';

interface NavbarProps {
  title: string;
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Inicio',
  '/dashboard/ventas': 'Punto de Venta',
  '/dashboard/cierre-z': 'Comprobantes y Cierre de Caja',
  '/dashboard/egresos': 'Egresos',
  '/dashboard/productos': 'Productos y Stock',
  '/dashboard/productos-destacados': 'Productos Destacados',
  '/dashboard/clientes': 'Clientes',
  '/dashboard/proveedores': 'Proveedores',
  '/dashboard/servicio': 'Servicio técnico',
  '/dashboard/repuestos': 'Repuestos',
  '/dashboard/repuestos/importar': 'Cargar repuestos desde Excel',
  '/dashboard/catalogo': 'Catálogo',
  '/dashboard/costos/importar': 'Importar lista de precios',
  '/dashboard/costos/importaciones': 'Historial de listas',
  '/dashboard/costos/precios': 'Precios para aprobar',
  '/dashboard/costos/margenes': 'Ganancia y precios',
  '/dashboard/costos/dolar': 'Cotización del dólar',
  '/dashboard/costos/grilla': 'Edición rápida de costos',
  '/dashboard/costos/estado': 'Estado de costos',
  '/dashboard/costos/comparador': 'Comparador de proveedores',
  '/dashboard/cuentas-corrientes': 'Cuentas Corrientes',
  '/dashboard/rentabilidad': 'Ganancia Real',
  '/dashboard/reportes': 'Reportes',
  '/dashboard/estadisticas-talles': 'Estadísticas: Talles',
  '/dashboard/estadisticas-mensuales': 'Estadísticas Mensuales',
  '/dashboard/estadisticas-proveedores': 'Estadísticas de Proveedores',
  '/dashboard/usuarios': 'Personal y Caja',
  '/dashboard/config-afip': 'Configuración AFIP',
};

export default function Navbar({ title }: NavbarProps) {
  const [session, setSession] = useState<any>(null);
  const pathname = usePathname();

  // Use the most specific matching route so sub-pages (e.g. /dashboard/ventas/123) inherit their section title.
  const resolvedTitle =
    PAGE_TITLES[pathname] ??
    Object.entries(PAGE_TITLES)
      .filter(([route]) => pathname.startsWith(route + '/'))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ??
    title;

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (data.authenticated) {
          setSession(data.user);
        }
      } catch (err) {
        console.error('Error fetching session in navbar:', err);
      }
    }
    fetchSession();
  }, []);

  const renderAfipBadge = () => {
    if (!session || session.rol === 'SUPERADMIN') return null;

    const config = session.empresa?.configAfip;
    
    if (!config || !config.hasCert) {
      return (
        <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <HelpCircle size={14} />
          <span>AFIP: NO CONFIGURADO (DEMO INTERNA)</span>
        </span>
      );
    }

    if (config.modo === 'demo') {
      return (
        <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <HelpCircle size={14} />
          <span>AFIP: MODO DEMO</span>
        </span>
      );
    }

    if (config.modo === 'homologacion') {
      return (
        <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Activity size={14} />
          <span>AFIP: HOMOLOGACIÓN (TESTING)</span>
        </span>
      );
    }

    if (config.modo === 'produccion') {
      return (
        <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Activity size={14} />
          <span>AFIP: PRODUCCIÓN (REAL)</span>
        </span>
      );
    }

    return null;
  };

  return (
    <header className="navbar">
      <div>
        <div className="navbar-title">{resolvedTitle}</div>
        {session?.empresa?.nombre && (
          <span className="navbar-subtitle">{session.empresa.nombre}</span>
        )}
      </div>
      <div className="navbar-actions">
        {renderAfipBadge()}
      </div>
    </header>
  );
}
