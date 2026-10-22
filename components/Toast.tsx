'use client';

import { useCallback, useRef, useState } from 'react';
import { AlertOctagon, Info, CheckCircle2 } from 'lucide-react';

// Avisos no bloqueantes, al estilo del POS: aparecen arriba en el centro y se
// van solos. Reemplazan a los window.alert()/confirm() del navegador para que
// toda la app se vea igual de prolija.
//
// Uso:
//   const { toast, toastNode } = useToast();
//   toast('Guardado con éxito', 'success');
//   ...
//   return <>{toastNode} ...</>;

export type ToastType = 'error' | 'info' | 'success';

export type ToastState = { type: ToastType; msg: string } | null;

export function useToast(durationMs = 3200) {
  const [toast, setToast] = useState<ToastState>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (msg: string, type: ToastType = 'info') => {
      setToast({ type, msg });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setToast(null), durationMs);
    },
    [durationMs]
  );

  const toastNode = <Toast state={toast} onClose={() => setToast(null)} />;

  return { toast, showToast, toastNode, setToast };
}

export function Toast({ state, onClose }: { state: ToastState; onClose: () => void }) {
  if (!state) return null;

  const isError = state.type === 'error';
  const isSuccess = state.type === 'success';

  return (
    <div className="pos-toast" role="alert" aria-live="assertive">
      <div
        className={`pos-toast-inner ${
          isError ? 'pos-toast-error' : isSuccess ? 'pos-toast-success' : 'pos-toast-info'
        }`}
      >
        {isError ? (
          <AlertOctagon size={18} style={{ flex: '0 0 auto' }} />
        ) : isSuccess ? (
          <CheckCircle2 size={18} style={{ flex: '0 0 auto' }} />
        ) : (
          <Info size={18} style={{ flex: '0 0 auto' }} />
        )}
        <span>{state.msg}</span>
        <button type="button" onClick={onClose} className="pos-toast-close" aria-label="Cerrar aviso">
          ×
        </button>
      </div>
    </div>
  );
}
