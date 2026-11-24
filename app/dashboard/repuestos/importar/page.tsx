'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, FileUp, Loader2 } from 'lucide-react';
import { useModuloCostos, ModuloCostosInactivo } from '@/components/costos/useModuloCostos';
import Carga from '../../costos/importar/Carga';
import VistaPrevia from '../../costos/importar/VistaPrevia';

// Cargar repuestos desde el Excel del proveedor, desde la pantalla Repuestos.
// Los precios se toman tal cual: precio de lista, efectivo y tarjeta.
function Contenido() {
  const id = useSearchParams().get('id');
  const modulo = useModuloCostos();

  if (modulo.cargando) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>;
  if (!modulo.activo || !modulo.esDueno) return <ModuloCostosInactivo />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileUp size={26} style={{ color: 'var(--primary)' }} />
            <span>{id ? 'Revisar repuestos antes de cargar' : 'Cargar repuestos desde Excel'}</span>
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            {id
              ? 'Nada se guarda hasta que apliques. Los precios son los del Excel, tal cual.'
              : 'Elegí el proveedor y subí el Excel. Se cargan tal cual: precio de lista, efectivo y tarjeta.'}
          </p>
        </div>
        <Link href="/dashboard/repuestos" className="btn btn-secondary"><ArrowLeft size={16} /> Volver a Repuestos</Link>
      </div>
      {id ? <VistaPrevia id={id} modo="repuestos" /> : <Carga empresaId={modulo.empresaId} modo="repuestos" />}
    </div>
  );
}

export default function ImportarRepuestosPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>}>
      <Contenido />
    </Suspense>
  );
}
