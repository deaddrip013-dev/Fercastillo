import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError, prepareWhatsappOrder, getMediaUrl, getPublicCatalog, getPublicProduct, getPublicStoreSettings } from './admin/services/adminApi'
import type { Product, ProductImage, ProductSize, PublicStoreSettings } from './admin/services/adminApi'
import './App.css'

const collections = [
    { name: 'ROSA DE TEMPORADA', date: 'NUEVA COLECCIÓN' }, { name: 'ESENCIA FEMENINA', date: 'ROPA Y ACCESORIOS' },
]
const categories = [{ name: 'VER TODO', count: 3 }, { name: 'ROPA', count: 2 }, { name: 'ACCESORIOS', count: 1 }]
const demoProducts = [
    { id: 'demo-1', name: 'LOOK ROSÉ', category: 'ROPA', image: '/images/fercastillo/look-rose.svg', label: 'COLECCIÓN ROSA' },
    { id: 'demo-2', name: 'ESTILO URBANO', category: 'ROPA', image: '/images/fercastillo/estilo.svg', label: 'NUEVO' },
    { id: 'demo-3', name: 'ACCESORIOS', category: 'ACCESORIOS', image: '/images/fercastillo/accesorios.svg', label: 'COMPLEMENTOS' },
]
type StoreCollection = { name: string; date: string; coverImageKey?: string | null; description?: string | null }

type StoreProduct = Product & { imageKey?: string | null; categoryName?: string; collectionName?: string | null; category?: string; image?: string; label?: string }
type CartLine = { productId: string; slug: string; name: string; size: string; quantity: number; unitPrice: number; image: string }
const CART_KEY = 'fercastillo-cart-v1'
const PLACEHOLDER_IMAGE = '/images/fercastillo/look-rose.svg'
const money = (value: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)
const localColombianPhone = (value: string) => {
    const digits = value.replace(/\D/g, '')
    return (digits.startsWith('57') && digits.length === 12 ? digits.slice(2) : digits).slice(0, 10)
}

function readCart(): CartLine[] {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(CART_KEY) || '[]')
        if (!Array.isArray(value)) return []
        return value.filter((line): line is CartLine => Boolean(line && typeof line.productId === 'string' && typeof line.slug === 'string' && typeof line.name === 'string' && typeof line.image === 'string' && typeof line.size === 'string' && Number.isSafeInteger(line.quantity) && line.quantity > 0 && Number.isSafeInteger(line.unitPrice) && line.unitPrice >= 0)).map(line => ({ ...line, quantity: Math.min(line.quantity, 20) }))
    } catch { return [] }
}

function App() {
    const navigate = useNavigate()
    const { slug } = useParams()
    const [menuOpen, setMenuOpen] = useState(false)
    const [selectedCategory, setSelectedCategory] = useState('VER TODO')
    const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [liveProducts, setLiveProducts] = useState<StoreProduct[] | null>(null)
    const [liveCollections, setLiveCollections] = useState<StoreCollection[] | null>(null)
    const [liveCategories, setLiveCategories] = useState<typeof categories | null>(null)
    const [catalogIsDemo, setCatalogIsDemo] = useState(false)
    const [catalogLoading, setCatalogLoading] = useState(true)
    const [cart, setCart] = useState<CartLine[]>(readCart)
    const [cartOpen, setCartOpen] = useState(false)
    const [cartNotice, setCartNotice] = useState('')
    const [detail, setDetail] = useState<{ product: Product; sizes: ProductSize[]; images: ProductImage[] } | null>(null)
    const [detailSlug, setDetailSlug] = useState<string | null>(null)
    const [selectedImageId, setSelectedImageId] = useState('')
    const [selectedSize, setSelectedSize] = useState('')
    const [detailLoading, setDetailLoading] = useState(false)
    const [settings, setSettings] = useState<PublicStoreSettings | null>(null)
    const [checkoutOpen, setCheckoutOpen] = useState(false)
    const [checkoutBusy, setCheckoutBusy] = useState(false)
    const [checkoutError, setCheckoutError] = useState('')
    const [customer, setCustomer] = useState({ name: '', phone: '', deliveryMethod: 'shipping' as 'shipping' | 'pickup', city: '', neighborhood: '', address: '', notes: '' })

    useEffect(() => {
        let active = true
        void getPublicCatalog().then(catalog => {
            if (!active) return
            const mapped = catalog.products as StoreProduct[]
            setCatalogIsDemo(false)
            setLiveProducts(mapped)
            setLiveCollections(catalog.collections.map(collection => ({ name: collection.name, date: collection.launch_date || '', coverImageKey: collection.coverImageKey, description: collection.description })))
            setLiveCategories([{ name: 'VER TODO', count: mapped.length }, ...catalog.categories.map(category => ({ name: category.name, count: mapped.filter(product => product.categoryName === category.name).length }))])
        }).catch(() => { if (active) setCatalogIsDemo(true) }).finally(() => { if (active) setCatalogLoading(false) })
        void getPublicStoreSettings().then(value => { if (active) setSettings(value) }).catch(() => { if (active) setSettings(null) })
        return () => { active = false }
    }, [])

    useEffect(() => {
        if (!slug) return
        let active = true
        void Promise.resolve().then(() => {
            if (active) setDetailLoading(true)
            return getPublicProduct(slug)
        }).then(value => { if (active) { setDetail(value); setDetailSlug(slug); setSelectedSize(''); setSelectedImageId(value.images.find(image => image.isPrimary)?.id ?? value.images[0]?.id ?? '') } }).catch(() => { if (active) { setDetail(null); setDetailSlug(slug) } }).finally(() => { if (active) setDetailLoading(false) })
        return () => { active = false }
    }, [slug])

    useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cart)) }, [cart])

    const visibleProducts: StoreProduct[] = liveProducts ?? demoProducts.map((product, index) => ({ ...product, categoryId: '', collectionId: null, slug: '', description: null, priceCop: 0, comparePriceCop: null, status: 'published' as const, isFeatured: 0, sortOrder: index }))
    const visibleCollections: StoreCollection[] = liveCollections ?? collections
    const visibleCategories = liveCategories ?? categories
    const filteredProducts = useMemo(() => visibleProducts.filter(product => {
        const categoryMatch = selectedCategory === 'VER TODO' || product.categoryName === selectedCategory || ('category' in product && product.category === selectedCategory)
        const collectionMatch = !selectedCollection || product.collectionName === selectedCollection
        return categoryMatch && collectionMatch && product.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    }), [visibleProducts, selectedCategory, selectedCollection, search])
    const cartTotal = cart.reduce((total, line) => total + line.unitPrice * line.quantity, 0)

    const selectCategory = (category: string) => {
        setSelectedCategory(category); setSelectedCollection(null); setMenuOpen(false)
        document.getElementById('store')?.scrollIntoView({ behavior: 'smooth' })
    }
    const selectCollection = (name: string) => {
        setSelectedCollection(name); setSelectedCategory('VER TODO'); setMenuOpen(false); navigate('/#store')
        window.setTimeout(() => document.getElementById('store')?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
    const addToCart = () => {
        if (!detail || catalogIsDemo) return
        const size = detail.sizes.find(item => item.size === selectedSize && Boolean(item.isAvailable))
        if (!size) return
        const alreadyInCart = cart.some(item => item.productId === detail.product.id && item.size === size.size)
        if (!alreadyInCart && cart.length >= 20) { setCartNotice('La bolsa admite hasta 20 combinaciones de producto y talla por pedido.'); setCartOpen(true); return }
        setCartNotice('')
        const image = detail.images.find(item => item.isPrimary) ?? detail.images[0]
        setCart(current => {
            const existing = current.find(item => item.productId === detail.product.id && item.size === size.size)
            if (existing) return current.map(item => item === existing ? { ...item, quantity: Math.min(item.quantity + 1, 20) } : item)
            return [...current, { productId: detail.product.id, slug: detail.product.slug, name: detail.product.name, size: size.size, quantity: 1, unitPrice: detail.product.priceCop, image: image ? getMediaUrl(image.imageKey) : PLACEHOLDER_IMAGE }]
        })
        setCartOpen(true)
    }
    const updateQuantity = (line: CartLine, quantity: number) => setCart(current => quantity <= 0 ? current.filter(item => !(item.productId === line.productId && item.size === line.size)) : current.map(item => item.productId === line.productId && item.size === line.size ? { ...item, quantity: Math.min(quantity, 20) } : item))
    const submitOrder = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault(); setCheckoutError('')
        if (!settings?.whatsappNumber) { setCheckoutError('La tienda todavía no ha configurado su WhatsApp.'); return }
        setCheckoutBusy(true)
        const popup = window.open('about:blank', '_blank')
        try {
            const order = await prepareWhatsappOrder({ customerName: customer.name, customerPhone: customer.phone, deliveryMethod: customer.deliveryMethod, city: customer.city, neighborhood: customer.neighborhood, customerAddress: customer.address, customerNotes: customer.notes, items: cart.map(({ productId, size, quantity }) => ({ productId, size, quantity })) })
            const delivery = customer.deliveryMethod === 'pickup' ? 'Recoger en tienda' : `Envío: ${customer.city}, ${customer.neighborhood}, ${customer.address}`
            const message = [`Hola, quiero confirmar la solicitud ${order.orderNumber}:`, ...order.items.map(item => `• ${item.name} / ${item.size} × ${item.quantity} — ${money(item.subtotal)}`), `Total: ${money(order.totalCop)}`, `Nombre: ${customer.name}`, `Teléfono: +57 ${customer.phone}`, delivery, customer.notes && `Nota: ${customer.notes}`].filter(Boolean).join('\n')
            if (popup) popup.location.href = `https://wa.me/${order.whatsappNumber}?text=${encodeURIComponent(message)}`
            else window.location.href = `https://wa.me/${order.whatsappNumber}?text=${encodeURIComponent(message)}`
            setCart([]); setCheckoutOpen(false); setCartOpen(false); setCustomer({ name: '', phone: '', deliveryMethod: 'shipping', city: '', neighborhood: '', address: '', notes: '' })
        } catch (error) {
            popup?.close()
            if (error instanceof ApiError && (error.status === 409 || error.status === 404)) setCheckoutError(`${error.message} Actualiza el catálogo y vuelve a intentarlo.`)
            else setCheckoutError(error instanceof Error ? error.message : 'No fue posible preparar el mensaje de WhatsApp.')
        } finally { setCheckoutBusy(false) }
    }
    const currentDetail = detailSlug === slug ? detail : null
    const activeImage = currentDetail?.images.find(item => item.id === selectedImageId) ?? currentDetail?.images.find(item => item.isPrimary) ?? currentDetail?.images[0]

    useEffect(() => {
        if (!slug || !currentDetail) return
        document.title = `${currentDetail.product.name} — FerCastillo`
        const descriptionTag = document.querySelector<HTMLMetaElement>('meta[name="description"]')
        if (descriptionTag && currentDetail.product.description) descriptionTag.content = currentDetail.product.description.slice(0, 160)
        return () => {
            document.title = 'FerCastillo — Moda y accesorios'
            if (descriptionTag) descriptionTag.content = 'FerCastillo — ropa y accesorios. Explora las prendas y colecciones disponibles.'
        }
    }, [slug, currentDetail])

    return (
        <main className="site">
            {catalogIsDemo && <div className="catalog-demo-notice">CATÁLOGO DE DEMOSTRACIÓN — contenido local de ejemplo. Los pedidos no están disponibles.</div>}
            <header className="topbar">
                <button className="menu-trigger" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><span>☰</span> MENU</button>
                <Link to="/" className="brand brand-logo"><img src="/fercastillo-logo.jpg" alt="FerCastillo" /></Link>
                <button className="cart-trigger" onClick={() => setCartOpen(true)} aria-label={`Carrito, ${cart.length} productos`}>BOLSA ({cart.reduce((n, line) => n + line.quantity, 0)})</button>
            </header>
            <section className="hero">
                <div className="hero-label"><span>NUEVA COLECCIÓN</span><span>ROPA · ACCESORIOS</span></div>
                <div className="hero-content"><p className="eyebrow">FERCASTILLO — MODA Y ACCESORIOS</p><h1>VISTE<br />TU ESENCIA.</h1><p className="hero-description">{settings?.storeDescription || 'Prendas y accesorios para acompañar tu estilo.'}</p><a href="#store" className="outline-link">EXPLORAR TIENDA <span>↗</span></a></div>
                <div className="hero-bottom"><span>FERCASTILLO</span><span>MODA CON ESENCIA</span></div>
            </section>
            <section className="content-section" id="store">
                <div className="section-heading"><span>— LO ÚLTIMO QUE SALIÓ</span><a href="#categories">VER TODA LA TIENDA →</a></div>
                <h2>LO NUEVO</h2><p className="section-subtitle">Del drop más nuevo al primero.</p>
                <div className="store-tools"><input aria-label="Buscar productos" placeholder="BUSCAR PRODUCTOS" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Filtrar por colección" value={selectedCollection ?? ''} onChange={event => setSelectedCollection(event.target.value || null)}><option value="">TODAS LAS COLECCIONES</option>{visibleCollections.map(collection => <option key={collection.name} value={collection.name}>{collection.name}</option>)}</select></div>
                <div className="active-filter">MOSTRANDO: {selectedCollection ?? selectedCategory}</div>
                {catalogLoading && <p className="empty-products">CARGANDO CATÁLOGO…</p>}
                <div className="products-grid">{!catalogLoading && filteredProducts.map(product => {
                    const image = product.imageKey ? getMediaUrl(product.imageKey) : product.image || PLACEHOLDER_IMAGE
                    const productSlug = product.slug
                    return <article className="product-card" key={product.id}><Link to={productSlug ? `/products/${encodeURIComponent(productSlug)}` : '#store'} className="product-card-link"><div className="product-image"><img src={image} alt={product.name} loading="lazy" onError={event => { event.currentTarget.src = PLACEHOLDER_IMAGE }} /><span className="product-label">{product.isFeatured ? 'FEATURED DROP' : product.collectionName || ('label' in product ? product.label : 'NEW DROP')}</span></div><div className="product-info"><div><h3>{product.name}</h3><span>{product.categoryName || ('category' in product ? product.category : 'FerCastillo')}</span></div><span className="product-price">{catalogIsDemo ? 'DEMO' : money(product.priceCop)}</span></div></Link><Link to={productSlug ? `/products/${encodeURIComponent(productSlug)}` : '#store'} className="product-link">VER PRODUCTO ↗</Link></article>
                })}</div>
                {!catalogLoading && filteredProducts.length === 0 && <p className="empty-products">{liveProducts && liveProducts.length === 0 ? 'PRÓXIMAMENTE — NUEVOS PRODUCTOS.' : 'NO HAY PRODUCTOS PARA ESTA BÚSQUEDA.'}</p>}
            </section>
            <section className="content-section collections-section" id="collections"><div className="section-heading"><span>— DEL DROP MÁS NUEVO AL PRIMERO</span><a href="#collections">VER TODAS →</a></div><h2>COLECCIONES</h2>
                {visibleCollections.length > 0 ? <div className="collection-covers">{visibleCollections.map((collection, index) => <button onClick={() => selectCollection(collection.name)} className="collection-cover-card" key={collection.name} aria-label={`Explorar colección ${collection.name}`}><img src={collection.coverImageKey ? getMediaUrl(collection.coverImageKey) : '/images/fercastillo/coleccion.svg'} alt={collection.name} loading="lazy" onError={event => { event.currentTarget.src = PLACEHOLDER_IMAGE }} /><span className="collection-cover-content"><small>{String(index + 1).padStart(2, '0')} / COLECCIÓN{collection.date ? ` · ${collection.date}` : ''}</small><strong>{collection.name}.</strong>{collection.description && <span>{collection.description}</span>}<em>EXPLORAR COLECCIÓN ↗</em></span></button>)}</div> : <p className="empty-products">NO HAY COLECCIONES PUBLICADAS.</p>}
            </section>
            <section className="content-section" id="categories"><div className="section-heading"><span>— POR TIPO DE PRENDA</span></div><h2>CATEGORÍAS</h2><div className="category-list">{visibleCategories.map(category => <button className="category-button" key={category.name} onClick={() => selectCategory(category.name)}><span>{category.name}</span><small>{category.count}</small></button>)}</div></section>
            <section className="brand-section"><span>— FERCASTILLO</span><h2>ESTILO<br />CON ESENCIA.</h2><p>Ropa y accesorios elegidos para expresar tu personalidad en cada ocasión.</p></section>
            <footer className="footer" id="contacto"><strong>FerCastillo</strong><p>@fercastillovb</p><span>Moda y accesorios</span></footer>

            {menuOpen && <div className="menu-overlay"><aside className="sidebar"><div className="sidebar-header"><Link to="/" className="brand">FerCastillo<sup>®</sup></Link><button className="close-menu" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú">×</button></div><div className="menu-group"><span className="menu-label">— Tienda</span>{visibleCategories.map(category => <button className="menu-category" key={category.name} onClick={() => selectCategory(category.name)}><span>{category.name}</span><small>{category.count}</small></button>)}</div><div className="menu-group"><span className="menu-label">— Colecciones</span>{visibleCollections.map(collection => <button className="menu-collection" key={collection.name} onClick={() => selectCollection(collection.name)}><strong>{collection.name}</strong><small>{collection.date}</small></button>)}<a href="#collections" className="view-all" onClick={() => setMenuOpen(false)}>VER TODAS →</a></div><div className="menu-group"><span className="menu-label">— Info</span><Link to="/info#guia-tallas" className="info-link" onClick={() => setMenuOpen(false)}>GUÍA DE TALLAS</Link><Link to="/info#como-comprar" className="info-link" onClick={() => setMenuOpen(false)}>CÓMO COMPRAR</Link></div>{(settings?.instagramUrl || settings?.tiktokUrl) && <div className="menu-group social-group"><span className="menu-label">— Redes sociales</span>{settings.instagramUrl && <a href={settings.instagramUrl} target="_blank" rel="noreferrer" className="info-link">INSTAGRAM ↗</a>}{settings.tiktokUrl && <a href={settings.tiktokUrl} target="_blank" rel="noreferrer" className="info-link">TIKTOK ↗</a>}</div>}<div className="sidebar-footer">@fercastillovb — Valledupar, Cesar</div></aside><button className="overlay-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" /></div>}

            {slug && <div className="shop-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) navigate('/') }}><section className="shop-modal product-detail" role="dialog" aria-modal="true" aria-label="Detalle del producto"><button className="shop-modal-close" onClick={() => navigate('/')} aria-label="Cerrar detalle">×</button>{detailLoading || detailSlug !== slug ? <p>CARGANDO PRODUCTO…</p> : !currentDetail ? <><h2>PRODUCTO NO DISPONIBLE</h2><Link to="/" className="outline-link">VOLVER A LA TIENDA ↗</Link></> : <><div className="detail-image">{activeImage ? <img src={getMediaUrl(activeImage.imageKey)} alt={activeImage.altText || currentDetail.product.name} onError={event => { event.currentTarget.src = PLACEHOLDER_IMAGE }} /> : <img src={PLACEHOLDER_IMAGE} alt="" />}</div>{currentDetail.images.length > 1 && <div className="detail-thumbnails">{currentDetail.images.map(image => <button type="button" key={image.id} aria-pressed={selectedImageId === image.id} onClick={() => setSelectedImageId(image.id)}><img src={getMediaUrl(image.imageKey)} alt={image.altText || currentDetail.product.name} onError={event => { event.currentTarget.src = PLACEHOLDER_IMAGE }} /></button>)}</div>}<div className="detail-copy"><span className="menu-label">{currentDetail.product.categoryName || 'FerCastillo'}{currentDetail.product.collectionName ? ` — ${currentDetail.product.collectionName}` : ''}</span><h2>{currentDetail.product.name}</h2><strong className="detail-price">{money(currentDetail.product.priceCop)}</strong>{currentDetail.product.description && <p>{currentDetail.product.description}</p>}<span className="menu-label">SELECCIONA UNA TALLA</span><div className="size-options">{currentDetail.sizes.map(size => <button key={size.id} disabled={!size.isAvailable} aria-pressed={selectedSize === size.size} onClick={() => setSelectedSize(current => current === size.size ? '' : size.size)}>{size.size}{!size.isAvailable && ' — AGOTADA'}</button>)}</div><button className="outline-link detail-add" disabled={!selectedSize} onClick={addToCart}>AÑADIR A LA BOLSA ↗</button><p className="detail-note">La disponibilidad y el precio se confirman por WhatsApp al solicitar tu compra.</p></div></>}</section></div>}

            {cartOpen && <div className="shop-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setCartOpen(false) }}><section className="shop-modal cart-modal" role="dialog" aria-modal="true" aria-label="Bolsa de compras"><button className="shop-modal-close" onClick={() => setCartOpen(false)} aria-label="Cerrar bolsa">×</button><span className="menu-label">— FerCastillo</span><h2>TU BOLSA ({cart.length})</h2>{cart.length === 0 ? <p>Tu bolsa está vacía.</p> : <><div className="cart-lines">{cart.map(line => <article className="cart-line" key={`${line.productId}-${line.size}`}><img src={line.image || PLACEHOLDER_IMAGE} alt={line.name} /><div><strong>{line.name}</strong><small>TALLA {line.size} · {money(line.unitPrice)}</small><div className="quantity-control"><button onClick={() => updateQuantity(line, line.quantity - 1)} aria-label="Reducir cantidad">−</button><span>{line.quantity}</span><button onClick={() => updateQuantity(line, line.quantity + 1)} disabled={line.quantity >= 20} aria-label="Aumentar cantidad">+</button><button className="remove-line" onClick={() => updateQuantity(line, 0)}>ELIMINAR</button></div></div><strong>{money(line.unitPrice * line.quantity)}</strong></article>)}</div><div className="cart-total"><span>TOTAL</span><strong>{money(cartTotal)}</strong></div>{catalogIsDemo && <p>Los pedidos no están disponibles durante la vista de demostración.</p>}<button className="outline-link checkout-button" disabled={catalogIsDemo} onClick={() => { setCheckoutError(''); setCheckoutOpen(true) }}>CONTINUAR POR WHATSAPP ↗</button></>}{cartNotice && <p className="checkout-error">{cartNotice}</p>}</section></div>}

            {checkoutOpen && <div className="shop-modal-backdrop checkout-backdrop"><form className="shop-modal checkout-modal" onSubmit={submitOrder}><button type="button" className="shop-modal-close" onClick={() => setCheckoutOpen(false)} aria-label="Cerrar formulario">×</button><span className="menu-label">— SOLICITUD DE PEDIDO</span><h2>CONFIRMA TUS DATOS</h2><p>Al continuar abriremos WhatsApp para coordinar la compra. No se guardan pedidos en la base de datos ni se realiza un pago aquí.</p><label>Nombre<input required maxLength={100} autoComplete="name" value={customer.name} onChange={event => setCustomer({ ...customer, name: event.target.value })} /></label><label>Teléfono colombiano<div className="checkout-phone"><span>+57</span><input required type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} autoComplete="tel-national" placeholder="3001234567" value={customer.phone} onChange={event => setCustomer({ ...customer, phone: localColombianPhone(event.target.value) })} /></div></label><fieldset className="delivery-method"><legend>Entrega</legend><div className="delivery-options"><label><input type="radio" name="deliveryMethod" checked={customer.deliveryMethod === 'shipping'} onChange={() => setCustomer({ ...customer, deliveryMethod: 'shipping' })} /> Envío</label><label><input type="radio" name="deliveryMethod" checked={customer.deliveryMethod === 'pickup'} onChange={() => setCustomer({ ...customer, deliveryMethod: 'pickup', city: '', neighborhood: '', address: '' })} /> Recoger en tienda</label></div></fieldset>{customer.deliveryMethod === 'shipping' && <><label>Ciudad<input required maxLength={100} autoComplete="address-level2" value={customer.city} onChange={event => setCustomer({ ...customer, city: event.target.value })} /></label><label>Barrio<input required maxLength={100} autoComplete="address-level3" value={customer.neighborhood} onChange={event => setCustomer({ ...customer, neighborhood: event.target.value })} /></label><label>Dirección<textarea required maxLength={2000} autoComplete="street-address" rows={4} value={customer.address} onChange={event => setCustomer({ ...customer, address: event.target.value })} /></label></>}<label>Nota (opcional)<textarea maxLength={500} value={customer.notes} onChange={event => setCustomer({ ...customer, notes: event.target.value })} /></label>{!settings?.whatsappNumber && <p className="checkout-error">WhatsApp aún no está configurado para esta tienda.</p>}{checkoutError && <p className="checkout-error">{checkoutError}</p>}<button className="outline-link checkout-button" disabled={checkoutBusy || cart.length === 0 || !settings?.whatsappNumber}>{checkoutBusy ? 'ABRIENDO WHATSAPP…' : 'CONTINUAR POR WHATSAPP ↗'}</button></form></div>}
        </main>
    )
}

export default App





