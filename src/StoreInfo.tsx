import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getPublicSizeGuides } from './admin/services/adminApi';
import type { SizeGuide } from './admin/services/adminApi';
import './StoreInfo.css';

const buyingSteps = [
    { title: 'ESCOGE', description: 'Prenda y talla en la tienda.' },
    { title: 'ESCRÍBENOS', description: 'El botón abre WhatsApp con tu pedido ya escrito.' },
    { title: 'CONFIRMA', description: 'Haz tu pago y tu pedido queda confirmado.' },
    { title: 'RECIBE', description: 'Envíos nacionales a toda Colombia.' },
];

export default function StoreInfo() {
    const location = useLocation();
    const [guides, setGuides] = useState<SizeGuide[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        void getPublicSizeGuides().then(data => {
            if (!active) return;
            setGuides(data);
            setSelectedId(data[0]?.categoryId || '');
        }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'No fue posible cargar las guías de tallas.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!location.hash) return;
        const timer = window.setTimeout(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ behavior: 'smooth' }), 100);
        return () => window.clearTimeout(timer);
    }, [location.hash]);

    const selectedGuide = guides.find(guide => guide.categoryId === selectedId) ?? guides[0];

    return <main className="store-info-page">
        <header className="store-info-header"><Link to="/" className="store-info-brand"><img src="/fercastillo-logo.jpg" alt="FerCastillo" /></Link><nav aria-label="Información de la tienda"><Link to="/#store">TIENDA</Link><Link to="/#collections">COLECCIONES</Link><Link to="/info#guia-tallas" className="active">TALLAS</Link></nav><Link to="/" className="store-info-back">VOLVER A LA TIENDA ↗</Link></header>
        <div className="store-info-breadcrumb"><Link to="/">Inicio</Link><span>/</span><span>Info</span></div>
        <section className="public-size-guide" id="guia-tallas">
            <div className="public-size-intro"><span className="store-info-eyebrow">— MEDIDAS Y AJUSTE</span><h1>TALLAS<span>.</span></h1>{loading ? <p>Cargando guías de tallas…</p> : error ? <p className="store-info-error" role="alert">{error}</p> : selectedGuide?.description ? <p>{selectedGuide.description}</p> : <p>Consulta las medidas disponibles para cada categoría.</p>}</div>
            <div className="public-size-data">
                {!loading && !error && guides.length > 0 && <>
                    <div className="public-size-tabs" role="tablist" aria-label="Categorías de guías de tallas">{guides.map(guide => <button key={guide.categoryId} type="button" role="tab" aria-selected={selectedGuide?.categoryId === guide.categoryId} className={selectedGuide?.categoryId === guide.categoryId ? 'active' : ''} onClick={() => setSelectedId(guide.categoryId)}>{guide.categoryName}</button>)}</div>
                    {selectedGuide && <><p className="public-size-unit">{selectedGuide.unitLabel || 'Medidas en centímetros'}</p><div className="public-size-table-scroll"><table className="public-size-table"><thead><tr>{selectedGuide.columns.map((column, index) => <th key={`${index}-${column}`}>{column}</th>)}</tr></thead><tbody>{selectedGuide.rows.map((row, rowIndex) => <tr key={`row-${rowIndex}`}>{selectedGuide.columns.map((_, columnIndex) => <td key={`cell-${rowIndex}-${columnIndex}`}>{row[columnIndex] || '—'}</td>)}</tr>)}</tbody></table></div></>}
                </>}
                {!loading && !error && guides.length === 0 && <div className="public-size-empty">Las guías de tallas estarán disponibles próximamente.</div>}
            </div>
        </section>
        <section className="how-to-buy" id="como-comprar"><span className="store-info-eyebrow">— PEDIDOS</span><h2>CÓMO COMPRAR<span>.</span></h2><div className="how-to-buy-steps">{buyingSteps.map((step, index) => <article key={step.title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{step.title}</h3><p>{step.description}</p></article>)}</div></section>
        <footer className="store-info-footer"><Link to="/">FerCastillo®</Link><span>@fercastillovb — Valledupar, Cesar</span></footer>
    </main>;
}
