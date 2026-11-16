import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { deleteCategory, getCategories, saveCategory } from '../services/adminApi';
import type { Category, CategoryInput } from '../services/adminApi';
import './Categories.css';

const emptyForm: CategoryInput = { name: '', description: '', sortOrder: 0, isActive: true };

export default function Categories() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState<CategoryInput>(emptyForm);
    const [editingId, setEditingId] = useState<string | undefined>();
    const [editorOpen, setEditorOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function refresh() {
        setCategories(await getCategories(true));
    }

    useEffect(() => {
        let active = true;
        const timer = window.setTimeout(() => {
            void getCategories(true).then(data => { if (active) setCategories(data); })
                .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'No fue posible cargar las categorías.'); })
                .finally(() => { if (active) setLoading(false); });
        }, 0);
        return () => { active = false; window.clearTimeout(timer); };
    }, []);

    const filtered = useMemo(() => categories.filter(category =>
        `${category.name} ${category.slug} ${category.description || ''}`.toLowerCase().includes(search.toLowerCase())
    ), [categories, search]);

    function openEditor(category?: Category) {
        setEditingId(category?.id);
        setForm(category ? {
            name: category.name,
            description: category.description || '',
            sortOrder: category.sort_order || 0,
            isActive: Boolean(category.isActive),
        } : { ...emptyForm });
        setError('');
        setEditorOpen(true);
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            await saveCategory({ ...form, name: form.name.trim(), description: form.description.trim() }, editingId);
            await refresh();
            setEditorOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No fue posible guardar la categoría.');
        } finally {
            setSaving(false);
        }
    }

    async function toggleActive(category: Category) {
        try {
            await saveCategory({
                name: category.name,
                description: category.description || '',
                sortOrder: category.sort_order || 0,
                isActive: !category.isActive,
            }, category.id);
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No fue posible cambiar el estado.');
        }
    }

    async function handleDelete(category: Category) {
        if ((category.productCount || 0) > 0) return;
        if (!window.confirm(`¿Eliminar la categoría “${category.name}”?`)) return;
        try { await deleteCategory(category.id); await refresh(); }
        catch (err) { setError(err instanceof Error ? err.message : 'No fue posible eliminar la categoría.'); }
    }

    return <main className="categories-page">
        <header className="categories-header">
            <div><span className="categories-eyebrow">FerCastillo® — CATÁLOGO</span><h1>Categorías<span>.</span></h1><p>Organiza las prendas y accesorios de la tienda.</p></div>
            <button className="category-primary" onClick={() => openEditor()}>+ Nueva categoría</button>
        </header>
        <section className="categories-stats">
            <article><span>TOTAL</span><strong>{categories.length}</strong></article>
            <article><span>ACTIVAS</span><strong>{categories.filter(category => Boolean(category.isActive)).length}</strong></article>
            <article><span>PRODUCTOS ASIGNADOS</span><strong>{categories.reduce((sum, category) => sum + (category.productCount || 0), 0)}</strong></article>
        </section>
        {error && <div className="categories-error" role="alert">{error}</div>}
        <section className="categories-panel">
            <div className="categories-toolbar"><h2>Administrar categorías</h2><input type="search" aria-label="Buscar categorías" placeholder="Buscar categoría..." value={search} onChange={event => setSearch(event.target.value)} /></div>
            {loading ? <div className="categories-empty">Cargando categorías...</div> : filtered.length === 0 ? <div className="categories-empty">No hay categorías para mostrar.</div> :
                <div className="categories-table-wrap"><table className="categories-table"><thead><tr><th>CATEGORÍA</th><th>SLUG</th><th>PRODUCTOS</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>
                    {filtered.map(category => <tr key={category.id}>
                        <td><strong>{category.name}</strong>{category.description && <small>{category.description}</small>}</td>
                        <td>{category.slug}</td><td>{category.productCount || 0}</td>
                        <td><span className={`category-status ${category.isActive ? 'active' : 'inactive'}`}>{category.isActive ? 'Activa' : 'Inactiva'}</span></td>
                        <td><div className="category-actions"><button onClick={() => openEditor(category)}>Editar</button><button onClick={() => void toggleActive(category)}>{category.isActive ? 'Desactivar' : 'Activar'}</button><button className="danger" disabled={(category.productCount || 0) > 0} title={(category.productCount || 0) > 0 ? 'Desactívala: tiene productos asociados.' : undefined} onClick={() => void handleDelete(category)}>Eliminar</button></div></td>
                    </tr>)}
                </tbody></table></div>}
        </section>
        {editorOpen && <div className="category-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setEditorOpen(false); }}>
            <form className="category-modal" onSubmit={event => void handleSubmit(event)}>
                <header><div><span className="categories-eyebrow">FerCastillo / CATÁLOGO</span><h2>{editingId ? 'Editar categoría' : 'Nueva categoría'}</h2></div><button type="button" className="category-close" onClick={() => setEditorOpen(false)} aria-label="Cerrar">×</button></header>
                <label>Nombre *<input autoFocus maxLength={80} required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
                <label>Descripción<textarea maxLength={500} rows={4} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
                <label>Orden de visualización<input type="number" min="0" step="1" value={form.sortOrder} onChange={event => setForm({ ...form, sortOrder: Math.max(0, Number(event.target.value) || 0) })} /></label>
                {editingId && <label className="category-active-toggle"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} /> Categoría activa</label>}
                {error && <div className="categories-error" role="alert">{error}</div>}
                <footer><button type="button" className="category-secondary" onClick={() => setEditorOpen(false)} disabled={saving}>Cancelar</button><button className="category-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar categoría'}</button></footer>
            </form>
        </div>}
    </main>;
}
