
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    loginAdmin,
    getCurrentAdmin,
} from '../services/adminApi';
import './Login.css';

function Login() {
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);
    const [error, setError] = useState('');

    // Verificar si ya existe una sesión
    useEffect(() => {
        let active = true;

        async function checkSession() {
            try {
                const admin = await getCurrentAdmin();

                if (active && admin) {
                    navigate('/admin', { replace: true });
                }
            } catch {
                if (active) {
                    setError('No se pudo verificar la sesión. Intenta nuevamente.');
                }
            } finally {
                if (active) {
                    setCheckingSession(false);
                }
            }
        }

        checkSession();

        return () => {
            active = false;
        };
    }, [navigate]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setError('');
        setLoading(true);

        try {
            await loginAdmin(email.trim(), password);

            navigate('/admin', { replace: true });
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'No fue posible iniciar sesión.'
            );
        } finally {
            setLoading(false);
        }
    }

    if (checkingSession) {
        return (
            <main className="login-screen">
                <span className="login-loading">FerCastillo®</span>
            </main>
        );
    }

    return (
        <main className="login-screen">

            <div className="login-top">
                <span>FerCastillo®</span>
                <span>ADMINISTRATION SYSTEM</span>
            </div>

            <section className="login-container">

                <div className="login-brand">
                    <span className="login-overline">
                        FERCASTILLO — MODA Y ACCESORIOS
                    </span>

                    <h1>
                        CONTROL<br />
                        THE CULTURE<span>.</span>
                    </h1>

                    <p>
                        PANEL DE ADMINISTRACIÓN
                    </p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>

                    <div className="login-form-heading">
                        <span>01 / ACCESS</span>
                        <h2>Bienvenido.</h2>
                        <p>Ingresa tus credenciales para continuar.</p>
                    </div>

                    <div className="login-field">
                        <label htmlFor="email">
                            CORREO ELECTRÓNICO
                        </label>

                        <input
                            id="email"
                            type="email"
                            placeholder="admin@fercastillo.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="username"
                            required
                            disabled={loading}
                        />
                    </div>

                    <div className="login-field">
                        <label htmlFor="password">
                            CONTRASEÑA
                        </label>

                        <input
                            id="password"
                            type="password"
                            placeholder="Ingresa tu contraseña"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                            disabled={loading}
                        />
                    </div>

                    {error && (
                        <div className="login-error" role="alert">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="login-button"
                        disabled={loading || !email.trim() || !password}
                    >
                        {loading ? 'VERIFICANDO...' : 'INICIAR SESIÓN'}
                        <span>↗</span>
                    </button>

                </form>

            </section>

            <footer className="login-footer">
                <span>FerCastillo — MODA Y ACCESORIOS</span>
                <span>PRIVATE ACCESS © 2026</span>
            </footer>

        </main>
    );
}

export default Login;
