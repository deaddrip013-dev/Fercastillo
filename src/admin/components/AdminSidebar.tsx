import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { logoutAdmin } from '../services/adminApi';
import './AdminSidebar.css';

const links = [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/products', label: 'Productos' },
    { to: '/admin/categories', label: 'Categorías' },
    { to: '/admin/collections', label: 'Colecciones' },
    { to: '/admin/inventory', label: 'Inventario' },
    { to: '/admin/size-guides', label: 'Info tallas' },
    { to: '/admin/settings', label: 'Configuración' },
];

export default function AdminSidebar() {
    const navigate = useNavigate();
    const [error, setError] = useState('');

    async function handleLogout() {
        setError('');
        try {
            await logoutAdmin();
            navigate('/admin/login', { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No fue posible cerrar sesión.');
        }
    }

    return <header className="admin-navigation">
        <NavLink className="admin-navigation-brand" to="/admin">FerCastillo<sup>®</sup><small>CONTROL CENTER</small></NavLink>
        <nav aria-label="Navegación administrativa">{links.map(link => <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `admin-navigation-link${isActive ? ' active' : ''}`}>{link.label}</NavLink>)}</nav>
        <div className="admin-navigation-account">{error && <span role="alert">{error}</span>}<button onClick={() => void handleLogout()}>Cerrar sesión ↗</button></div>
    </header>;
}
