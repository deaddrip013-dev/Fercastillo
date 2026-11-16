import { useEffect, useState } from 'react';
import { getOrder, getOrders, updateOrderStatus } from '../services/adminApi';
import type { AdminOrder, AdminOrderDetail, AdminOrderItem } from '../services/adminApi';
import './Orders.css';

const statusLabels: Record<string, string> = { pending: 'Pendiente', confirmed: 'Confirmado', processing: 'En preparación', shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado' };
const nextStatuses: Record<string, string[]> = { pending: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'], processing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };
const money = (value: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);

export default function Orders() {
    const [orders, setOrders] = useState<AdminOrder[]>([]);
    const [selected, setSelected] = useState<{ order: AdminOrderDetail; items: AdminOrderItem[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    async function refresh() { setOrders(await getOrders()); }

    useEffect(() => {
        let active = true;
        const timer = window.setTimeout(() => {
            void getOrders().then(data => { if (active) setOrders(data); })
                .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'No fue posible cargar pedidos.'); })
                .finally(() => { if (active) setLoading(false); });
        }, 0);
        return () => { active = false; window.clearTimeout(timer); };
    }, []);

    async function openOrder(id: string) {
        try { setSelected(await getOrder(id)); setError(''); }
        catch (err) { setError(err instanceof Error ? err.message : 'No fue posible consultar el pedido.'); }
    }

    async function changeStatus(status: string) {
        if (!selected) return;
        try {
            await updateOrderStatus(selected.order.id, status);
            await refresh();
            setSelected(await getOrder(selected.order.id));
        } catch (err) { setError(err instanceof Error ? err.message : 'No fue posible cambiar el estado.'); }
    }

    return <main className="orders-page">
        <header className="orders-header"><span>FerCastillo® — OPERACIONES</span><h1>Pedidos<span>.</span></h1><p>Los pedidos permanecen pendientes hasta que el negocio los confirme.</p></header>
        {error && <div className="orders-error" role="alert">{error}</div>}
        <section className="orders-panel">
            {loading ? <div className="orders-empty">Cargando pedidos...</div> : orders.length === 0 ? <div className="orders-empty">Aún no hay pedidos recibidos.</div> :
                <div className="orders-table-wrap"><table className="orders-table"><thead><tr><th>PEDIDO</th><th>CLIENTE</th><th>ARTÍCULOS</th><th>TOTAL</th><th>ESTADO</th><th>FECHA</th><th></th></tr></thead><tbody>
                    {orders.map(order => <tr key={order.id}><td><strong>{order.orderNumber}</strong></td><td>{order.customerName}<small>{order.customerPhone}</small></td><td>{order.itemCount}</td><td>{money(order.totalCop)}</td><td><span className={`order-status status-${order.status}`}>{statusLabels[order.status] || order.status}</span></td><td>{new Date(order.createdAt).toLocaleDateString('es-CO')}</td><td><button onClick={() => void openOrder(order.id)}>Ver pedido</button></td></tr>)}
                </tbody></table></div>}
        </section>
        {selected && <div className="order-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
            <section className="order-detail" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
                <header><div><span>DETALLE DEL PEDIDO</span><h2 id="order-detail-title">{selected.order.orderNumber}</h2></div><button onClick={() => setSelected(null)} aria-label="Cerrar">×</button></header>
                <div className="order-customer"><strong>{selected.order.customerName}</strong><span>{selected.order.customerPhone}</span>{selected.order.customerAddress && <span>{selected.order.customerAddress}</span>}{selected.order.customerNotes && <p>{selected.order.customerNotes}</p>}</div>
                <div className="order-items">{selected.items.map((item, index) => <article key={`${item.sku}-${item.size}-${index}`}><div><strong>{item.productName}</strong><small>{item.sku || 'Sin SKU'} · Talla {item.size} · Cantidad {item.quantity}</small></div><span>{money(item.subtotalCop)}</span></article>)}</div>
                <div className="order-total"><span>TOTAL</span><strong>{money(selected.order.totalCop)}</strong></div>
                <label className="order-status-control">Estado actual: <strong>{statusLabels[selected.order.status]}</strong></label>
                {nextStatuses[selected.order.status]?.length > 0 && <div className="order-transition-actions">{nextStatuses[selected.order.status].map(status => <button className={status === 'cancelled' ? 'cancel' : ''} key={status} onClick={() => void changeStatus(status)}>Marcar {statusLabels[status].toLowerCase()}</button>)}</div>}
                <p className="order-stock-note">Cambiar el estado del pedido no ajusta el inventario automáticamente. Actualiza las existencias desde Productos después de confirmar físicamente la operación.</p>
            </section>
        </div>}
    </main>;
}
