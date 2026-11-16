
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';

import type { ReactNode } from 'react';

import Storefront from './Storefront';
import StoreInfo from './StoreInfo';

import Login from './admin/pages/Login';
import Dashboard from './admin/pages/Dashboard';
import Products from './admin/pages/Products';
import Collections from './admin/pages/Collections';
import Inventory from './admin/pages/Inventory';
import Categories from './admin/pages/Categories';
import Settings from './admin/pages/Settings';
import SizeGuides from './admin/pages/SizeGuides';
import AdminSidebar from './admin/components/AdminSidebar';
import './fercastillo-theme.css';

import { getCurrentAdmin } from './admin/services/adminApi';
import type { Admin } from './admin/services/adminApi';

interface ProtectedRouteProps {
    children: ReactNode;
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
    const [admin, setAdmin] = useState<Admin | null>(null);
    const [checking, setChecking] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;

        async function verifySession() {
            try {
                const currentAdmin = await getCurrentAdmin();

                if (active) {
                    setAdmin(currentAdmin);
                }
            } catch {
                if (active) {
                    setFailed(true);
                }
            } finally {
                if (active) {
                    setChecking(false);
                }
            }
        }

        void verifySession();

        return () => {
            active = false;
        };
    }, []);

    if (checking) {
        return (
            <div className="route-loading">
                FerCastillo® — VERIFYING ACCESS
            </div>
        );
    }

    if (failed) {
        return (
            <div className="route-loading">
                ERROR AL VERIFICAR LA SESIÓN.
                <button onClick={() => window.location.reload()}>
                    REINTENTAR
                </button>
            </div>
        );
    }

    if (!admin) {
        return <Navigate to="/admin/login" replace />;
    }

    return <div className="admin-shell"><AdminSidebar />{children}</div>;
}

function NotFound() {
    return <main className="site not-found-page"><span className="eyebrow">FerCastillo® — 404</span><h1>ESTA RUTA<br />NO EXISTE.</h1><p>La página que buscas no está disponible.</p><Link to="/" className="outline-link">VOLVER A LA TIENDA ↗</Link></main>;
}

function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* TIENDA PÚBLICA */}
                <Route path="/" element={<Storefront />} />
                <Route path="/products/:slug" element={<Storefront />} />
                <Route path="/info" element={<StoreInfo />} />

                {/* ACCESO ADMINISTRATIVO */}
                <Route path="/admin/login" element={<Login />} />

                {/* DASHBOARD */}
                <Route
                    path="/admin"
                    element={
                        <ProtectedRoute>
                            <Dashboard />
                        </ProtectedRoute>
                    }
                />

                {/* PRODUCTOS */}
                <Route
                    path="/admin/products"
                    element={
                        <ProtectedRoute>
                            <Products />
                        </ProtectedRoute>
                    }
                />

                <Route path="/admin/categories" element={<ProtectedRoute><Categories /></ProtectedRoute>} />
                <Route path="/admin/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/admin/size-guides" element={<ProtectedRoute><SizeGuides /></ProtectedRoute>} />

                {/* COLECCIONES */}
                <Route
                    path="/admin/collections"
                    element={
                        <ProtectedRoute>
                            <Collections />
                        </ProtectedRoute>
                    }
                />

                {/* INVENTARIO */}
                <Route
                    path="/admin/inventory"
                    element={
                        <ProtectedRoute>
                            <Inventory />
                        </ProtectedRoute>
                    }
                />

                <Route path="*" element={<NotFound />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
