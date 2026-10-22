'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import {

  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  FileText,
  Printer,
  RotateCcw,
  Save,
  Search,
} from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';
import { formatMoney, formatMoneyString, todayArgentina } from '@/lib/format';

type CierreHistorial = {
  id: string;
  tipo: 'X' | 'Z';
  fecha: string;
  emitidoAt: string;
  cerradoAt?: string | null;
  concepto: string;
  montoInicial: number;
  facturadoTotal: number;
  efectivoNeto: number;
  egresosTotal: number;
  egresosEfectivo: number;
  totalCaja: number;
  cantidadComprobantes: number;
};

type CierreZData = {
  id: string;
  fecha: string;
  montoInicial: number;
  facturadoTotal: number;
  efectivoNeto: number;
  egresosTotal: number;
  egresosEfectivo: number;
  totalCaja: number;
  cerrado: boolean;
  cerradoAt?: string | null;
  concepto: string;
  porFormaPago: Record<string, number>;
  egresosPorFormaPago: Record<string, number>;
  cantidadComprobantes: number;
  historial: CierreHistorial[];
  ventas: Array<{
    id: string;
    fecha: string;
    tipoComprobante: string;
    puntoVenta: number;
    numeroComprobante: number;
    formaPago: string;
    total: number;
    signedTotal: number;
    cliente: string;
  }>;
  egresos: Array<{
    id: string;
    fecha: string;
    proveedor: string;
    categoria: string;
    concepto: string;
    formaPago: string;
    monto: number;
    usuario: string;
  }>;
};

type Venta = {
  id: string;
  fecha: string;
  tipoComprobante: string;
  puntoVenta: number;
  numeroComprobante: number;
  total: string;
  formaPago: string;
  estado: string;
  cae?: string | null;
  mensajeAfip?: string | null;
  ventaOrigenId?: string | null;
  cliente?: {
    razonSocial: string;
    tipoDoc: string;
    nroDoc: string;
    condicionIva?: string;
    direccion?: string;
    email?: string;
  };
  items?: Array<{ id: string }>;
};

function formatCierreVoucherNumber(venta: CierreZData['ventas'][number]) {
  return `${venta.puntoVenta.toString().padStart(4, '0')}-${venta.numeroComprobante.toString().padStart(8, '0')}`;
}

function formatVoucherNumber(venta: Venta) {
  return `${venta.puntoVenta.toString().padStart(4, '0')}-${venta.numeroComprobante.toString().padStart(8, '0')}`;
}

function getEstadoBadge(estado: string) {
  if (estado === 'COMPLETADO') return 'badge-success';
  if (estado === 'DEMO') return 'badge-warning';
  if (estado === 'RECHAZADO_AFIP') return 'badge-danger';
  return 'badge-info';
}

export default function CierreZPage() {
  const { confirm, confirmNode } = useConfirm();
  // ---- Estado de la caja del día ----
  const [fecha, setFecha] = useState(todayArgentina());
  const [data, setData] = useState<CierreZData | null>(null);
  const [montoInicial, setMontoInicial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closingType, setClosingType] = useState<'X' | 'Z' | null>(null);
  const [error, setError] = useState('');

  // ---- Estado del historial de comprobantes ----
  const [session, setSession] = useState<any>(null);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loadingVentas, setLoadingVentas] = useState(true);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('TODOS');
  const [issuingCreditNoteId, setIssuingCreditNoteId] = useState('');

  // Nota de crédito (modal)
  const [creditNoteFor, setCreditNoteFor] = useState<Venta | null>(null);
  const [creditNoteAmount, setCreditNoteAmount] = useState('');
  const [creditNoteError, setCreditNoteError] = useState('');
  const [submittingCreditNote, setSubmittingCreditNote] = useState(false);

  // Facturación a demanda (Ticket X -> Factura fiscal)
  const [facturarTicket, setFacturarTicket] = useState<Venta | null>(null);
  const [facturarTipo, setFacturarTipo] = useState('auto');
  const [facturarTipoDoc, setFacturarTipoDoc] = useState('CUIT');
  const [facturarNroDoc, setFacturarNroDoc] = useState('');
  const [facturarRazonSocial, setFacturarRazonSocial] = useState('');
  const [facturarCondicionIva, setFacturarCondicionIva] = useState('Responsable Inscripto');
  const [facturarDireccion, setFacturarDireccion] = useState('');
  const [facturarEmail, setFacturarEmail] = useState('');
  const [submittingFactura, setSubmittingFactura] = useState(false);

  const loadCierre = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/tenant/cierre-z?fecha=${fecha}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo cargar el cierre Z.');
      }

      setData(result);
      setMontoInicial(String(result.montoInicial));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadVentas = async () => {
    setLoadingVentas(true);
    try {
      const ventasRes = await fetch('/api/tenant/ventas');
      if (!ventasRes.ok) {
        const result = await ventasRes.json().catch(() => ({}));
        throw new Error(result.error || 'No se pudo cargar el historial de comprobantes.');
      }
      const ventasData = await ventasRes.json();
      setVentas(Array.isArray(ventasData) ? ventasData : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingVentas(false);
    }
  };

  useEffect(() => {
    loadCierre();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch('/api/auth/session');
        const sessionData = await res.json();
        if (sessionData.authenticated) {
          setSession(sessionData.user);
        }
      } catch (err) {
        console.error('Error fetching session:', err);
      }
    }
    loadSession();
    loadVentas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveMontoInicial = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/tenant/cierre-z', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, montoInicial }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo actualizar el monto inicial.');
      }

      await loadCierre();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEmitirCierre = async (tipo: 'X' | 'Z') => {
    const confirmed = await confirm({
      title: tipo === 'Z' ? 'Emitir Cierre Z' : 'Emitir Cierre X',
      message:
        tipo === 'Z'
          ? 'Vas a emitir el comprobante de Cierre Z del día. Una vez emitido, quedará guardado, se imprimirá y no se podrán registrar más ventas en esta jornada. ¿Continuar?'
          : 'Vas a emitir un comprobante de Cierre X de control. Quedará guardado e imprimible, pero la jornada seguirá abierta para vender. ¿Continuar?',
      confirmText: tipo === 'Z' ? 'Emitir Cierre Z' : 'Emitir Cierre X',
      danger: tipo === 'Z',
    });
    if (!confirmed) return;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<p style="font-family: sans-serif; padding: 24px;">Generando comprobante de Cierre ${tipo}...</p>`);
      printWindow.document.close();
    }

    setClosingType(tipo);
    setError('');

    try {
      const response = await fetch('/api/tenant/cierre-z', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, tipo }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `No se pudo emitir el cierre ${tipo}.`);
      }
      await loadCierre();
      const printUrl = `/dashboard/cierre-z/${result.id}/print`;
      if (printWindow) {
        printWindow.location.href = printUrl;
      } else {
        window.location.href = printUrl;
      }
    } catch (err: any) {
      if (printWindow) {
        printWindow.close();
      }
      setError(err.message);
    } finally {
      setClosingType(null);
    }
  };

  // ---- Lógica de comprobantes ----
  const creditNotesFor = (venta: Venta) => {
    return ventas.filter((item) =>
      item.tipoComprobante.startsWith('Nota de Crédito') &&
      item.mensajeAfip?.includes(`Comprobante original ID: ${venta.id}`)
    );
  };

  const creditedAmount = (venta: Venta) => {
    return creditNotesFor(venta).reduce((acc, item) => acc + Number(item.total), 0);
  };

  const remainingCreditAmount = (venta: Venta) => {
    return Math.max(0, Number(venta.total) - creditedAmount(venta));
  };

  const hasCreditNote = (venta: Venta) => creditNotesFor(venta).length > 0;

  const canIssueCreditNote = (venta: Venta) => {
    return (session?.rol === 'OWNER' || session?.rol === 'EMPLOYEE') &&
      venta.estado !== 'RECHAZADO_AFIP' &&
      venta.tipoComprobante.startsWith('Factura') &&
      remainingCreditAmount(venta) > 0.009;
  };

  const openCreditNoteModal = (venta: Venta) => {
    const remaining = remainingCreditAmount(venta);
    setCreditNoteFor(venta);
    setCreditNoteAmount(remaining.toFixed(2));
    setCreditNoteError('');
    setError('');
  };

  const handleSubmitCreditNote = async () => {
    if (!creditNoteFor) return;

    const remaining = remainingCreditAmount(creditNoteFor);
    const monto = Number(String(creditNoteAmount).replace(',', '.'));

    if (!Number.isFinite(monto) || monto <= 0) {
      setCreditNoteError('El monto de la nota de crédito debe ser mayor a cero.');
      return;
    }

    if (monto - remaining > 0.009) {
      setCreditNoteError(`El monto supera el saldo disponible para acreditar (${formatMoney(remaining)}).`);
      return;
    }

    setSubmittingCreditNote(true);
    setIssuingCreditNoteId(creditNoteFor.id);
    setCreditNoteError('');
    setError('');

    try {
      const response = await fetch(`/api/tenant/ventas/${creditNoteFor.id}/nota-credito`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo emitir la nota de crédito.');
      }

      setCreditNoteFor(null);
      setCreditNoteAmount('');
      await loadVentas();
      await loadCierre();
      window.open(`/dashboard/ventas/${result.venta.id}/print`, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setCreditNoteError(err.message);
    } finally {
      setSubmittingCreditNote(false);
      setIssuingCreditNoteId('');
    }
  };

  const facturaPara = (venta: Venta) => {
    return ventas.find((item) => item.ventaOrigenId === venta.id);
  };

  const canFacturarTicket = (venta: Venta) => {
    return (
      (session?.rol === 'OWNER' || session?.rol === 'EMPLOYEE') &&
      venta.tipoComprobante === 'Factura X' &&
      !facturaPara(venta)
    );
  };

  const openFacturarTicket = (venta: Venta) => {
    setFacturarTicket(venta);
    setFacturarTipo('auto');
    setFacturarTipoDoc(venta.cliente?.tipoDoc || 'CUIT');
    setFacturarNroDoc(venta.cliente?.nroDoc || '');
    setFacturarRazonSocial(venta.cliente?.razonSocial || '');
    setFacturarCondicionIva(venta.cliente?.condicionIva || 'Responsable Inscripto');
    setFacturarDireccion(venta.cliente?.direccion || '');
    setFacturarEmail(venta.cliente?.email || '');
    setError('');
  };

  const handleSubmitFacturar = async () => {
    if (!facturarTicket) return;

    if (!facturarNroDoc.trim() || !facturarRazonSocial.trim()) {
      setError('Completá documento y razón social del receptor para emitir la factura.');
      return;
    }

    setSubmittingFactura(true);
    setError('');

    try {
      const response = await fetch(`/api/tenant/ventas/${facturarTicket.id}/factura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoComprobante: facturarTipo === 'auto' ? undefined : facturarTipo,
          datosFacturacion: {
            tipoDoc: facturarTipoDoc,
            nroDoc: facturarNroDoc,
            razonSocial: facturarRazonSocial,
            condicionIva: facturarCondicionIva,
            direccion: facturarDireccion,
            email: facturarEmail,
          },
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo emitir la factura.');
      }

      setFacturarTicket(null);
      await loadVentas();
      await loadCierre();
      window.open(`/dashboard/ventas/${result.venta.id}/print`, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingFactura(false);
    }
  };

  const filteredVentas = useMemo(() => {
    const term = search.trim().toLowerCase();

    return ventas.filter((venta) => {
      const matchesEstado = estado === 'TODOS' || venta.estado === estado;
      const voucherNumber = formatVoucherNumber(venta);
      const cliente = venta.cliente?.razonSocial || '';
      const documento = venta.cliente?.nroDoc || '';
      const matchesSearch =
        !term ||
        cliente.toLowerCase().includes(term) ||
        documento.toLowerCase().includes(term) ||
        venta.tipoComprobante.toLowerCase().includes(term) ||
        voucherNumber.includes(term);

      return matchesEstado && matchesSearch;
    });
  }, [estado, search, ventas]);

  const totals = useMemo(() => {
    return filteredVentas.reduce(
      (acc, venta) => {
        if (venta.estado !== 'RECHAZADO_AFIP') {
          acc.total += venta.tipoComprobante.startsWith('Nota de Crédito') ? -Number(venta.total) : Number(venta.total);
        }
        acc.count += 1;
        return acc;
      },
      { count: 0, total: 0 }
    );
  }, [filteredVentas]);

  const cierreZEmitido = !!data?.cerrado;

  return (
    <div>
      {confirmNode}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ClipboardCheck size={26} style={{ color: 'var(--primary)' }} />
            <span>Comprobantes y Cierre de Caja</span>
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Cerrá la jornada, consultá el historial completo de comprobantes, reimprimí, facturá tickets y emití notas de crédito.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href="/dashboard/ventas" className="btn btn-primary">
            Emitir Nuevo
          </Link>
        </div>
      </div>

      {error && (
        <div className="no-print" style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* ============ SECCIÓN 1: CAJA DEL DÍA ============ */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem' }}>Caja del día</h3>
        <span style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
      </div>

      <div className="card no-print" style={{ marginBottom: '1.5rem' }}>
        <div className="form-row" style={{ alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <CalendarDays size={14} />
              <span>Día de caja</span>
            </label>
            <input className="form-input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Banknote size={14} />
              <span>Fondo fijo inicial para cambio</span>
            </label>
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              value={montoInicial}
              onChange={(e) => setMontoInicial(e.target.value)}
              disabled={loading || saving || cierreZEmitido}
            />
          </div>
          <button onClick={handleSaveMontoInicial} className="btn btn-secondary" disabled={loading || saving || cierreZEmitido}>
            <Save size={16} />
            <span>{saving ? 'Guardando...' : 'Guardar fondo'}</span>
          </button>
          <button onClick={() => handleEmitirCierre('X')} className="btn btn-secondary" disabled={loading || !!closingType || cierreZEmitido}>
            <FileText size={16} />
            <span>{closingType === 'X' ? 'Emitiendo...' : 'Emitir Cierre X'}</span>
          </button>
          <button onClick={() => handleEmitirCierre('Z')} className="btn btn-primary" disabled={loading || !!closingType || cierreZEmitido}>
            <CheckCircle2 size={16} />
            <span>{closingType === 'Z' ? 'Emitiendo...' : 'Emitir Cierre Z'}</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          {cierreZEmitido && <span className="badge badge-success">Jornada cerrada</span>}
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', flex: 1 }}>
            {data ? `${data.cantidadComprobantes} comprobante${data.cantidadComprobantes === 1 ? '' : 's'} en el día` : 'Cargando...'}
          </span>
          <button onClick={() => window.print()} className="btn btn-secondary btn-sm">
            <Printer size={14} />
            <span>Imprimir</span>
          </button>
          {data?.historial?.[0] && (
            <a href={`/dashboard/cierre-z/${data.historial[0].id}/print`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
              Último comprobante
            </a>
          )}
        </div>
      </div>

      {loading || !data ? (
        <p className="no-print" style={{ color: 'var(--text-muted)' }}>Calculando cierre de caja...</p>
      ) : (
        <div className="print-ticket" style={{ marginBottom: '2.5rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
              <h3 style={{ fontSize: '1.35rem' }}>Cierre Z - {new Date(`${data.fecha}T00:00:00-03:00`).toLocaleDateString('es-AR')}</h3>
              <span className={`badge ${data.cerrado ? 'badge-success' : 'badge-warning'}`}>
                {data.cerrado ? 'Cierre emitido' : 'Vista previa sin emitir'}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)' }}>{data.concepto}</p>
            {data.cerradoAt && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.35rem' }}>
                Emitido manualmente el {new Date(data.cerradoAt).toLocaleString('es-AR')}.
              </p>
            )}
          </div>

          <div className="grid-stats">
            <div className="card stat-card">
              <div className="stat-icon" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>$</div>
              <div className="stat-info">
                <span className="stat-label">Total vendido del día</span>
                <span className="stat-value">{formatMoney(data.facturadoTotal)}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Suma de facturas emitidas, sin descontar notas de crédito</span>
              </div>
            </div>

            <div className="card stat-card">
              <div className="stat-icon" style={{ backgroundColor: 'var(--accent-light)', color: 'var(--secondary)' }}>$</div>
              <div className="stat-info">
                <span className="stat-label">Plata total en caja</span>
                <span className="stat-value">{formatMoney(data.totalCaja)}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fondo fijo + efectivo neto - egresos en efectivo</span>
              </div>
            </div>

            <div className="card stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#fee2e2', color: '#b91c1c' }}>$</div>
              <div className="stat-info">
                <span className="stat-label">Egresos del día</span>
                <span className="stat-value">{formatMoney(data.egresosTotal || 0)}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>En efectivo: {formatMoney(data.egresosEfectivo || 0)}</span>
              </div>
            </div>

            <div className="card stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#eeedfe', color: '#4338ca' }}>
                <ClipboardCheck size={22} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Comprobantes</span>
                <span className="stat-value">{data.cantidadComprobantes}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Emitidos en el día</span>
              </div>
            </div>
          </div>

          <div className="dashboard-columns" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>Resumen de Caja</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Fondo fijo inicial</span>
                  <strong>{formatMoney(data.montoInicial)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Efectivo cobrado neto</span>
                  <strong>{formatMoney(data.efectivoNeto)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Egresos en efectivo</span>
                  <strong style={{ color: '#b91c1c' }}>-{formatMoney(data.egresosEfectivo || 0)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', fontSize: '1.1rem' }}>
                  <span>Total físico esperado</span>
                  <strong style={{ color: 'var(--primary)' }}>{formatMoney(data.totalCaja)}</strong>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>Cobrado por forma de pago</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {Object.entries(data.porFormaPago).map(([formaPago, total]) => (
                  <div key={formaPago} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{formaPago}</span>
                    <strong>{formatMoney(total)}</strong>
                  </div>
                ))}
                {Object.keys(data.porFormaPago).length === 0 && (
                  <p style={{ color: 'var(--text-muted)' }}>Todavía no hay comprobantes emitidos en este día.</p>
                )}
              </div>
            </div>
          </div>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Comprobante</th>
                  <th>Cliente</th>
                  <th>Pago</th>
                  <th style={{ textAlign: 'right' }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {data.ventas.map((venta) => (
                  <tr key={venta.id}>
                    <td>{new Date(venta.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                      <strong>{venta.tipoComprobante}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatCierreVoucherNumber(venta)}</div>
                    </td>
                    <td>{venta.cliente}</td>
                    <td>{venta.formaPago}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(venta.signedTotal)}</td>
                  </tr>
                ))}
                {data.ventas.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      No hay movimientos de caja para este día.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============ SECCIÓN 2: HISTORIAL DE COMPROBANTES ============ */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem' }}>Historial de comprobantes</h3>
        <span style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
      </div>

      <div className="no-print" style={{ marginBottom: '1.5rem' }}>
        <div className="grid-stats" style={{ marginBottom: '1.5rem' }}>
          <div className="card stat-card">
            <div className="stat-icon" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
              <FileText size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-label">Comprobantes</span>
              <span className="stat-value">{totals.count}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Según filtros actuales</span>
            </div>
          </div>

          <div className="card stat-card">
            <div className="stat-icon" style={{ backgroundColor: 'var(--accent-light)', color: 'var(--secondary)' }}>
              <span style={{ fontWeight: 700 }}>$</span>
            </div>
            <div className="stat-info">
              <span className="stat-label">Total Facturado</span>
              <span className="stat-value">{formatMoney(totals.total)}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No incluye rechazados</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="responsive-2col" style={{ display: 'grid', ['--cols' as any]: 'minmax(240px, 1fr) 220px', gap: '1rem', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', top: '50%', left: '0.9rem', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por cliente, documento o número..."
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>

            <select className="form-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="TODOS">Todos los estados</option>
              <option value="COMPLETADO">Completados</option>
              <option value="DEMO">Demo</option>
              <option value="RECHAZADO_AFIP">Rechazados AFIP</option>
            </select>
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Comprobante</th>
                <th>Cliente</th>
                <th>Pago</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loadingVentas ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    Cargando historial de comprobantes...
                  </td>
                </tr>
              ) : (
                filteredVentas.map((venta) => (
                  <tr key={venta.id}>
                    <td>{new Date(venta.fecha).toLocaleDateString('es-AR')}</td>
                    <td>
                      <strong>{venta.tipoComprobante}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatVoucherNumber(venta)}</div>
                    </td>
                    <td>
                      <strong>{venta.cliente?.razonSocial || 'Consumidor Final'}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {venta.cliente?.tipoDoc} {venta.cliente?.nroDoc}
                      </div>
                    </td>
                    <td>{venta.formaPago}</td>
                    <td>
                      <span className={`badge ${getEstadoBadge(venta.estado)}`}>{venta.estado}</span>
                      {venta.mensajeAfip && (
                        <div style={{ maxWidth: '260px', marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {venta.mensajeAfip}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoneyString(venta.total)}</td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {venta.estado === 'RECHAZADO_AFIP' ? (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin impresión</span>
                        ) : (
                          <a
                            href={`/dashboard/ventas/${venta.id}/print`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                          >
                            <Printer size={14} />
                            Ver / Imprimir
                          </a>
                        )}
                        {canFacturarTicket(venta) && (
                          <button
                            onClick={() => openFacturarTicket(venta)}
                            className="btn btn-primary btn-sm"
                            disabled={submittingFactura}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                          >
                            <FilePlus2 size={14} />
                            Facturar
                          </button>
                        )}
                        {facturaPara(venta) && (
                          <a
                            href={`/dashboard/ventas/${facturaPara(venta)!.id}/print`}
                            target="_blank"
                            rel="noreferrer"
                            className="badge badge-success"
                            style={{ textDecoration: 'none' }}
                          >
                            Facturado: {formatVoucherNumber(facturaPara(venta)!)}
                          </a>
                        )}
                        {canIssueCreditNote(venta) && (
                          <button
                            onClick={() => openCreditNoteModal(venta)}
                            className="btn btn-outline btn-sm"
                            disabled={issuingCreditNoteId === venta.id}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                          >
                            <RotateCcw size={14} />
                            {issuingCreditNoteId === venta.id ? 'Emitiendo...' : 'Nota crédito'}
                          </button>
                        )}
                        {venta.tipoComprobante.startsWith('Factura') && hasCreditNote(venta) && (
                          <span className="badge badge-info">
                            {remainingCreditAmount(venta) > 0.009
                              ? `Acreditado ${formatMoneyString(String(creditedAmount(venta)))}`
                              : 'Acreditada total'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}

              {!loadingVentas && filteredVentas.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No hay comprobantes para mostrar con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: NOTA DE CRÉDITO */}
      {creditNoteFor && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ borderColor: 'var(--primary)' }}>
            <div className="modal-header" style={{ backgroundColor: 'var(--primary-light)' }}>
              <h3 style={{ color: 'var(--primary-hover)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <RotateCcw size={20} />
                <span>Emitir Nota de Crédito</span>
              </h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.9rem' }}>
                Vas a acreditar sobre <strong>{creditNoteFor.tipoComprobante}</strong>{' '}
                <strong>{formatVoucherNumber(creditNoteFor)}</strong>, emitida por{' '}
                <strong>{formatMoneyString(creditNoteFor.total)}</strong>.
              </p>

              <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Ya acreditado</span>
                  <strong>{formatMoneyString(String(creditedAmount(creditNoteFor)))}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem' }}>
                  <span>Saldo disponible</span>
                  <strong style={{ color: 'var(--primary)' }}>{formatMoney(remainingCreditAmount(creditNoteFor))}</strong>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Monto a acreditar</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={creditNoteAmount}
                  onChange={(e) => setCreditNoteAmount(e.target.value)}
                  disabled={submittingCreditNote}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setCreditNoteAmount(remainingCreditAmount(creditNoteFor).toFixed(2))}
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: '0.5rem' }}
                  disabled={submittingCreditNote}
                >
                  Acreditar saldo total
                </button>
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                El stock de los productos se repondrá proporcionalmente al monto acreditado.
              </p>

              {creditNoteError && (
                <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-md)', fontSize: '0.9rem' }}>
                  {creditNoteError}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setCreditNoteFor(null)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
                disabled={submittingCreditNote}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitCreditNote}
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={submittingCreditNote}
              >
                {submittingCreditNote ? 'Emitiendo CAE AFIP...' : 'Emitir Nota de Crédito'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: FACTURAR TICKET X */}
      {facturarTicket && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ borderColor: 'var(--primary)' }}>
            <div className="modal-header" style={{ backgroundColor: 'var(--primary-light)' }}>
              <h3 style={{ color: 'var(--primary-hover)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FilePlus2 size={20} />
                <span>Facturar Ticket X</span>
              </h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.9rem' }}>
                Vas a emitir la factura fiscal del ticket <strong>{formatVoucherNumber(facturarTicket)}</strong> por{' '}
                <strong>{formatMoneyString(facturarTicket.total)}</strong>. El stock ya fue descontado al momento del ticket
                original.
              </p>

              <div className="form-group">
                <label className="form-label">Tipo de Comprobante</label>
                <select
                  className="form-select"
                  value={facturarTipo}
                  onChange={(e) => setFacturarTipo(e.target.value)}
                >
                  <option value="auto">Automático (según condición IVA)</option>
                  <option value="Factura A">Factura A</option>
                  <option value="Factura B">Factura B</option>
                  <option value="Factura C">Factura C</option>
                </select>
              </div>

              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem', backgroundColor: 'var(--bg-secondary)' }}>
                <strong style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.65rem' }}>Datos fiscales del receptor</strong>
                <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <select
                    className="form-select"
                    value={facturarTipoDoc}
                    onChange={(e) => setFacturarTipoDoc(e.target.value)}
                    disabled={facturarTipo === 'Factura A'}
                  >
                    <option value="CUIT">CUIT</option>
                    <option value="DNI">DNI</option>
                    <option value="99">Sin identificar</option>
                  </select>
                  <input
                    className="form-input"
                    placeholder={facturarTipoDoc === 'CUIT' ? 'CUIT sin guiones' : 'Número documento'}
                    value={facturarNroDoc}
                    onChange={(e) => setFacturarNroDoc(e.target.value)}
                  />
                </div>
                <input
                  className="form-input"
                  placeholder="Razón social / Nombre completo"
                  value={facturarRazonSocial}
                  onChange={(e) => setFacturarRazonSocial(e.target.value)}
                  style={{ marginBottom: '0.5rem' }}
                />
                <select
                  className="form-select"
                  value={facturarCondicionIva}
                  onChange={(e) => setFacturarCondicionIva(e.target.value)}
                  disabled={facturarTipo === 'Factura A'}
                  style={{ marginBottom: '0.5rem' }}
                >
                  <option value="Consumidor Final">Consumidor Final</option>
                  <option value="Responsable Inscripto">Responsable Inscripto</option>
                  <option value="Monotributista">Monotributista</option>
                  <option value="Exento">Exento</option>
                </select>
                <input
                  className="form-input"
                  placeholder="Dirección fiscal (opcional)"
                  value={facturarDireccion}
                  onChange={(e) => setFacturarDireccion(e.target.value)}
                  style={{ marginBottom: '0.5rem' }}
                />
                <input
                  className="form-input"
                  type="email"
                  placeholder="Email (opcional)"
                  value={facturarEmail}
                  onChange={(e) => setFacturarEmail(e.target.value)}
                />
              </div>

              {error && (
                <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-md)', fontSize: '0.9rem' }}>
                  {error}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setFacturarTicket(null)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
                disabled={submittingFactura}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitFacturar}
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={submittingFactura}
              >
                {submittingFactura ? 'Emitiendo CAE AFIP...' : 'Emitir Factura Fiscal'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .print-ticket {
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
