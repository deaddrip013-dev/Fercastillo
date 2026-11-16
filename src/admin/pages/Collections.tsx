import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { deleteCollection, getCollections, getMediaUrl, saveCollection, uploadCollectionCover } from '../services/adminApi';
import type { Collection, ProductStatus } from '../services/adminApi';
import './Collections.css';

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

export default function Collections() {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<ProductStatus>('draft');
    const [launchDate, setLaunchDate] = useState('');
    const [sortOrder, setSortOrder] = useState(0);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const previewUrl = useMemo(() => coverFile ? URL.createObjectURL(coverFile) : null, [coverFile]);
    const editingCollection = collections.find(collection => collection.id === editingId);

    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    async function refresh() { setCollections(await getCollections()); }

    function closeEditor() {
        setEditorOpen(false); setEditingId(null); setCoverFile(null); setError('');
    }

    function beginEdit(collection?: Collection) {
        setEditorOpen(true); setEditingId(collection?.id || null); setName(collection?.name || '');
        setDescription(collection?.description || ''); setStatus((collection?.status as ProductStatus) || 'draft');
        setLaunchDate(collection?.launch_date || ''); setSortOrder(collection?.sortOrder || 0); setCoverFile(null); setError('');
    }

    function chooseCover(file?: File) {
        if (!file) { setCoverFile(null); return; }
        if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
            setError('Usa una imagen JPG, PNG o WEBP de máximo 5 MB.'); return;
        }
        setError(''); setCoverFile(file);
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setSaving(true); setError('');
        try {
            const id = await saveCollection({ name: name.trim(), description: description.trim(), status, launchDate: launchDate || null, sortOrder }, editingId || undefined);
            setEditingId(id);
            if (coverFile) await uploadCollectionCover(id, coverFile);
            await refresh(); closeEditor();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No fue posible guardar la colección.');
            if (!editingId) {
                try { const saved = await getCollections(); setCollections(saved); }
                catch { /* Conserva el mensaje del error original. */ }
            }
        } finally { setSaving(false); }
    }

    async function handleDelete(collection: Collection) {
        if (!window.confirm(`¿Eliminar la colección "${collection.name}"? Los productos asociados conservarán su ficha sin colección.`)) return;
        try { await deleteCollection(collection.id); await refresh(); }
        catch (err) { setError(err instanceof Error ? err.message : 'No fue posible eliminar la colección.'); }
    }

    useEffect(() => {
        let active = true;
        void getCollections().then(data => { if (active) setCollections(data); })
            .catch(err => { if (active) setError(err instanceof Error ? err.message : 'No fue posible cargar las colecciones.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    return <main className="collections-page">
        <header className="collections-header"><div><span className="collections-eyebrow">FerCastillo® — CATÁLOGO</span><h1>Colecciones<span>.</span></h1><p>Administra y consulta los drops de la marca.</p></div><button className="collection-action" onClick={() => beginEdit()}>+ Nueva colección</button><div className="collections-counter"><span>TOTAL DE COLECCIONES</span><strong>{collections.length}</strong></div></header>
        {error && <div className="collections-error" role="alert">{error}</div>}
        {editorOpen && <form className="collection-editor" onSubmit={handleSubmit}>
            <h2>{editingId ? 'Editar colección' : 'Nueva colección'}</h2>
            <label>Nombre<input value={name} onChange={event => setName(event.target.value)} maxLength={120} required /></label>
            <label className="collection-description-field">Descripción<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={1000} rows={3} /></label>
            <label>Fecha de lanzamiento<input type="date" value={launchDate} onChange={event => setLaunchDate(event.target.value)} /></label>
            <label>Orden<input type="number" min={0} max={100000} value={sortOrder} onChange={event => setSortOrder(Number(event.target.value))} /></label>
            <label>Estado<select value={status} onChange={event => setStatus(event.target.value as ProductStatus)}><option value="draft">Borrador</option><option value="published">Publicada</option><option value="archived">Archivada</option></select></label>
            <label className="collection-cover-field">Imagen de portada (JPG, PNG o WEBP · máximo 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => chooseCover(event.target.files?.[0])} /></label>
            {(previewUrl || editingCollection?.coverImageKey) && <img className="collection-cover-preview" src={previewUrl || getMediaUrl(editingCollection?.coverImageKey || '')} alt="Vista previa de portada" />}
            <div className="collection-editor-actions"><button className="collection-action" disabled={saving}>{saving ? 'Guardando...' : 'Guardar colección'}</button><button type="button" className="collection-cancel" onClick={closeEditor}>Cancelar</button></div>
        </form>}
        <section className="collections-panel"><div className="collections-panel-heading"><div><span className="collections-eyebrow">COLLECTION MANAGEMENT</span><h2>Tus colecciones</h2></div><span className="collections-total">{collections.length} REGISTRADAS</span></div>
            {loading ? <div className="collections-empty">Cargando colecciones...</div> : collections.length === 0 ? <div className="collections-empty">No hay colecciones registradas.</div> : <div className="collections-table-wrapper"><table className="collections-table"><thead><tr><th>COLECCIÓN</th><th>SLUG</th><th>FECHA DE LANZAMIENTO</th><th>ORDEN</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>
                {collections.map(collection => <tr key={collection.id}><td><strong>{collection.name}</strong>{collection.coverImageKey && <small className="cover-indicator">Portada cargada</small>}</td><td>{collection.slug}</td><td>{collection.launch_date || 'Sin fecha'}</td><td>{collection.sortOrder ?? 0}</td><td><span className={`collection-status status-${collection.status || 'draft'}`}>{collection.status || 'draft'}</span></td><td><div className="collection-actions"><button onClick={() => beginEdit(collection)}>Editar</button><button onClick={() => void handleDelete(collection)}>Eliminar</button></div></td></tr>)}
            </tbody></table></div>}
        </section>
    </main>;
}
