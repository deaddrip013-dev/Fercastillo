import { useEffect, useState, type FormEvent } from 'react';
import { deleteSizeGuide, getAdminSizeGuides, getCategories, saveSizeGuide } from '../services/adminApi';
import type { Category, SizeGuide, SizeGuideInput } from '../services/adminApi';
import './SizeGuides.css';

const emptyGuide = (): SizeGuideInput => ({ description: '', unitLabel: 'Medidas en centímetros', columns: ['Talla'], rows: [['']] });

export default function SizeGuides() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [guides, setGuides] = useState<SizeGuide[]>([]);
    const [categoryId, setCategoryId] = useState('');
    const [form, setForm] = useState<SizeGuideInput>(emptyGuide);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        let active = true;
        void Promise.all([getCategories(true), getAdminSizeGuides()]).then(([categoryList, guideList]) => {
            if (!active) return;
            setCategories(categoryList);
            setGuides(guideList);
            const firstCategoryId = categoryList[0]?.id || '';
            setCategoryId(firstCategoryId);
            const existing = guideList.find(guide => guide.categoryId === firstCategoryId);
            setForm(existing ? { description: existing.description, unitLabel: existing.unitLabel, columns: [...existing.columns], rows: existing.rows.map(row => [...row]) } : emptyGuide());
        }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'No fue posible cargar las guías.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    function chooseCategory(nextId: string) {
        setCategoryId(nextId);
        setError('');
        setNotice('');
        const existing = guides.find(guide => guide.categoryId === nextId);
        setForm(existing ? { description: existing.description, unitLabel: existing.unitLabel, columns: [...existing.columns], rows: existing.rows.map(row => [...row]) } : emptyGuide());
    }

    function updateColumn(columnIndex: number, value: string) {
        setForm(current => ({ ...current, columns: current.columns.map((column, index) => index === columnIndex ? value : column) }));
    }

    function updateCell(rowIndex: number, columnIndex: number, value: string) {
        setForm(current => ({ ...current, rows: current.rows.map((row, index) => index === rowIndex ? row.map((cell, cellIndex) => cellIndex === columnIndex ? value : cell) : row) }));
    }

    function addColumn() {
        if (form.columns.length >= 12) return;
        setForm(current => ({ ...current, columns: [...current.columns, ''], rows: current.rows.map(row => [...row, '']) }));
    }

    function removeColumn(columnIndex: number) {
        if (form.columns.length <= 1) return;
        setForm(current => ({ ...current, columns: current.columns.filter((_, index) => index !== columnIndex), rows: current.rows.map(row => row.filter((_, index) => index !== columnIndex)) }));
    }

    function addRow() {
        if (form.rows.length >= 100) return;
        setForm(current => ({ ...current, rows: [...current.rows, current.columns.map(() => '')] }));
    }

    function removeRow(rowIndex: number) {
        if (form.rows.length <= 1) return;
        setForm(current => ({ ...current, rows: current.rows.filter((_, index) => index !== rowIndex) }));
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!categoryId) return;
        setSaving(true);
        setError('');
        setNotice('');
        try {
            const normalized = { ...form, description: form.description.trim(), unitLabel: form.unitLabel.trim(), columns: form.columns.map(column => column.trim()), rows: form.rows.map(row => row.map(cell => cell.trim())) };
            await saveSizeGuide(categoryId, normalized);
            const refreshed = await getAdminSizeGuides();
            setGuides(refreshed);
            const saved = refreshed.find(guide => guide.categoryId === categoryId);
            if (saved) setForm({ description: saved.description, unitLabel: saved.unitLabel, columns: [...saved.columns], rows: saved.rows.map(row => [...row]) });
            setNotice('Guía guardada correctamente.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No fue posible guardar la guía.');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        const selected = categories.find(category => category.id === categoryId);
        if (!selected || !guides.some(guide => guide.categoryId === categoryId)) return;
        if (!window.confirm(`¿Eliminar la guía de tallas de ${selected.name}?`)) return;
        setSaving(true);
        setError('');
        setNotice('');
        try {
            await deleteSizeGuide(categoryId);
            setGuides(current => current.filter(guide => guide.categoryId !== categoryId));
            setForm(emptyGuide());
            setNotice('Guía eliminada.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No fue posible eliminar la guía.');
        } finally {
            setSaving(false);
        }
    }

    const selectedCategory = categories.find(category => category.id === categoryId);
    const isConfigured = guides.some(guide => guide.categoryId === categoryId);

    return <main className="size-guides-admin">
        <header className="size-guides-admin-heading"><div><span>FerCastillo® — CONTENIDO DE TIENDA</span><h1>Info tallas<span>.</span></h1><p>Diseña una tabla distinta para cada categoría. Los cambios se muestran en la guía pública.</p></div></header>
        {error && <div className="size-guides-admin-message error" role="alert">{error}</div>}
        {notice && <div className="size-guides-admin-message success" role="status">{notice}</div>}
        {loading ? <section className="size-guides-admin-panel">Cargando información…</section> : categories.length === 0 ? <section className="size-guides-admin-panel">Primero crea una categoría para configurar su guía de tallas.</section> : <>
            <section className="size-guides-admin-panel size-guides-category-picker"><label htmlFor="size-guide-category">Categoría</label><select id="size-guide-category" value={categoryId} onChange={event => chooseCategory(event.target.value)}>{categories.map(category => <option key={category.id} value={category.id}>{category.name}{guides.some(guide => guide.categoryId === category.id) ? ' · Configurada' : ' · Sin configurar'}</option>)}</select><span>{isConfigured ? 'Esta categoría ya tiene una guía pública.' : 'Completa la tabla y guarda para publicar la guía.'}</span></section>
            <form className="size-guides-admin-panel size-guides-editor" onSubmit={event => void handleSubmit(event)}>
                <div className="size-guides-editor-title"><div><span>GUIA POR CATEGORÍA</span><h2>{selectedCategory?.name || 'Categoría'}</h2></div><span className={`size-guide-badge${isConfigured ? ' is-configured' : ''}`}>{isConfigured ? 'PUBLICADA' : 'BORRADOR'}</span></div>
                <label className="size-guide-field">Texto de introducción<textarea maxLength={1000} rows={3} placeholder="Ej.: Prendas en corte oversize, de caída ancha y hombro descolgado…" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
                <label className="size-guide-field size-guide-units">Nota de medidas<input maxLength={80} value={form.unitLabel} onChange={event => setForm({ ...form, unitLabel: event.target.value })} /></label>
                <div className="size-guide-table-heading"><div><h3>Columnas y medidas</h3><p>Escribe los encabezados y cada valor tal como quieres que se vea en la tienda.</p></div><button type="button" className="size-guide-action" disabled={form.columns.length >= 12} onClick={addColumn}>+ Añadir columna</button></div>
                <div className="size-guide-table-scroll"><table className="size-guide-edit-table"><thead><tr>{form.columns.map((column, columnIndex) => <th key={`head-${columnIndex}`}><div><input required maxLength={40} aria-label={`Encabezado ${columnIndex + 1}`} placeholder={columnIndex === 0 ? 'Talla' : 'Encabezado'} value={column} onChange={event => updateColumn(columnIndex, event.target.value)} /><button type="button" aria-label={`Eliminar columna ${column || columnIndex + 1}`} disabled={form.columns.length <= 1} onClick={() => removeColumn(columnIndex)}>×</button></div></th>)}<th className="size-guide-row-action-header">Fila</th></tr></thead><tbody>{form.rows.map((row, rowIndex) => <tr key={`row-${rowIndex}`}>{form.columns.map((_, columnIndex) => <td key={`cell-${rowIndex}-${columnIndex}`}><input maxLength={80} aria-label={`${form.columns[columnIndex] || `Columna ${columnIndex + 1}`}, fila ${rowIndex + 1}`} value={row[columnIndex] ?? ''} onChange={event => updateCell(rowIndex, columnIndex, event.target.value)} /></td>)}<td><button type="button" className="size-guide-remove-row" disabled={form.rows.length <= 1} onClick={() => removeRow(rowIndex)}>Eliminar</button></td></tr>)}</tbody></table></div>
                <button type="button" className="size-guide-action size-guide-add-row" disabled={form.rows.length >= 100} onClick={addRow}>+ Añadir talla / fila</button>
                <footer className="size-guide-editor-footer">{isConfigured && <button type="button" className="size-guide-delete" disabled={saving} onClick={() => void handleDelete()}>Eliminar guía</button>}<button type="submit" className="size-guide-save" disabled={saving || !categoryId || form.columns.some(column => !column.trim())}>{saving ? 'Guardando…' : 'Guardar guía'}</button></footer>
            </form>
        </>}
    </main>;
}
