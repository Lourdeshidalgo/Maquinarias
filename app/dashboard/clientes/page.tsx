'use client';

import { useState, useEffect } from 'react';
import { formatMoney } from '@/lib/format';
import { Users, Plus, Pencil, DollarSign, ExternalLink, ArrowUpRight, ArrowDownLeft, Filter, Loader2, FileUp, FileDown } from 'lucide-react';
import ImportarClientes from '@/components/clientes/ImportarClientes';
import FichaCliente from '@/components/clientes/FichaCliente';

import Link from 'next/link';

// Clientes por página en el listado.
const PAGE_SIZE = 25;

export default function ClientesPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalClientes, setTotalClientes] = useState(0);
  // Ficha del cliente: undefined = cerrada, null = alta, id = edición
  const [fichaId, setFichaId] = useState<string | null | undefined>(undefined);
  const [showImportar, setShowImportar] = useState(false);
  const [avisoImportacion, setAvisoImportacion] = useState('');
  const [exportando, setExportando] = useState(false);
  const [errorExportacion, setErrorExportacion] = useState('');

  // Exportar la base de clientes completa a Excel (con los mismos títulos que
  // acepta "Importar desde Excel", para poder volver a subirla).
  const exportarClientes = async () => {
    setExportando(true);
    setErrorExportacion('');
    try {
      const r = await fetch('/api/tenant/clientes/exportar');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo exportar.');
      const XLSX = await import('xlsx');
      const hoja = XLSX.utils.json_to_sheet(d.filas);
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Clientes');
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
      XLSX.writeFile(libro, `clientes-${hoy}.xlsx`);
      setAvisoImportacion(`Se exportaron ${d.filas.length.toLocaleString('es-AR')} clientes.`);
    } catch (e) {
      setErrorExportacion((e as Error).message || 'No se pudo exportar.');
    } finally {
      setExportando(false);
    }
  };

  // --- Cuenta Corriente (integrada) ---
  const [selectedCliente, setSelectedCliente] = useState<any | null>(null);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [ccLoading, setCcLoading] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [importe, setImporte] = useState('');
  const [concepto, setConcepto] = useState('Cobro en efectivo - Recibo interno');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadClients = async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/tenant/clientes?${params.toString()}`);
      const data = await res.json();
      setClientes(Array.isArray(data.items) ? data.items : []);
      setTotalPages(data.totalPages || 1);
      setTotalClientes(data.total || 0);
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoading(false);
    }
  };

  // Recargar al cambiar de página; la búsqueda se debouncea.
  useEffect(() => {
    const t = setTimeout(loadClients, search ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  // Al buscar, volver a la página 1.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const loadMovimientos = async (clienteId: string) => {
    setCcLoading(true);
    try {
      const res = await fetch(`/api/tenant/cuentas-corrientes?clienteId=${clienteId}`);
      const data = await res.json();
      setMovimientos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load movimientos:', err);
    } finally {
      setCcLoading(false);
    }
  };

  const selectCliente = (cliente: any) => {
    setSelectedCliente(cliente);
    loadMovimientos(cliente.id);
  };

  const filtered = clientes;

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);

    if (!selectedCliente) return;

    try {
      const res = await fetch('/api/tenant/cuentas-corrientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: selectedCliente.id,
          importe: parseFloat(importe),
          concepto,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo guardar el pago.');
      }

      setImporte('');
      setConcepto('Cobro en efectivo - Recibo interno');
      setShowPayModal(false);
      loadClients();
      loadMovimientos(selectedCliente.id);
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* ================= GESTIÓN DE CLIENTES ================= */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={26} style={{ color: 'var(--primary)' }} />
              <span>Gestión de Clientes</span>
            </h2>
            <p style={{ color: 'var(--text-muted)' }}>
              Mantené al día la ficha fiscal, el saldo a cuenta corriente y los movimientos de cada comprador.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={exportarClientes} className="btn btn-secondary" disabled={exportando}>
              {exportando ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />}
              <span>Exportar a Excel</span>
            </button>
            <button onClick={() => setShowImportar(true)} className="btn btn-secondary">
              <FileUp size={16} />
              <span>Importar desde Excel</span>
            </button>
            <button onClick={() => setFichaId(null)} className="btn btn-primary">
              <Plus size={16} />
              <span>Nuevo Cliente</span>
            </button>
          </div>
        </div>

        {errorExportacion && (
          <div className="card" style={{ marginBottom: '1rem', background: '#fef2f2', color: '#b91c1c', padding: '0.75rem 1rem' }}>{errorExportacion}</div>
        )}

        {avisoImportacion && (
          <div className="card" style={{ marginBottom: '1rem', background: '#f0fdf4', color: '#15803d', padding: '0.75rem 1rem' }}>{avisoImportacion}</div>
        )}

        {showImportar && (
          <ImportarClientes
            onCerrar={() => setShowImportar(false)}
            onImportado={(r) => {
              setShowImportar(false);
              setAvisoImportacion(`Importación lista: ${r.nuevos.toLocaleString('es-AR')} clientes nuevos y ${r.actualizados.toLocaleString('es-AR')} actualizados.`);
              setPage(1);
              loadClients();
            }}
          />
        )}

        {/* Filter panel */}
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Buscar por nombre, N° de cliente, DNI/CUIT, teléfono o localidad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Clientes Table */}
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Cargando clientes...</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Nombre / Razón Social</th>
                  <th>Condición IVA</th>
                  <th>Contacto</th>
                  <th>Límite Crédito</th>
                  <th>Saldo deudor</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => {
                  const debt = parseFloat(client.saldoCuentaCorriente);
                  const limit = client.limiteCredito ? parseFloat(client.limiteCredito) : null;
                  const hasDebt = debt > 0;

                  return (
                    <tr key={client.id} style={{ backgroundColor: hasDebt ? '#fdfcf7' : undefined }}>
                      <td>
                        {client.tipoDoc === '99' ? (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin documento</span>
                        ) : (
                          <>
                            <span className="badge badge-secondary" style={{ backgroundColor: 'var(--bg-tertiary)' }}>{client.tipoDoc}</span>
                            <code style={{ marginLeft: '0.5rem' }}>{client.nroDoc}</code>
                          </>
                        )}
                        {client.codigo != null && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cliente N° {client.codigo}</div>}
                      </td>
                      <td style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => selectCliente(client)}>
                        {client.razonSocial}
                      </td>
                      <td>{client.condicionIva}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <div>📞 {client.celular || client.telefono || '-'}</div>
                        {client.email && <div>✉️ {client.email}</div>}
                        {client.localidad && <div>📍 {client.localidad}</div>}
                      </td>
                      <td>{limit ? `$${limit.toLocaleString('es-AR')}` : 'Sin Límite'}</td>
                      <td style={{ fontWeight: 600, color: hasDebt ? '#ef4444' : 'inherit' }}>
                        ${debt.toLocaleString('es-AR')}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFichaId(client.id);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.35rem 0.65rem' }}
                            aria-label={`Editar ${client.razonSocial}`}
                          >
                            <Pencil size={14} />
                            <span>Editar</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              selectCliente(client);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.35rem 0.65rem' }}
                          >
                            <DollarSign size={14} />
                            <span>Cuenta</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      No se encontraron clientes registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Anterior
            </button>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Página {page} de {totalPages} · {totalClientes} clientes
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {/* ================= CUENTA CORRIENTE (INTEGRADA) ================= */}
      {selectedCliente && (
        <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
            <div>
              <h3 style={{ fontSize: '1.3rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <DollarSign size={20} style={{ color: 'var(--primary)' }} />
                <span>Cuenta Corriente — {selectedCliente.razonSocial}</span>
              </h3>
              <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
                {selectedCliente.tipoDoc}: {selectedCliente.nroDoc}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600, color: '#ef4444' }}>
                Saldo: ${parseFloat(selectedCliente.saldoCuentaCorriente).toLocaleString('es-AR')}
              </span>
              {selectedCliente.limiteCredito && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Límite: ${parseFloat(selectedCliente.limiteCredito).toLocaleString('es-AR')}
                </span>
              )}
              <button
                onClick={() => setShowPayModal(true)}
                className="btn btn-primary btn-sm"
                style={{ padding: '0.4rem 0.8rem' }}
              >
                <Plus size={14} />
                <span>Registrar Pago</span>
              </button>
              <button
                onClick={() => setSelectedCliente(null)}
                className="btn btn-secondary btn-sm"
                style={{ padding: '0.4rem 0.8rem' }}
              >
                Cerrar
              </button>
            </div>
          </div>

          {/* Movements Table */}
          <div style={{ marginBottom: '1rem' }}>
            {ccLoading ? (
              <p style={{ color: 'var(--text-muted)' }}>Cargando movimientos...<Loader2 size={16} className="spin" style={{ marginLeft: '0.5rem' }} /></p>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '160px' }}>Fecha</th>
                      <th>Concepto / Detalle</th>
                      <th style={{ width: '120px' }}>Tipo</th>
                      <th style={{ textAlign: 'right', width: '140px' }}>Importe</th>
                      <th style={{ textAlign: 'right', width: '160px' }}>Saldo Resultante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                          No se registran movimientos en esta cuenta corriente.
                        </td>
                      </tr>
                    ) : (
                      movimientos.map((mov) => {
                        const isDebe = mov.tipo === 'DEBE';
                        return (
                          <tr key={mov.id}>
                            <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              {new Date(mov.fecha).toLocaleString('es-AR')}
                            </td>
                            <td>{mov.concepto}</td>
                            <td>
                              {isDebe ? (
                                <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                  <ArrowUpRight size={12} />
                                  <span>DEBE (Cargo)</span>
                                </span>
                              ) : (
                                <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                  <ArrowDownLeft size={12} />
                                  <span>HABER (Pago)</span>
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: isDebe ? '#d97706' : '#15803d' }}>
                              {isDebe ? '+' : '-'}${parseFloat(mov.importe).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                              ${parseFloat(mov.saldoResultante).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {fichaId !== undefined && (
        <FichaCliente
          clienteId={fichaId}
          onCerrar={() => setFichaId(undefined)}
          onGuardado={(msg) => {
            setFichaId(undefined);
            setAvisoImportacion(msg);
            loadClients();
          }}
        />
      )}

      {/* REGISTER PAYMENT MODAL (Cuenta Corriente) */}
      {showPayModal && selectedCliente && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>💵 Registrar Cobro / Pago a Cuenta</h3>
              <button onClick={() => setShowPayModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
            </div>
            <form onSubmit={handleRegisterPayment}>
              <div className="modal-body">
                {submitError && (
                  <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    ⚠️ {submitError}
                  </div>
                )}
                <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                  <strong style={{ fontSize: '1.1rem', display: 'block', marginBottom: '0.25rem' }}>{selectedCliente.razonSocial}</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedCliente.tipoDoc}: {selectedCliente.nroDoc}</span>
                  <div style={{ marginTop: '0.5rem', fontWeight: 600, color: '#ef4444' }}>
                    Saldo actual: ${parseFloat(selectedCliente.saldoCuentaCorriente).toLocaleString('es-AR')}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Monto Recibido ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="0.00"
                    value={importe}
                    onChange={(e) => setImporte(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Concepto de Cobro</label>
                  <input
                    type="text"
                    className="form-input"
                    value={concepto}
                    onChange={(e) => setConcepto(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowPayModal(false)} className="btn btn-secondary" disabled={submitting}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting || !importe}>
                  {submitting ? 'Procesando...' : 'Registrar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
