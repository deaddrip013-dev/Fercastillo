
import { Link } from 'react-router-dom';
import './Dashboard.css';

const shortcuts = [
    {
        icon: '+',
        title: 'Nuevo producto',
        description: 'Agregar una prenda a la tienda',
        action: '/admin/products',
    },
    {
        icon: '▤',
        title: 'Nueva colección',
        description: 'Crear un nuevo drop',
        action: '/admin/collections',
    },
    {
        icon: '◇',
        title: 'Gestionar categorías',
        description: 'Organizar categorías del catálogo',
        action: '/admin/categories',
    },
    {
        icon: '▦',
        title: 'Consultar inventario',
        description: 'Revisar tallas disponibles',
        action: '/admin/inventory',
    },
];

function Dashboard() {
    return (
        <div className="admin-dashboard">

            <header className="dashboard-heading">
                <div>
                    <span className="admin-eyebrow">
                        FerCastillo® — CONTROL CENTER
                    </span>

                    <h1>
                        DASHBOARD<span>.</span>
                    </h1>

                    <p>
                        Bienvenido al centro de administración de FerCastillo.
                    </p>
                </div>

                <div className="dashboard-date">
                    <span>ADMINISTRACIÓN</span>
                    <strong>FerCastillo®</strong>
                </div>
            </header>

            <section className="dashboard-welcome">
                <div>
                    <span>EST. VALLEDUPAR — COLOMBIA</span>

                    <h2>
                        CONTROL YOUR
                        <br />
                        OWN LEGACY.
                    </h2>

                    <p>
                        Gestiona tus productos, colecciones e inventario
                        desde un solo lugar.
                    </p>
                </div>

                <div className="welcome-mark">
                    DR<span>®</span>
                </div>
            </section>

            <section className="dashboard-shortcuts">
                <div className="dashboard-section-title">
                    <span>01 — ACCESOS RÁPIDOS</span>
                    <span>QUICK ACTIONS</span>
                </div>

                <div className="shortcuts-grid">
                    {shortcuts.map((item) => (
                        <Link
                            to={item.action}
                            className="shortcut-card"
                            key={item.action}
                        >
                            <span className="shortcut-icon">
                                {item.icon}
                            </span>

                            <h3>{item.title}</h3>

                            <p>{item.description}</p>

                            <span className="shortcut-arrow">
                                ↗
                            </span>
                        </Link>
                    ))}
                </div>
            </section>

            <footer className="dashboard-footer">
                <span>FerCastillo® — ADMIN PANEL</span>
                <span>LEGENDS NEVER DIE.</span>
            </footer>

        </div>
    );
}

export default Dashboard;
