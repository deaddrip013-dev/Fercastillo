// Connect only to this brand's explicitly configured API.
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export interface Admin {
    id: string;
    email: string;
    displayName: string;
}

interface ApiResponse<T> {
    success: boolean;
    message?: string;
    admin?: T;
}

export type ProductStatus = 'draft' | 'published' | 'archived';
export const PRODUCT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type ClothingSize = typeof PRODUCT_SIZES[number];

export interface SizeInput {
    size: ClothingSize;
    isAvailable: boolean;
}

export interface Category {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    sort_order?: number;
    isActive?: number | boolean;
    productCount?: number;
}

export interface CategoryInput {
    name: string;
    description: string;
    sortOrder: number;
    isActive: boolean;
}

export interface SizeGuide {
    categoryId: string;
    categoryName: string;
    categorySlug?: string;
    description: string;
    unitLabel: string;
    columns: string[];
    rows: string[][];
}

export type SizeGuideInput = Pick<SizeGuide, 'description' | 'unitLabel' | 'columns' | 'rows'>;

export interface Collection {
    id: string;
    name: string;
    slug: string;
    status?: string;
    launch_date?: string | null;
    description?: string | null;
    coverImageKey?: string | null;
    sortOrder?: number;
}

export type CollectionInput = { name: string; status: ProductStatus; launchDate: string | null; description: string; sortOrder: number };

export interface Product {
    id: string;
    categoryId: string;
    collectionId: string | null;
    name: string;
    slug: string;
    description: string | null;
    priceCop: number;
    comparePriceCop: number | null;
    status: ProductStatus;
    isFeatured: number;
    sortOrder: number;
    categoryName?: string;
    collectionName?: string | null;
    availableSizesCount?: number;
}

export interface ProductInput {
    name: string;
    categoryId: string;
    collectionId: string | null;
    description: string;
    priceCop: number;
    status: ProductStatus;
    sizes: SizeInput[];
}

export interface ProductSize {
    id: string;
    size: ClothingSize;
    sku: string;
    stock: number;
    isAvailable: number | boolean;
}

export interface ProductImage {
    id: string;
    imageKey: string;
    altText: string | null;
    sortOrder: number;
    isPrimary: number;
}

export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            credentials: 'include',
            headers: {
                ...(options.body && !(typeof FormData !== 'undefined' && options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
                ...options.headers,
            },
        });
    } catch {
        throw new Error('No fue posible conectar con el servidor. Verifica tu conexión.');
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new ApiError(data?.message || 'Ha ocurrido un error en la solicitud.', response.status);
    }
    return data as T;
}

// AUTENTICACIÓN
export async function loginAdmin(email: string, password: string): Promise<Admin> {
    const data = await apiRequest<ApiResponse<Admin>>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
    });
    if (!data.success || !data.admin) throw new Error(data.message || 'No fue posible iniciar sesión.');
    return data.admin;
}

export async function getCurrentAdmin(): Promise<Admin | null> {
    try {
        const data = await apiRequest<ApiResponse<Admin>>('/api/auth/me', { method: 'GET' });
        return data.success && data.admin ? data.admin : null;
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
    }
}

export async function logoutAdmin(): Promise<void> {
    await apiRequest<ApiResponse<null>>('/api/auth/logout', { method: 'POST' });
}

// CATÁLOGO
export async function getCategories(includeInactive = false): Promise<Category[]> {
    const data = await apiRequest<{ success: boolean; categories: Category[] }>(`/api/admin/categories${includeInactive ? '?all=1' : ''}`);
    return data.categories || [];
}

export async function saveCategory(input: CategoryInput, id?: string): Promise<void> {
    await apiRequest(id ? `/api/admin/categories/${encodeURIComponent(id)}` : '/api/admin/categories', {
        method: id ? 'PUT' : 'POST', body: JSON.stringify(input),
    });
}

export async function deleteCategory(id: string): Promise<void> {
    await apiRequest(`/api/admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getCollections(): Promise<Collection[]> {
    const data = await apiRequest<{ success: boolean; collections: Collection[] }>('/api/admin/collections');
    return data.collections || [];
}

export async function saveCollection(input: CollectionInput, id?: string): Promise<string> {
    const data = await apiRequest<{ collectionId?: string }>(id ? `/api/admin/collections/${encodeURIComponent(id)}` : '/api/admin/collections', {
        method: id ? 'PUT' : 'POST', body: JSON.stringify(input),
    });
    return data.collectionId || id || '';
}

export async function uploadCollectionCover(collectionId: string, file: File): Promise<string> {
    const body = new FormData();
    body.append('file', file);
    const data = await apiRequest<{ coverImageKey: string }>(`/api/admin/collections/${encodeURIComponent(collectionId)}/cover`, { method: 'POST', body });
    return data.coverImageKey;
}

export async function deleteCollection(id: string): Promise<void> {
    await apiRequest(`/api/admin/collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getProducts(): Promise<Product[]> {
    const data = await apiRequest<{ success: boolean; products: Product[] }>('/api/admin/products');
    return data.products || [];
}

export interface PublicCatalog {
    categories: Category[];
    collections: Collection[];
    products: Product[];
}

export async function getPublicCatalog(): Promise<PublicCatalog> {
    const data = await apiRequest<{ success: boolean } & PublicCatalog>('/api/storefront/catalog');
    return { categories: data.categories || [], collections: data.collections || [], products: data.products || [] };
}

export async function getPublicSizeGuides(): Promise<SizeGuide[]> {
    const data = await apiRequest<{ success: boolean; guides: SizeGuide[] }>('/api/storefront/size-guides');
    return data.guides || [];
}

export async function getAdminSizeGuides(): Promise<SizeGuide[]> {
    const data = await apiRequest<{ success: boolean; guides: SizeGuide[] }>('/api/admin/size-guides');
    return data.guides || [];
}

export async function saveSizeGuide(categoryId: string, guide: SizeGuideInput): Promise<void> {
    await apiRequest(`/api/admin/size-guides/${encodeURIComponent(categoryId)}`, { method: 'PUT', body: JSON.stringify(guide) });
}

export async function deleteSizeGuide(categoryId: string): Promise<void> {
    await apiRequest(`/api/admin/size-guides/${encodeURIComponent(categoryId)}`, { method: 'DELETE' });
}

export async function getPublicProduct(slug: string): Promise<{ product: Product; sizes: ProductSize[]; images: ProductImage[] }> {
    const data = await apiRequest<{ success: boolean; product: Product; sizes: ProductSize[]; images: ProductImage[] }>(`/api/storefront/products/${encodeURIComponent(slug)}`);
    return data;
}

export function getMediaUrl(imageKey: string): string {
    return `${API_URL}/api/media/${imageKey.split('/').map(encodeURIComponent).join('/')}`;
}

export async function uploadProductImage(productId: string, file: File): Promise<ProductImage> {
    const body = new FormData();
    body.append('file', file);
    const data = await apiRequest<{ success: boolean; image: ProductImage }>(`/api/admin/products/${encodeURIComponent(productId)}/images`, { method: 'POST', body });
    return data.image;
}

export async function updateProductImage(productId: string, image: ProductImage, input: { isPrimary: boolean; sortOrder: number }): Promise<void> {
    await apiRequest(`/api/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(image.id)}`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function deleteProductImage(productId: string, imageId: string): Promise<void> {
    await apiRequest(`/api/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`, { method: 'DELETE' });
}

export interface DashboardSummary {
    products: number;
    publishedProducts: number;
    draftProducts: number;
    activeCategories: number;
    collections: number;
    orders: number;
    pendingOrders: number;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
    return apiRequest<{ success: boolean } & DashboardSummary>('/api/admin/dashboard');
}

export interface StoreSettings {
    store_name?: string;
    store_description?: string;
    whatsapp_number?: string;
    contact_email?: string;
    contact_phone?: string;
    instagram_url?: string;
    tiktok_url?: string;
    shipping_info?: string;
    returns_info?: string;
}

export async function getStoreSettings(): Promise<StoreSettings> {
    const data = await apiRequest<{ success: boolean; settings: StoreSettings }>('/api/admin/settings');
    return data.settings;
}

export async function saveStoreSettings(settings: StoreSettings): Promise<void> {
    await apiRequest('/api/admin/settings', { method: 'PUT', body: JSON.stringify(settings) });
}

export interface PublicStoreSettings { storeName: string; storeDescription: string; whatsappNumber: string; instagramUrl: string; tiktokUrl: string; }

export async function getPublicStoreSettings(): Promise<PublicStoreSettings> {
    const data = await apiRequest<{ success: boolean; settings: PublicStoreSettings }>('/api/storefront/settings');
    return data.settings;
}

export interface OrderInput {
    customerName: string;
    customerPhone: string;
    deliveryMethod: 'shipping' | 'pickup';
    city: string;
    neighborhood: string;
    customerAddress: string;
    customerNotes: string;
    items: Array<{ productId: string; size: string; quantity: number }>;
}

export interface CreatedOrder {
    orderNumber: string;
    totalCop: number;
    whatsappNumber: string;
    items: Array<{ name: string; sku: string | null; size: string; quantity: number; unitPrice: number; subtotal: number }>;
}

export async function prepareWhatsappOrder(input: OrderInput): Promise<CreatedOrder> {
    return apiRequest<{ success: boolean } & CreatedOrder>('/api/orders', { method: 'POST', body: JSON.stringify(input) });
}

export interface InventoryRow {
    sizeId: string;
    productId: string;
    productName: string;
    productStatus: ProductStatus;
    categoryName: string;
    size: ClothingSize;
    isAvailable: number | boolean;
}

export async function getInventory(): Promise<InventoryRow[]> {
    const data = await apiRequest<{ success: boolean; inventory: InventoryRow[] }>('/api/admin/inventory');
    return data.inventory || [];
}

export interface AdminOrder {
    id: string;
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    totalCop: number;
    status: string;
    createdAt: string;
    itemCount: number;
}

export interface AdminOrderDetail extends AdminOrder {
    customerAddress: string | null;
    customerNotes: string | null;
}

export interface AdminOrderItem {
    productName: string;
    sku: string | null;
    size: string;
    quantity: number;
    unitPriceCop: number;
    subtotalCop: number;
}

export async function getOrders(): Promise<AdminOrder[]> {
    const data = await apiRequest<{ success: boolean; orders: AdminOrder[] }>('/api/admin/orders');
    return data.orders || [];
}

export async function getOrder(id: string): Promise<{ order: AdminOrderDetail; items: AdminOrderItem[] }> {
    return apiRequest<{ success: boolean; order: AdminOrderDetail; items: AdminOrderItem[] }>(`/api/admin/orders/${encodeURIComponent(id)}`);
}

export async function updateOrderStatus(id: string, status: string): Promise<void> {
    await apiRequest(`/api/admin/orders/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ status }) });
}

export async function getProduct(id: string): Promise<{
    product: Product;
    sizes: ProductSize[];
    images: ProductImage[];
}> {
    const data = await apiRequest<{
        success: boolean;
        product: Product;
        sizes: ProductSize[];
        images: ProductImage[];
    }>(`/api/admin/products/${encodeURIComponent(id)}`);
    return { product: data.product, sizes: data.sizes || [], images: data.images || [] };
}

export async function createProduct(product: ProductInput): Promise<string> {
    const data = await apiRequest<{ success: boolean; productId: string }>('/api/admin/products', { method: 'POST', body: JSON.stringify(product) });
    return data.productId;
}

export async function updateProduct(id: string, product: ProductInput): Promise<void> {
    await apiRequest(`/api/admin/products/${encodeURIComponent(id)}`, {
        method: 'PUT', body: JSON.stringify(product),
    });
}

export async function deleteProduct(id: string): Promise<void> {
    await apiRequest(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
