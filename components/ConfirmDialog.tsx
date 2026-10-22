'use client';

import { useCallback, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Diálogo de confirmación con el diseño de la app (reemplaza window.confirm).
//
// Uso:
//   const { confirm, confirmNode } = useConfirm();
//   const ok = await confirm({ title: 'Eliminar producto', message: '...', confirmText: 'Eliminar', danger: true });
//   if (!ok) return;
//   ...
//   return <>{confirmNode} ...</>;

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
    });
  }, []);

  const close = (value: boolean) => {
    if (resolver) resolver(value);
    setOptions(null);
    setResolver(null);
  };

  const confirmNode = options ? (
    <div className="modal-overlay" onClick={() => close(false)}>
      <div className="modal-content" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={20} style={{ color: options.danger ? '#dc2626' : 'var(--primary)' }} />
            <span>{options.title}</span>
          </h3>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>{options.message}</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
            {options.cancelText || 'Cancelar'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={options.danger ? { backgroundColor: '#dc2626', borderColor: '#dc2626' } : undefined}
            onClick={() => close(true)}
            autoFocus
          >
            {options.confirmText || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, confirmNode };
}

// Variante declarativa para casos simples sin async/await.
export function Spinner() {
  return <Loader2 size={16} className="spin" />;
}
