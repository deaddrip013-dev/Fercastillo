import { useEffect, useState } from 'react';
import { getInventory } from '../services/adminApi';
import type { InventoryRow } from '../services/adminApi';
import './Inventory.css';

export default function Inventory() {
    const [inventory, setInventory] = useState<InventoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');

    useEffect(() => {
        let active = true;
        const timer = window.setTimeout(() => {
            void getInventory().then(data => { if (active) setInventory(data); })
                .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'No fue posible cargar el inventario.'); })
                .finally(() => { if (active) setLoading(false); });
        }, 0);
        return () => { active = false; window.clearTimeout(timer); };
    }, []);

    const productCount = new Set(inventory.map(row => row.productId)).size;
    const availableSizes = inventory.filter(row => Boolean(row.isAvailable)).length;
    const unavailableSizes = inventory.length - availableSizes;
    const categories = Array.from(new Set(inventory.map(row => row.categoryName))).sort();
    const filtered = inventory.filter(row =>
        `${row.productName} ${row.size}`.toLowerCase().includes(search.toLowerCase()) &&
        (categoryFilter === 'all' || row.categoryName === categoryFilter)
    );

    return <main className="inventory-page">
        <header className="inventory-header"><div><span className="inventory-eyebrow">FerCastillo® — CONTROL CENTER</span><h1>Inventario<span>.</span></h1><p>Consulta las tallas habilitadas para compra.</p></div></header>
        <section className="inventory-stats">
            <article className="inventory-stat-card"><span>PRODUCTOS REGISTRADOS</span><strong>{productCount}</strong><small>Productos con tallas</small></article>
            <article className="inventory-stat-card"><span>TALLAS DISPONIBLES</span><strong>{availableSizes}</strong><small>Habilitadas en la tienda</small></article>
            <article className="inventory-stat-card"><span>TALLAS NO DISPONIBLES</span><strong>{unavailableSizes}</strong><small>No se pueden seleccionar</small></article>
        </section>
        <section className="inventory-panel">
            <div className="inventory-panel-heading"><div><span className="inventory-eyebrow">SIZE AVAILABILITY</span><h2>Disponibilidad por talla</h2></div></div>
            <div className="inventory-toolbar"><input type="search" placeholder="Buscar producto o talla..." value={search} onChange={event => setSearch(event.target.value)} /><select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="all">Todas las categorías</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></div>
            {loading ? <div className="inventory-empty">Cargando inventario...</div> : error ? <div className="inventory-error">{error}</div> : filtered.length === 0 ? <div className="inventory-empty">No se encontraron tallas.</div> :
                <div className="inventory-table-wrapper"><table className="inventory-table"><thead><tr><th>PRODUCTO</th><th>CATEGORÍA</th><th>TALLA</th><th>DISPONIBILIDAD</th></tr></thead><tbody>
                    {filtered.map(row => <tr key={row.sizeId}><td><strong>{row.productName}</strong></td><td>{row.categoryName}</td><td>{row.size}</td><td><span className={`inventory-availability ${row.isAvailable ? 'available' : 'unavailable'}`}>{row.isAvailable ? 'Disponible' : row.productStatus !== 'published' ? 'No publicado' : 'No disponible'}</span></td></tr>)}
                </tbody></table></div>}
        </section>
    </main>;
}
