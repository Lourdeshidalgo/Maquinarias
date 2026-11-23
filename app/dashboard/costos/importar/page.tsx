'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FileUp, History, Loader2, Scale } from 'lucide-react';
import { useModuloCostos, ModuloCostosInactivo } from '@/components/costos/useModuloCostos';
import Carga from './Carga';
import VistaPrevia from './VistaPrevia';

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
            <span>{id ? 'Revisar cambios de la lista' : 'Importar lista de precios'}</span>
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            {id
              ? 'Nada se modifica hasta que apliques. Revisá las subas, bajas, nuevos y los marcados para revisar.'
              : 'Subí la lista del proveedor y el sistema detecta qué costos cambiaron.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/dashboard/costos/comparador" className="btn btn-secondary">
            <Scale size={16} /> Comparar proveedores
          </Link>
          <Link href="/dashboard/costos/importaciones" className="btn btn-secondary">
            <History size={16} /> Historial de importaciones
          </Link>
        </div>
      </div>
      {id ? <VistaPrevia id={id} /> : <Carga empresaId={modulo.empresaId} />}
    </div>
  );
}

export default function ImportarListaPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>}>
      <Contenido />
    </Suspense>
  );
}
