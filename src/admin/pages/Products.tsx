import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
    createProduct, deleteProduct, deleteProductImage, getCategories, getCollections,
    getMediaUrl, getProduct, getProducts, PRODUCT_SIZES, updateProduct, updateProductImage, uploadProductImage,
} from '../services/adminApi';
import type { Category, Collection, Product, ProductImage, ProductInput, ProductStatus, SizeInput } from '../services/adminApi';
import './Products.css';

const emptySizes: SizeInput[] = PRODUCT_SIZES.map((size) => ({ size, isAvailable: false }));
const imagePlaceholder = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 600 750%22%3E%3Crect width=%22600%22 height=%22750%22 fill=%22%23181613%22/%3E%3Cpath d=%22M60 375h480%22 stroke=%22%23282622%22/%3E%3C/svg%3E';
const formatPrice = (price: number) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(price);

export default function Products() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [collectionFilter, setCollectionFilter] = useState('all');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', categoryId: '', collectionId: '', description: '', priceCop: '', status: 'draft' as ProductStatus });
    const [sizes, setSizes] = useState<SizeInput[]>(emptySizes);
    const [images, setImages] = useState<ProductImage[]>([]);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const imagePreviews = useMemo(() => imageFiles.map(file => ({ file, url: URL.createObjectURL(file) })), [imageFiles]);

    useEffect(() => () => imagePreviews.forEach(preview => URL.revokeObjectURL(preview.url)), [imagePreviews]);

    async function loadData() {
        setLoading(true);
        setError('');
        try {
            const [productData, categoryData, collectionData] = await Promise.all([
                getProducts(), getCategories(true), getCollections(),
            ]);
            setProducts(productData);
            setCategories(categoryData);
            setCollections(collectionData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No fue posible cargar el catálogo.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const timer = window.setTimeout(() => void loadData(), 0);
        return () => window.clearTimeout(timer);
    }, []);

    const filteredProducts = useMemo(() => products.filter((product) => {
        const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = categoryFilter === 'all' || product.categoryId === categoryFilter;
        const matchesCollection = collectionFilter === 'all' || product.collectionId === collectionFilter;
        return matchesSearch && matchesCategory && matchesCollection;
    }), [products, search, categoryFilter, collectionFilter]);

    function openCreateModal() {
        setEditingId(null);
        setForm({ name: '', categoryId: categories.find(category => Boolean(category.isActive))?.id || '', collectionId: '', description: '', priceCop: '', status: 'draft' });
        setSizes(emptySizes.map(item => ({ ...item })));
        setImages([]);
        setImageFiles([]);
        setError('');
        setModalOpen(true);
    }

    async function openEditModal(product: Product) {
        setError('');
        try {
            const data = await getProduct(product.id);
            setEditingId(product.id);
            setForm({
                name: data.product.name,
                categoryId: data.product.categoryId,
                collectionId: data.product.collectionId || '',
                description: data.product.description || '',
                priceCop: String(data.product.priceCop),
                status: data.product.status,
            });
            setSizes(PRODUCT_SIZES.map(size => {
                const saved = data.sizes.find(item => item.size === size);
                return { size, isAvailable: saved ? Boolean(saved.isAvailable) : false };
            }));
            setImages(data.images);
            setImageFiles([]);
            setModalOpen(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No fue posible consultar el producto.');
        }
    }

    function closeModal() {
        if (!saving) { setModalOpen(false); setEditingId(null); setError(''); }
    }

    function toggleSize(size: SizeInput['size'], checked: boolean) {
        setSizes(current => current.map(item => item.size === size ? { ...item, isAvailable: checked } : item));
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        const price = Number(form.priceCop);
        if (!form.name.trim()) { setError('Escribe el nombre del producto.'); return; }
        if (!form.categoryId) { setError('Selecciona una categoría.'); return; }
        if (form.priceCop.trim() === '' || !Number.isSafeInteger(price) || price < 0 || price > 10000000) {
            setError('El precio debe estar entre $0 y $10.000.000 COP.'); return;
        }

        const payload: ProductInput = {
            name: form.name.trim(), categoryId: form.categoryId,
            collectionId: form.collectionId || null,
            description: form.description.trim(), priceCop: price, status: form.status, sizes,
        };

        setSaving(true);
        const uploadedImages: ProductImage[] = [];
        try {
            let productId = editingId;
            if (productId) await updateProduct(productId, payload);
            else {
                productId = await createProduct(payload);
                setEditingId(productId);
            }
            for (const file of imageFiles) uploadedImages.push(await uploadProductImage(productId, file));
            if (uploadedImages.length) setImages(current => [...current, ...uploadedImages]);
            setImageFiles([]);
            setModalOpen(false);
            setEditingId(null);
            await loadData();
        } catch (err) {
            if (uploadedImages.length) {
                setImages(current => [...current, ...uploadedImages]);
                setImageFiles(current => current.slice(uploadedImages.length));
            }
            setError(err instanceof Error ? err.message : 'No fue posible guardar el producto.');
        } finally {
            setSaving(false);
        }
    }

    async function refreshImages(productId: string) {
        const data = await getProduct(productId);
        setImages(data.images);
    }

    async function choosePrimaryImage(image: ProductImage) {
        if (!editingId) return;
        try { await updateProductImage(editingId, image, { isPrimary: true, sortOrder: image.sortOrder }); await refreshImages(editingId); }
        catch (err) { setError(err instanceof Error ? err.message : 'No fue posible actualizar la imagen principal.'); }
    }

    async function removeImage(image: ProductImage) {
        if (!editingId || !window.confirm('¿Eliminar esta imagen del producto?')) return;
        try { await deleteProductImage(editingId, image.id); await refreshImages(editingId); }
        catch (err) { setError(err instanceof Error ? err.message : 'No fue posible eliminar la imagen.'); }
    }

    async function reorderImage(image: ProductImage, direction: -1 | 1) {
        if (!editingId) return;
        const ordered = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
        const index = ordered.findIndex(item => item.id === image.id);
        const target = index + direction;
        if (target < 0 || target >= ordered.length) return;
        [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
        try {
            await Promise.all(ordered.map((item, sortOrder) => updateProductImage(editingId, item, { isPrimary: Boolean(item.isPrimary), sortOrder })));
            await refreshImages(editingId);
        } catch (err) { setError(err instanceof Error ? err.message : 'No fue posible reordenar las imágenes.'); }
    }

    async function handleDelete(product: Product) {
        if (!window.confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return;
        try { await deleteProduct(product.id); await loadData(); }
        catch (err) { setError(err instanceof Error ? err.message : 'No fue posible eliminar el producto.'); }
    }

    return (
        <main className="products-page">
            <header className="products-header">
                <div><span className="products-eyebrow">FerCastillo® — CATÁLOGO</span><h1>Productos<span>.</span></h1><p>Administra los productos de tu tienda.</p></div>
                <button className="products-primary-button" onClick={openCreateModal} disabled={!categories.length}>+ Nuevo producto</button>
            </header>

            <section className="products-stats">
                <article><span>PRODUCTOS REGISTRADOS</span><strong>{products.length}</strong></article>
                <article><span>CATEGORÍAS</span><strong>{categories.length}</strong></article>
                <article><span>COLECCIONES</span><strong>{collections.length}</strong></article>
            </section>

            <section className="products-panel">
                <div className="products-toolbar">
                    <input type="search" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} />
                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                        <option value="all">Todas las categorías</option>
                        {categories.map(category => <option key={category.id} value={category.id}>{category.name}{!category.isActive ? ' — inactiva' : ''}</option>)}
                    </select>
                    <select value={collectionFilter} onChange={e => setCollectionFilter(e.target.value)}>
                        <option value="all">Todas las colecciones</option>
                        {collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
                    </select>
                </div>
                {error && !modalOpen && <div className="products-alert">{error}</div>}
                {loading ? <div className="products-empty">Cargando catálogo...</div> : filteredProducts.length === 0 ? (
                    <div className="products-empty"><strong>No se encontraron productos</strong><p>{products.length === 0 ? 'Comienza agregando tu primer producto.' : 'Prueba con otra búsqueda o categoría.'}</p></div>
                ) : (
                    <div className="products-table-wrapper"><table className="products-table">
                        <thead><tr><th>PRODUCTO</th><th>CATEGORÍA</th><th>COLECCIÓN</th><th>PRECIO</th><th>ESTADO</th><th>TALLAS DISPONIBLES</th><th>ACCIONES</th></tr></thead>
                        <tbody>{filteredProducts.map(product => <tr key={product.id}>
                            <td><strong>{product.name}</strong></td><td>{product.categoryName || '—'}</td><td>{product.collectionName || '—'}</td>
                            <td>{formatPrice(product.priceCop)}</td><td><span className={`product-status status-${product.status}`}>{product.status}</span></td>
                            <td>{product.availableSizesCount ?? 0} / 6</td>
                            <td><div className="product-actions"><button onClick={() => void openEditModal(product)}>Editar</button><button className="delete-action" onClick={() => void handleDelete(product)}>Eliminar</button></div></td>
                        </tr>)}</tbody>
                    </table></div>
                )}
            </section>

            {modalOpen && <div className="products-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeModal(); }}>
                <section className="products-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
                    <header className="products-modal-header">
                        <div><span className="products-eyebrow">FerCastillo / CATÁLOGO</span><h2 id="product-modal-title">{editingId ? 'Editar producto' : 'Nuevo producto'}</h2></div>
                        <button type="button" className="products-close-button" onClick={closeModal} disabled={saving} aria-label="Cerrar">×</button>
                    </header>

                    <form onSubmit={handleSubmit}>
                        <label className="products-field">Nombre del producto *<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Camisa oversize" maxLength={150} required /></label>
                        <div className="products-form-grid">
                            <label className="products-field">Categoría *<select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })} required><option value="">Seleccionar categoría</option>{categories.filter(category => Boolean(category.isActive) || category.id === form.categoryId).map(category => <option key={category.id} value={category.id}>{category.name}{!category.isActive ? ' — inactiva (asignación existente)' : ''}</option>)}</select></label>
                            <label className="products-field">Colección<select value={form.collectionId} onChange={e => setForm({ ...form, collectionId: e.target.value })}><option value="">Sin colección</option>{collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label>
                        </div>
                        <label className="products-field">Descripción<textarea rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe el producto..." /></label>
                        <label className="products-field">Estado<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as ProductStatus })}><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select></label>
                        <label className="products-field">Precio (COP) *<input type="number" min="0" max="10000000" step="1" value={form.priceCop} onChange={e => { const value = e.target.value; if (value === '' || (/^\d+$/.test(value) && Number(value) <= 10000000)) setForm({ ...form, priceCop: value }); }} placeholder="Ej. 85000" required /><small>Desde $0 hasta $10.000.000 COP</small></label>

                        <section className="products-sizes-section">
                            <div className="products-sizes-heading"><div><span className="products-eyebrow">DISPONIBILIDAD</span><h3>Tallas del producto</h3></div><p>Marca las tallas que se pueden comprar.</p></div>
                            <div className="products-sizes-grid">{sizes.map(item => <label key={item.size} className={`product-size-option ${item.isAvailable ? 'selected' : ''}`}>
                                <input type="checkbox" checked={item.isAvailable} onChange={e => toggleSize(item.size, e.target.checked)} />
                                <strong>{item.size}</strong><span>{item.isAvailable ? 'Disponible' : 'No disponible'}</span>
                            </label>)}</div>
                        </section>

                        <section className="products-images-section">
                            <div className="products-sizes-heading"><div><span className="products-eyebrow">CLOUDFLARE R2</span><h3>Fotografías del producto</h3></div><p>JPG, PNG o WEBP · máximo 5 MB por imagen · hasta 8 imágenes.</p></div>
                            <label className="products-field">Agregar fotografías
                                <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => {
                                    const chosen = Array.from(event.target.files || []);
                                    const invalid = chosen.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0);
                                    if (invalid) setError('Cada fotografía debe ser JPG, PNG o WEBP y pesar 5 MB o menos.');
                                    else if (images.length + imageFiles.length + chosen.length > 8) setError('Cada producto admite un máximo de 8 fotografías.');
                                    else { setError(''); setImageFiles(current => [...current, ...chosen]); }
                                    event.target.value = '';
                                }} />
                            </label>
                            {!editingId && <small className="products-image-note">Las fotografías seleccionadas se guardarán en el bucket R2 al crear el producto.</small>}
                            {(images.length > 0 || imagePreviews.length > 0) && <div className="products-images-grid">
                                {images.map(image => <article key={image.id} className="products-image-card">
                                    <img src={getMediaUrl(image.imageKey)} alt={image.altText || form.name} onError={event => { event.currentTarget.src = imagePlaceholder; }} />
                                    {Boolean(image.isPrimary) && <span>PRINCIPAL</span>}
                                    <div><button type="button" onClick={() => void reorderImage(image, -1)} aria-label="Mover imagen a la izquierda">←</button><button type="button" onClick={() => void choosePrimaryImage(image)}>Principal</button><button type="button" onClick={() => void reorderImage(image, 1)} aria-label="Mover imagen a la derecha">→</button><button type="button" onClick={() => void removeImage(image)} aria-label="Eliminar imagen">×</button></div>
                                </article>)}
                                {imagePreviews.map((preview, index) => <article key={`${preview.file.name}-${index}`} className="products-image-card local"><img src={preview.url} alt={`Vista previa ${preview.file.name}`} /><span>PENDIENTE DE CARGA</span><button type="button" onClick={() => setImageFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}>Quitar</button></article>)}
                            </div>}
                        </section>

                        {error && <div className="products-alert">{error}</div>}
                        <footer className="products-modal-footer"><button type="button" className="products-secondary-button" onClick={closeModal} disabled={saving}>Cancelar</button><button type="submit" className="products-primary-button" disabled={saving}>{saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear producto'}</button></footer>
                    </form>
                </section>
            </div>}
        </main>
    );
}
