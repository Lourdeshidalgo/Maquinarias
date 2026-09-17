'use client';

import Link from 'next/link';
import { 
  Receipt, 
  Scale, 
  BookUser, 
  LockKeyhole, 
  TrendingUp, 
  Bot,
  Users,
  Undo2,
  Tags,
  TrendingDown,
  MonitorPlay,
  CheckCircle2,
  Star,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

const Logo = () => (
  <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <rect width="100" height="100" rx="24" fill="var(--primary)" />
    <circle cx="42" cy="50" r="22" fill="var(--secondary)" fillOpacity="0.95" />
    <circle cx="58" cy="50" r="22" fill="#eeedfe" fillOpacity="0.95" />
  </svg>
);

export default function LandingPage() {
  return (
    <div style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* NAVBAR */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '1.25rem 5%',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Logo />
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>Molux</span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <a href="#funcionalidades" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500, display: 'none' }} className="d-md-block">Funcionalidades</a>
          <a href="#testimonios" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500, display: 'none' }} className="d-md-block">Clientes</a>
          <a href="#planes" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500, display: 'none' }} className="d-md-block">Planes</a>
          <Link href="/login" style={{ color: 'var(--text-main)', textDecoration: 'none', fontWeight: 600, marginLeft: '0.5rem' }}>Ingresar</Link>
          <Link href="/registro" style={{ 
            backgroundColor: 'var(--primary)', 
            color: 'white', 
            padding: '0.6rem 1.25rem', 
            borderRadius: '8px', 
            textDecoration: 'none', 
            fontWeight: 600,
            transition: 'background-color 0.2s'
          }}>
            Probar Gratis
          </Link>
        </div>
      </header>

      {/* HERO SECTION */}
      <section style={{ 
        padding: '6rem 5% 8rem', 
        display: 'flex', 
        flexWrap: 'wrap', 
        alignItems: 'center', 
        gap: '4rem',
        backgroundColor: 'var(--bg-primary)',
        overflow: 'hidden'
      }}>
        <div style={{ flex: '1 1 500px', maxWidth: '650px' }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '9999px', fontWeight: 600, fontSize: '0.875rem' }}>
              <CheckCircle2 size={16} /> Facturación AFIP
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', backgroundColor: '#f3e8ff', color: 'var(--secondary)', borderRadius: '9999px', fontWeight: 600, fontSize: '0.875rem' }}>
              <Bot size={16} /> IA Inteligente Integrada
            </div>
          </div>
          
          <h1 style={{ fontSize: '3.75rem', color: 'var(--text-main)', marginBottom: '1.5rem', lineHeight: '1.1', fontWeight: 800, letterSpacing: '-0.03em' }}>
            Facturar y cobrar nunca fue tan ágil.
          </h1>
          <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginBottom: '2.5rem', lineHeight: '1.6' }}>
            Molux es el único sistema de gestión con conexión directa a <strong>AFIP</strong> y un <strong>Asistente de IA</strong> que responde tus dudas al instante. Llevá el control de tu negocio al futuro.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/registro" style={{ 
              backgroundColor: 'var(--primary)', color: 'white', padding: '1rem 2rem', 
              fontSize: '1.125rem', borderRadius: '12px', display: 'flex', alignItems: 'center', 
              gap: '0.5rem', textDecoration: 'none', fontWeight: 600, boxShadow: '0 4px 14px rgba(67, 56, 202, 0.3)'
            }}>
              Comenzar prueba gratis <ArrowRight size={20} />
            </Link>
            <a href="#planes" style={{ 
              backgroundColor: '#ffffff', color: 'var(--text-main)', padding: '1rem 2rem', 
              fontSize: '1.125rem', borderRadius: '12px', border: '1px solid #cbd5e1',
              display: 'flex', alignItems: 'center', textDecoration: 'none', fontWeight: 600
            }}>
              Ver Planes
            </a>
          </div>
          <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', color: '#fbbf24' }}>
              <Star fill="currentColor" size={18} />
              <Star fill="currentColor" size={18} />
              <Star fill="currentColor" size={18} />
              <Star fill="currentColor" size={18} />
              <Star fill="currentColor" size={18} />
            </div>
            <span>Elegido por cientos de comercios en el país</span>
          </div>
        </div>

        {/* Clean Abstract Floating Cards */}
        <div style={{ flex: '1 1 400px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Card 1: Sales Summary */}
          <div style={{ 
            backgroundColor: '#ffffff', borderRadius: '24px', padding: '2rem', 
            boxShadow: '0 20px 40px -10px rgba(67, 56, 202, 0.15)', border: '1px solid #f1f5f9',
            transform: 'translateX(20px)', zIndex: 2
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-main)' }}>Ventas del Día</div>
              <div style={{ padding: '0.5rem 1rem', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '12px', fontWeight: 700, fontSize: '0.875rem' }}>
                + 15%
              </div>
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
              $ 450.000
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              <CheckCircle2 size={16} color="#10b981" /> 24 tickets emitidos
            </div>
          </div>

          {/* Card 2: AI Assistance */}
          <div style={{ 
            backgroundColor: '#ffffff', borderRadius: '24px', padding: '1.5rem', 
            boxShadow: '0 15px 35px -5px rgba(0, 0, 0, 0.1)', border: '1px solid #f1f5f9',
            transform: 'translateX(-20px)', zIndex: 1, display: 'flex', gap: '1rem', alignItems: 'flex-start'
          }}>
            <div style={{ backgroundColor: '#f3e8ff', color: 'var(--secondary)', padding: '1rem', borderRadius: '16px' }}>
              <Bot size={28} />
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>Asistente Molux</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                "El asiento contable cuadra perfecto. ¿Querés que emita el reporte de ganancia de hoy?"
              </div>
            </div>
          </div>
          
          {/* Card 3: AFIP Invoice */}
          <div style={{ 
            backgroundColor: '#ffffff', borderRadius: '24px', padding: '1.5rem', 
            boxShadow: '0 25px 50px -12px rgba(67, 56, 202, 0.2)', border: '1px solid #f1f5f9',
            position: 'absolute', bottom: '-40px', right: '-10px', zIndex: 3,
            display: 'flex', alignItems: 'center', gap: '1rem'
          }}>
            <div style={{ backgroundColor: '#dcfce7', padding: '1rem', borderRadius: '16px', color: '#166534' }}>
              <Receipt size={28} />
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>Facturación AFIP</div>
              <div style={{ fontSize: '1.125rem', color: 'var(--text-main)', fontWeight: 800 }}>Factura Aprobada</div>
            </div>
          </div>

        </div>
      </section>

      {/* CORE FEATURES */}
      <section id="funcionalidades" style={{ padding: '6rem 5%', backgroundColor: 'var(--bg-secondary)' }}>
        <div style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto 4rem' }}>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-main)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '1rem' }}>
            Diseñado para la velocidad del mostrador
          </h2>
          <p style={{ fontSize: '1.125rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            Molux incluye todas las herramientas necesarias para facturar, gestionar stock y analizar tus ventas sin complicaciones ni tiempos de espera.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
          {/* F1 */}
          <div style={{ padding: '2rem', backgroundColor: 'var(--bg-primary)', borderRadius: '20px', border: '1px solid #f1f5f9', transition: 'transform 0.3s ease' }} className="feature-card">
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <Receipt size={24} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.75rem' }}>Facturación Electrónica AFIP</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.5' }}>Conexión directa con AFIP. Emití facturas A, B y C en tiempo real e imprimí el ticket con el código QR obligatorio verificable.</p>
          </div>
          {/* F2 */}
          <div style={{ padding: '2rem', backgroundColor: 'var(--bg-primary)', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <Scale size={24} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.75rem' }}>Punto de Venta Ágil</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.5' }}>Soporte nativo para escáneres de código de barras, venta exacta por peso (kg/gr) y catálogo visual con imagen para cada producto.</p>
          </div>
          {/* F3 */}
          <div style={{ padding: '2rem', backgroundColor: 'var(--bg-primary)', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#fce7f3', color: '#db2777', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <BookUser size={24} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.75rem' }}>Cuentas Corrientes ("Fiado")</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.5' }}>Mantené el control exacto de quién te debe plata. Configurá límites de crédito automáticos y registrá pagos parciales de clientes.</p>
          </div>
          {/* F4 */}
          <div style={{ padding: '2rem', backgroundColor: 'var(--bg-primary)', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <LockKeyhole size={24} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.75rem' }}>Cierre Z y Arqueo Diario</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.5' }}>Asegurá tu recaudación con el cierre Z. Cuadrá el efectivo en caja contra las ventas registradas con un historial inmutable.</p>
          </div>
          {/* F5 */}
          <div style={{ padding: '2rem', backgroundColor: 'var(--bg-primary)', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <TrendingUp size={24} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.75rem' }}>Reportes de Ganancia Real</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.5' }}>Molux cruza tus costos con tus ventas automáticamente. Conocé tu ganancia neta, rentabilidad por producto y volumen de operaciones.</p>
          </div>
          {/* F6 */}
          <div style={{ padding: '2rem', backgroundColor: 'var(--bg-primary)', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#f3e8ff', color: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <Bot size={24} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.75rem' }}>Asistente con IA Integrado</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.5' }}>¿Dudas sobre un asiento contable o cómo emitir nota de crédito? Nuestro asistente conversacional basado en IA te responde al instante.</p>
          </div>
        </div>
      </section>

      {/* SECONDARY FEATURES */}
      <section style={{ padding: '4rem 5%', backgroundColor: 'var(--primary)', color: 'white' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '2rem', justifyContent: 'space-around' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Users size={20} style={{ opacity: 0.8 }} />
            <span style={{ fontWeight: 500 }}>Roles (Dueño/Empleado)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Undo2 size={20} style={{ opacity: 0.8 }} />
            <span style={{ fontWeight: 500 }}>Notas de Crédito</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Tags size={20} style={{ opacity: 0.8 }} />
            <span style={{ fontWeight: 500 }}>Descuentos Múltiples</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <TrendingDown size={20} style={{ opacity: 0.8 }} />
            <span style={{ fontWeight: 500 }}>Registro de Egresos</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <MonitorPlay size={20} style={{ opacity: 0.8 }} />
            <span style={{ fontWeight: 500 }}>Modo Demo (Prueba Segura)</span>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF (Testimonials Placeholder) */}
      <section id="testimonios" style={{ padding: '6rem 5%', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto 4rem' }}>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-main)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '1rem' }}>
            Comercios que ya confían en Molux
          </h2>
          <p style={{ fontSize: '1.125rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            Desde kioscos hasta minimercados y ferreterías, Molux se adapta al flujo de tu local.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
          {/* T1 */}
          <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', color: '#fbbf24', marginBottom: '1rem' }}>
              <Star fill="currentColor" size={16} /><Star fill="currentColor" size={16} /><Star fill="currentColor" size={16} /><Star fill="currentColor" size={16} /><Star fill="currentColor" size={16} />
            </div>
            <p style={{ color: 'var(--text-main)', fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '1.5rem', fontStyle: 'italic' }}>
              "Cambiar a Molux fue la mejor decisión. Ahora las facturas AFIP salen en 2 segundos literal, y el código QR que piden lo imprime directo en la ticketera sin configurar nada raro."
            </p>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>Marcos T.</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Dueño de Minimercado</div>
            </div>
          </div>
          {/* T2 */}
          <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', color: '#fbbf24', marginBottom: '1rem' }}>
              <Star fill="currentColor" size={16} /><Star fill="currentColor" size={16} /><Star fill="currentColor" size={16} /><Star fill="currentColor" size={16} /><Star fill="currentColor" size={16} />
            </div>
            <p style={{ color: 'var(--text-main)', fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '1.5rem', fontStyle: 'italic' }}>
              "Lo que más me sirve es la función de cuentas corrientes. Tengo muchos clientes del barrio y antes perdía plata anotando en cuaderno. Ahora todo está en sistema con tope de fiado."
            </p>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>Valeria C.</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Despensa y Fiambrería</div>
            </div>
          </div>
          {/* T3 */}
          <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', color: '#fbbf24', marginBottom: '1rem' }}>
              <Star fill="currentColor" size={16} /><Star fill="currentColor" size={16} /><Star fill="currentColor" size={16} /><Star fill="currentColor" size={16} /><Star fill="currentColor" size={16} />
            </div>
            <p style={{ color: 'var(--text-main)', fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '1.5rem', fontStyle: 'italic' }}>
              "El reporte de rentabilidad es clave. Saber exactamente cuál fue la ganancia limpia del día descontando los costos de la mercadería me cambió la forma de ver el negocio."
            </p>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>Julián R.</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Ferretería Integral</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section id="planes" style={{ padding: '6rem 5%', backgroundColor: 'var(--bg-secondary)' }}>
        <div style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 4rem' }}>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-main)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '1rem' }}>
            Un solo plan, todas las funciones
          </h2>
          <p style={{ fontSize: '1.125rem', color: 'var(--text-muted)' }}>
            Sin costos ocultos ni límites engañosos. Probá el sistema a fondo antes de pagar.
          </p>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '2rem', maxWidth: '900px', margin: '0 auto' }}>
          {/* Plan Prueba */}
          <div style={{ flex: '1 1 300px', backgroundColor: 'var(--bg-primary)', borderRadius: '24px', padding: '3rem 2rem', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>Prueba Gratis</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Ideal para conocer el sistema.</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '2rem' }}>
              <span style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: '1' }}>$0</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>/ 7 días</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-main)' }}>
                <CheckCircle2 size={20} color="var(--primary)" /> Acceso total al sistema
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-main)' }}>
                <CheckCircle2 size={20} color="var(--primary)" /> Facturación en Modo Demo
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-main)' }}>
                <CheckCircle2 size={20} color="var(--primary)" /> Carga de stock y clientes
              </li>
            </ul>
            <Link href="/registro" style={{ 
              marginTop: 'auto', backgroundColor: '#ffffff', color: 'var(--text-main)', 
              border: '1px solid #cbd5e1', padding: '1rem', borderRadius: '12px', 
              textAlign: 'center', fontWeight: 600, textDecoration: 'none'
            }}>
              Iniciar Prueba
            </Link>
          </div>

          {/* Plan Mensual */}
          <div style={{ flex: '1 1 300px', backgroundColor: 'var(--primary)', borderRadius: '24px', padding: '3rem 2rem', position: 'relative', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(67, 56, 202, 0.3)' }}>
            <div style={{ position: 'absolute', top: '-15px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'var(--secondary)', color: 'white', padding: '0.5rem 1rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Recomendado
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white', marginBottom: '0.5rem' }}>Plan Molux</h3>
            <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '2rem' }}>Todo lo que tu comercio necesita.</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '3rem', fontWeight: 800, color: 'white', lineHeight: '1' }}>$35.000</span>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>/ mes</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', marginBottom: '2rem', fontStyle: 'italic' }}>
              *Para más de 3 sucursales: $45.000 / mes
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'white' }}>
                <CheckCircle2 size={20} color="#6ee7b7" /> Facturación oficial AFIP
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'white' }}>
                <CheckCircle2 size={20} color="#6ee7b7" /> Soporte prioritario
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'white' }}>
                <CheckCircle2 size={20} color="#6ee7b7" /> Usuarios ilimitados
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'white' }}>
                <CheckCircle2 size={20} color="#6ee7b7" /> Asistente de IA inteligente integrado
              </li>
            </ul>
            <Link href="/registro" style={{ 
              marginTop: 'auto', backgroundColor: 'white', color: 'var(--primary)', 
              padding: '1rem', borderRadius: '12px', textAlign: 'center', 
              fontWeight: 700, textDecoration: 'none'
            }}>
              Suscribirme Ahora
            </Link>
          </div>
        </div>
      </section>

      {/* FINAL CTA & FOOTER */}
      <footer style={{ backgroundColor: 'var(--text-main)', color: '#f8fafc' }}>
        <div style={{ padding: '5rem 5%', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>¿Listo para ordenar tu negocio?</h2>
          <p style={{ fontSize: '1.125rem', color: '#94a3b8', marginBottom: '2.5rem', maxWidth: '600px', margin: '0 auto 2.5rem' }}>
            Dejá de perder tiempo sumando a mano o peleando con la página de AFIP. Molux hace el trabajo duro por vos.
          </p>
          <Link href="/registro" style={{ 
            backgroundColor: 'var(--primary)', color: 'white', padding: '1rem 2.5rem', 
            fontSize: '1.125rem', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', 
            gap: '0.5rem', textDecoration: 'none', fontWeight: 600
          }}>
            Crear mi cuenta gratis
          </Link>
        </div>
        <div style={{ padding: '2rem 5%', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', fontSize: '0.875rem', color: '#64748b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={18} />
            <span>Integración oficial AFIP / ARCA</span>
          </div>
          <p>© {new Date().getFullYear()} Molux. Todos los derechos reservados.</p>
        </div>
      </footer>

      {/* Basic inline CSS to ensure responsiveness for specific layout tweaks without Tailwind */}
      <style dangerouslySetInnerHTML={{__html: `
        @media (max-width: 768px) {
          .d-md-block { display: none !important; }
        }
        .feature-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
        }
      `}} />
    </div>
  );
}
