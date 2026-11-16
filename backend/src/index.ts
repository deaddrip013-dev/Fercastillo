
/// <reference types="@cloudflare/workers-types" />

interface Env {
    DB: D1Database;
    IMAGES: R2Bucket;
    ADMIN_SETUP_TOKEN: string;
    FRONTEND_ORIGIN: string;
}

const SESSION_DURATION = 7 * 24 * 60 * 60;
const PBKDF2_ITERATIONS = 100000;
const COOKIE_NAME = "__Host-fercastillo_session";

// --------------------------------------------------
// RESPUESTAS HTTP
// --------------------------------------------------

function json(
    data: unknown,
    status = 200,
    origin = ""
): Response {
    const headers = new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
    });

    if (origin) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Credentials", "true");
        headers.set("Vary", "Origin");
    }

    return new Response(JSON.stringify(data), {
        status,
        headers
    });
}

// --------------------------------------------------
// UTILIDADES CRIPTOGRÁFICAS
// --------------------------------------------------

function hex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function randomToken(): string {
    const bytes = crypto.getRandomValues(
        new Uint8Array(32)
    );

    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

async function sha256(value: string): Promise<string> {
    const data = new TextEncoder().encode(value);

    const digest = await crypto.subtle.digest(
        "SHA-256",
        data
    );

    return hex(new Uint8Array(digest));
}

// --------------------------------------------------
// HASH DE CONTRASEÑAS
// --------------------------------------------------

async function hashPassword(
    password: string
): Promise<string> {
    const salt = crypto.getRandomValues(
        new Uint8Array(16)
    );

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const derived = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256"
        },
        key,
        256
    );

    return [
        "pbkdf2",
        PBKDF2_ITERATIONS,
        hex(salt),
        hex(new Uint8Array(derived))
    ].join("$");
}

function constantTimeEqual(
    a: Uint8Array,
    b: Uint8Array
): boolean {
    if (a.length !== b.length) return false;

    let difference = 0;

    for (let i = 0; i < a.length; i++) {
        difference |= a[i] ^ b[i];
    }

    return difference === 0;
}

async function verifyPassword(
    password: string,
    stored: string
): Promise<boolean> {
    const [
        algorithm,
        iterations,
        saltHex,
        expected
    ] = stored.split("$");

    if (
        algorithm !== "pbkdf2" ||
        !iterations ||
        !saltHex ||
        !expected ||
        !/^\d+$/.test(iterations) ||
        Number(iterations) < 100000 ||
        Number(iterations) > 1000000 ||
        !/^[a-f0-9]{32}$/i.test(saltHex) ||
        !/^[a-f0-9]{64}$/i.test(expected)
    ) {
        return false;
    }

    const salt = new Uint8Array(
        saltHex.match(/.{2}/g)!.map(
            byte => parseInt(byte, 16)
        )
    );

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const derived = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt,
            iterations: Number(iterations),
            hash: "SHA-256"
        },
        key,
        256
    );

    const actual = new Uint8Array(derived);

    const expectedBytes = new Uint8Array(
        expected.match(/.{2}/g)!.map(
            byte => parseInt(byte, 16)
        )
    );

    return constantTimeEqual(actual, expectedBytes);
}

// --------------------------------------------------
// COOKIES Y SESIONES
// --------------------------------------------------

function getCookie(
    request: Request,
    name: string
): string | null {
    const cookie = request.headers.get("Cookie") || "";

    for (const part of cookie.split(";")) {
        const [key, ...value] = part.trim().split("=");

        if (key === name) {
            return value.join("=") || null;
        }
    }

    return null;
}

function sessionCookie(token: string): string {
    return [
        `${COOKIE_NAME}=${token}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=None",
        `Max-Age=${SESSION_DURATION}`
    ].join("; ");
}

function clearSessionCookie(): string {
    return [
        `${COOKIE_NAME}=`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=None",
        "Max-Age=0"
    ].join("; ");
}


function validOrigin(request: Request, env: Env) {
    const origin = request.headers.get("Origin");

    if (!origin || !env.FRONTEND_ORIGIN) {
        return null;
    }

    const allowedOrigins = env.FRONTEND_ORIGIN
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    if (!allowedOrigins.includes(origin)) {
        return null;
    }

    return origin;
}


// --------------------------------------------------
// CREAR SESIÓN
// --------------------------------------------------

async function createSession(
    env: Env,
    adminId: string
): Promise<string> {
    const token = randomToken();
    const tokenHash = await sha256(token);

    const expiresAt = new Date(
        Date.now() + SESSION_DURATION * 1000
    ).toISOString();

    await env.DB.prepare(`
    INSERT INTO admin_sessions (
      id,
      admin_id,
      token_hash,
      expires_at
    )
    VALUES (?, ?, ?, ?)
  `).bind(
        crypto.randomUUID(),
        adminId,
        tokenHash,
        expiresAt
    ).run();

    return token;
}

// --------------------------------------------------
// VALIDAR ADMINISTRADOR
// --------------------------------------------------

async function getAuthenticatedAdmin(
    request: Request,
    env: Env
) {
    const token = getCookie(
        request,
        COOKIE_NAME
    );

    if (!token) return null;

    const tokenHash = await sha256(token);

    return await env.DB.prepare(`
    SELECT
      admins.id,
      admins.email,
      admins.display_name
    FROM admin_sessions
    INNER JOIN admins
      ON admins.id = admin_sessions.admin_id
    WHERE admin_sessions.token_hash = ?
      AND admin_sessions.expires_at > ?
      AND admins.is_active = 1
  `).bind(
        tokenHash,
        new Date().toISOString()
    ).first<{
        id: string;
        email: string;
        display_name: string;
    }>();
}

// --------------------------------------------------
// WORKER PRINCIPAL
// --------------------------------------------------

export default {
    async fetch(
        request: Request,
        env: Env
    ): Promise<Response> {

        const url = new URL(request.url);
        const origin = validOrigin(request, env);

        const mediaMatch = url.pathname.match(/^\/api\/media\/(.+)$/);
        if (mediaMatch && request.method === "GET") {
            const key = decodeURIComponent(mediaMatch[1]);
            const productImageKey = /^products\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(key);
            const collectionImageKey = /^collections\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(key);
            if (!productImageKey && !collectionImageKey) {
                return new Response("Not found", { status: 404 });
            }
            if (!env.IMAGES) return new Response("Image storage is not configured", { status: 503 });
            const registered = productImageKey
                ? await env.DB.prepare(`SELECT image_key FROM product_images WHERE image_key = ?`).bind(key).first()
                : await env.DB.prepare(`SELECT cover_image_key FROM collections WHERE cover_image_key = ?`).bind(key).first();
            if (!registered) return new Response("Not found", { status: 404 });
            const object = await env.IMAGES.get(key);
            if (!object) return new Response("Not found", { status: 404 });
            const headers = new Headers({
                "Cache-Control": "public, max-age=31536000, immutable",
                "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
                "Cross-Origin-Resource-Policy": "cross-origin",
                "X-Content-Type-Options": "nosniff",
            });
            object.writeHttpMetadata(headers);
            return new Response(object.body, { headers });
        }

        // CORS
        if (request.method === "OPTIONS") {
            if (!origin) {
                return new Response(null, { status: 403 });
            }

            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "86400",
                    "Vary": "Origin"
                }
            });
        }

        // HEALTH CHECK
        if (
            url.pathname === "/api/health" &&
            request.method === "GET"
        ) {
            const result = await env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
      `).first<{ total: number }>();

            return json({
                success: true,
                message: "FerCastillo API funcionando correctamente",
                database: {
                    connected: true,
                    tables: result?.total ?? 0
                },
                timestamp: new Date().toISOString()
            });
        }

        // VALIDACIÓN DEL ORIGEN PARA AUTH
        if (url.pathname.startsWith("/api/auth/")) {
            if (!origin) {
                return json({
                    success: false,
                    message: "Origen no autorizado"
                }, 403);
            }
        }

        // ------------------------------------------------
        // CREAR PRIMER ADMINISTRADOR
        // ------------------------------------------------

        if (
            url.pathname === "/api/auth/setup" &&
            request.method === "POST"
        ) {
            const authorization =
                request.headers.get("Authorization");

            if (
                !authorization ||
                authorization !== `Bearer ${env.ADMIN_SETUP_TOKEN}`
            ) {
                return json({
                    success: false,
                    message: "No autorizado"
                }, 401, origin!);
            }

            let body: {
                email?: string;
                password?: string;
                displayName?: string;
            };

            try {
                body = await request.json();
            } catch {
                return json({
                    success: false,
                    message: "JSON inválido"
                }, 400, origin!);
            }

            const email = body.email?.trim().toLowerCase();
            const password = body.password;
            const displayName = body.displayName?.trim();

            if (
                !email ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
                !password ||
                password.length < 12 ||
                password.length > 128 ||
                !displayName ||
                displayName.length > 80
            ) {
                return json({
                    success: false,
                    message: "Datos inválidos. La contraseña debe tener entre 12 y 128 caracteres."
                }, 400, origin!);
            }

            const passwordHash = await hashPassword(password);
            const adminId = crypto.randomUUID();

            const result = await env.DB.prepare(`
        INSERT INTO admins (
          id,
          email,
          password_hash,
          display_name
        )
        SELECT ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM admins
        )
      `).bind(
                adminId,
                email,
                passwordHash,
                displayName
            ).run();

            if (!result.meta.changes) {
                return json({
                    success: false,
                    message: "El administrador inicial ya fue creado."
                }, 409, origin!);
            }

            const token = await createSession(env, adminId);

            return new Response(JSON.stringify({
                success: true,
                message: "Administrador creado correctamente."
            }), {
                status: 201,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store",
                    "Access-Control-Allow-Origin": origin!,
                    "Access-Control-Allow-Credentials": "true",
                    "Set-Cookie": sessionCookie(token),
                    "Vary": "Origin"
                }
            });
        }

        // ------------------------------------------------
        // LOGIN
        // ------------------------------------------------

        if (
            url.pathname === "/api/auth/login" &&
            request.method === "POST"
        ) {
            let body: {
                email?: string;
                password?: string;
            };

            try {
                body = await request.json();
            } catch {
                return json({
                    success: false,
                    message: "JSON inválido"
                }, 400, origin!);
            }

            const email = body.email?.trim().toLowerCase();
            const password = body.password;

            if (
                !email ||
                !password ||
                password.length > 128
            ) {
                return json({
                    success: false,
                    message: "Credenciales incorrectas"
                }, 401, origin!);
            }

            const admin = await env.DB.prepare(`
        SELECT
          id,
          email,
          password_hash,
          display_name
        FROM admins
        WHERE email = ?
          AND is_active = 1
      `).bind(email).first<{
                id: string;
                email: string;
                password_hash: string;
                display_name: string;
            }>();

            if (
                !admin ||
                !(await verifyPassword(
                    password,
                    admin.password_hash
                ))
            ) {
                return json({
                    success: false,
                    message: "Credenciales incorrectas"
                }, 401, origin!);
            }

            const token = await createSession(
                env,
                admin.id
            );

            await env.DB.prepare(`
        UPDATE admins
        SET last_login_at = ?
        WHERE id = ?
      `).bind(
                new Date().toISOString(),
                admin.id
            ).run();

            return new Response(JSON.stringify({
                success: true,
                admin: {
                    id: admin.id,
                    email: admin.email,
                    displayName: admin.display_name
                }
            }), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store",
                    "Access-Control-Allow-Origin": origin!,
                    "Access-Control-Allow-Credentials": "true",
                    "Set-Cookie": sessionCookie(token),
                    "Vary": "Origin"
                }
            });
        }

        // ------------------------------------------------
        // CONSULTAR SESIÓN
        // ------------------------------------------------

        if (
            url.pathname === "/api/auth/me" &&
            request.method === "GET"
        ) {
            const admin = await getAuthenticatedAdmin(
                request,
                env
            );

            if (!admin) {
                return json({
                    success: false,
                    message: "Sesión no válida"
                }, 401, origin!);
            }

            return json({
                success: true,
                admin: {
                    id: admin.id,
                    email: admin.email,
                    displayName: admin.display_name
                }
            }, 200, origin!);
        }

        // ------------------------------------------------
        // LOGOUT
        // ------------------------------------------------

        if (
            url.pathname === "/api/auth/logout" &&
            request.method === "POST"
        ) {
            const token = getCookie(
                request,
                COOKIE_NAME
            );

            if (token) {
                await env.DB.prepare(`
          DELETE FROM admin_sessions
          WHERE token_hash = ?
        `).bind(
                    await sha256(token)
                ).run();
            }

            return new Response(JSON.stringify({
                success: true,
                message: "Sesión cerrada correctamente."
            }), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store",
                    "Access-Control-Allow-Origin": origin!,
                    "Access-Control-Allow-Credentials": "true",
                    "Set-Cookie": clearSessionCookie(),
                    "Vary": "Origin"
                }
            });
        }


        if (url.pathname === "/api/storefront/catalog" && request.method === "GET") {
            if (!origin) return json({ success: false, message: "Origen no autorizado" }, 403);
            const [categories, collections, products] = await Promise.all([
                env.DB.prepare(`SELECT id, name, slug FROM categories WHERE is_active = 1 ORDER BY sort_order, name`).all(),
                env.DB.prepare(`SELECT id, name, slug, status, launch_date, description, cover_image_key AS coverImageKey, sort_order AS sortOrder FROM collections WHERE status = 'published' ORDER BY sort_order, name`).all(),
                env.DB.prepare(`
                    SELECT p.id, p.category_id AS categoryId, p.collection_id AS collectionId,
                           p.name, p.slug, p.description, p.price_cop AS priceCop,
                           p.compare_price_cop AS comparePriceCop, p.status,
                           p.is_featured AS isFeatured, p.sort_order AS sortOrder,
                           c.name AS categoryName, co.name AS collectionName,
                           (SELECT pi.image_key FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order LIMIT 1) AS imageKey,
                           COALESCE((SELECT SUM(CASE WHEN ps.is_available = 1 THEN 1 ELSE 0 END) FROM product_sizes ps WHERE ps.product_id = p.id), 0) AS availableSizesCount
                    FROM products p JOIN categories c ON c.id = p.category_id
                    LEFT JOIN collections co ON co.id = p.collection_id AND co.status = 'published'
                    WHERE p.status = 'published' AND c.is_active = 1
                    ORDER BY p.is_featured DESC, p.sort_order, p.created_at DESC
                `).all()
            ]);
            return json({ success: true, categories: categories.results, collections: collections.results, products: products.results }, 200, origin);
        }

        if (url.pathname === "/api/storefront/size-guides" && request.method === "GET") {
            if (!origin) return json({ success: false, message: "Origen no autorizado" }, 403);
            const result = await env.DB.prepare(`
                SELECT g.category_id AS categoryId, c.name AS categoryName, c.slug AS categorySlug,
                       g.description, g.unit_label AS unitLabel,
                       g.columns_json AS columnsJson, g.rows_json AS rowsJson
                FROM category_size_guides g
                JOIN categories c ON c.id = g.category_id
                WHERE c.is_active = 1
                ORDER BY c.sort_order, c.name
            `).all<{ categoryId: string; categoryName: string; categorySlug: string; description: string; unitLabel: string; columnsJson: string; rowsJson: string }>();
            const guides = result.results.map(guide => ({
                categoryId: guide.categoryId,
                categoryName: guide.categoryName,
                categorySlug: guide.categorySlug,
                description: guide.description,
                unitLabel: guide.unitLabel,
                columns: JSON.parse(guide.columnsJson) as string[],
                rows: JSON.parse(guide.rowsJson) as string[][],
            }));
            return json({ success: true, guides }, 200, origin);
        }

        const publicProductMatch = url.pathname.match(/^\/api\/storefront\/products\/([^/]+)$/);
        if (publicProductMatch && request.method === "GET") {
            if (!origin) return json({ success: false, message: "Origen no autorizado" }, 403);
            const slug = decodeURIComponent(publicProductMatch[1]);
            const product = await env.DB.prepare(`
                SELECT p.id, p.category_id AS categoryId, p.collection_id AS collectionId,
                       p.name, p.slug, p.description, p.price_cop AS priceCop,
                       p.compare_price_cop AS comparePriceCop, p.status,
                       c.name AS categoryName, co.name AS collectionName
                FROM products p JOIN categories c ON c.id = p.category_id
                LEFT JOIN collections co ON co.id = p.collection_id AND co.status = 'published'
                WHERE p.slug = ? AND p.status = 'published' AND c.is_active = 1
            `).bind(slug).first();
            if (!product) return json({ success: false, message: "Producto no encontrado." }, 404, origin);
            const [sizes, images] = await Promise.all([
                env.DB.prepare(`SELECT id, size, sku, stock, is_available AS isAvailable FROM product_sizes WHERE product_id = ? ORDER BY size`).bind((product as { id: string }).id).all(),
                env.DB.prepare(`SELECT id, image_key AS imageKey, alt_text AS altText, sort_order AS sortOrder, is_primary AS isPrimary FROM product_images WHERE product_id = ? ORDER BY sort_order`).bind((product as { id: string }).id).all()
            ]);
            return json({ success: true, product, sizes: sizes.results, images: images.results }, 200, origin);
        }

        if (url.pathname === "/api/storefront/settings" && request.method === "GET") {
            const result = await env.DB.prepare(`SELECT setting_key AS key, setting_value AS value FROM store_settings WHERE setting_key IN ('store_name', 'store_description', 'whatsapp_number', 'instagram_url', 'tiktok_url')`).all<{ key: string; value: string | null }>();
            const settings = Object.fromEntries(result.results.map(item => [item.key, item.value || ""]));
            const whatsappNumber = settings.whatsapp_number || "";
            return json({ success: true, settings: { storeName: settings.store_name || "FerCastillo®", storeDescription: settings.store_description || "", whatsappNumber: /^3\d{9}$/.test(whatsappNumber) ? `57${whatsappNumber}` : whatsappNumber, instagramUrl: settings.instagram_url || "", tiktokUrl: settings.tiktok_url || "" } }, 200, origin || "");
        }

        if (url.pathname === "/api/orders" && request.method === "POST") {
            if (!origin) return json({ success: false, message: "Origen no autorizado" }, 403);
            let body: Record<string, unknown>;
            try { body = await request.json() as Record<string, unknown>; }
            catch { return json({ success: false, message: "El contenido JSON no es válido." }, 400, origin); }
            const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
            let customerPhone = typeof body.customerPhone === "string" ? body.customerPhone.replace(/[^\d]/g, "") : "";
            if (customerPhone.startsWith("57") && customerPhone.length === 12) customerPhone = customerPhone.slice(2);
            const deliveryMethod = body.deliveryMethod;
            const city = typeof body.city === "string" ? body.city.trim() : "";
            const neighborhood = typeof body.neighborhood === "string" ? body.neighborhood.trim() : "";
            const customerAddress = typeof body.customerAddress === "string" ? body.customerAddress.trim() : "";
            const customerNotes = typeof body.customerNotes === "string" ? body.customerNotes.trim() : "";
            if (!customerName || customerName.length > 100 || !/^\d{10}$/.test(customerPhone) || !["shipping", "pickup"].includes(String(deliveryMethod)) || (deliveryMethod === "shipping" && (!city || city.length > 100 || !neighborhood || neighborhood.length > 100 || !customerAddress || customerAddress.length > 2000)) || customerNotes.length > 500 || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
                return json({ success: false, message: "Revisa nombre, teléfono colombiano, entrega y artículos del pedido." }, 400, origin);
            }
            const settings = await env.DB.prepare(`SELECT setting_value AS value FROM store_settings WHERE setting_key = 'whatsapp_number'`).first<{ value: string }>();
            let whatsappNumber = settings?.value?.replace(/[^\d]/g, "") || "";
            if (/^3\d{9}$/.test(whatsappNumber)) whatsappNumber = `57${whatsappNumber}`;
            if (!/^57\d{10}$/.test(whatsappNumber)) return json({ success: false, message: "El negocio aún no ha configurado un WhatsApp colombiano válido." }, 409, origin);

            const items: Array<{ productId: string; size: string; quantity: number }> = [];
            const keys = new Set<string>();
            for (const raw of body.items) {
                if (!raw || typeof raw !== "object") return json({ success: false, message: "Hay un artículo no válido en el pedido." }, 400, origin);
                const item = raw as { productId?: unknown; size?: unknown; quantity?: unknown };
                if (typeof item.productId !== "string" || typeof item.size !== "string" || !["XS", "S", "M", "L", "XL", "XXL"].includes(item.size) || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 20) {
                    return json({ success: false, message: "Una talla o cantidad del pedido no es válida." }, 400, origin);
                }
                const key = `${item.productId}:${item.size}`;
                if (keys.has(key)) return json({ success: false, message: "Combina las cantidades duplicadas del mismo producto y talla." }, 400, origin);
                keys.add(key);
                items.push({ productId: item.productId, size: item.size, quantity: Number(item.quantity) });
            }

            const validatedItems: Array<{ productId: string; sizeId: string; name: string; sku: string | null; size: string; quantity: number; unitPrice: number; subtotal: number }> = [];
            for (const item of items) {
                const row = await env.DB.prepare(`
                    SELECT p.id AS productId, p.name, p.price_cop AS unitPrice,
                           ps.id AS sizeId, ps.sku, ps.size
                    FROM products p JOIN categories c ON c.id = p.category_id
                    JOIN product_sizes ps ON ps.product_id = p.id
                    WHERE p.id = ? AND p.status = 'published' AND c.is_active = 1
                      AND ps.size = ? AND ps.is_available = 1
                `).bind(item.productId, item.size).first<{ productId: string; name: string; unitPrice: number; sizeId: string; sku: string | null; size: string }>();
                if (!row) return json({ success: false, message: "Uno de los productos o tallas ya no está disponible." }, 409, origin);
                validatedItems.push({ ...row, quantity: item.quantity, subtotal: row.unitPrice * item.quantity });
            }
            const totalCop = validatedItems.reduce((total, item) => total + item.subtotal, 0);
            if (!Number.isSafeInteger(totalCop)) return json({ success: false, message: "El total del pedido supera el límite permitido." }, 400, origin);
            const orderNumber = `DR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
            return json({ success: true, orderNumber, totalCop, whatsappNumber, customerPhone: `57${customerPhone}`, deliveryMethod, city, neighborhood, customerAddress, customerNotes, items: validatedItems.map(({ name, sku, size, quantity, unitPrice, subtotal }) => ({ name, sku, size, quantity, unitPrice, subtotal })) }, 200, origin);
        }

        // ------------------------------------------------
        // API ADMINISTRATIVA: CATEGORIAS, COLECCIONES Y PRODUCTOS
        // ------------------------------------------------

        if (url.pathname.startsWith("/api/admin/")) {
            if (!origin) {
                return json({
                    success: false,
                    message: "Origen no autorizado"
                }, 403);
            }

            const admin = await getAuthenticatedAdmin(request, env);

            if (!admin) {
                return json({
                    success: false,
                    message: "Debes iniciar sesión para continuar."
                }, 401, origin);
            }

            if (url.pathname === "/api/admin/size-guides" && request.method === "GET") {
                const result = await env.DB.prepare(`
                    SELECT g.category_id AS categoryId, c.name AS categoryName, c.slug AS categorySlug,
                           g.description, g.unit_label AS unitLabel,
                           g.columns_json AS columnsJson, g.rows_json AS rowsJson
                    FROM category_size_guides g
                    JOIN categories c ON c.id = g.category_id
                    ORDER BY c.sort_order, c.name
                `).all<{ categoryId: string; categoryName: string; categorySlug: string; description: string; unitLabel: string; columnsJson: string; rowsJson: string }>();
                const guides = result.results.map(guide => ({
                    categoryId: guide.categoryId,
                    categoryName: guide.categoryName,
                    categorySlug: guide.categorySlug,
                    description: guide.description,
                    unitLabel: guide.unitLabel,
                    columns: JSON.parse(guide.columnsJson) as string[],
                    rows: JSON.parse(guide.rowsJson) as string[][],
                }));
                return json({ success: true, guides }, 200, origin);
            }

            const sizeGuideMatch = url.pathname.match(/^\/api\/admin\/size-guides\/([^/]+)$/);
            if (sizeGuideMatch && request.method === "PUT") {
                const categoryId = decodeURIComponent(sizeGuideMatch[1]);
                let body: Record<string, unknown>;
                try { body = await request.json() as Record<string, unknown>; }
                catch { return json({ success: false, message: "El contenido JSON no es válido." }, 400, origin); }
                const description = typeof body.description === "string" ? body.description.trim() : "";
                const unitLabel = typeof body.unitLabel === "string" ? body.unitLabel.trim() : "";
                const columns = body.columns;
                const rows = body.rows;
                const validColumns = Array.isArray(columns) && columns.length > 0 && columns.length <= 12 && columns.every((column: unknown) => typeof column === "string" && column.trim().length > 0 && column.trim().length <= 40);
                const validRows = Array.isArray(rows) && rows.length > 0 && rows.length <= 100 && rows.every((row: unknown) => Array.isArray(row) && row.length === (Array.isArray(columns) ? columns.length : -1) && row.every((value: unknown) => typeof value === "string" && value.length <= 80));
                if (description.length > 1000 || unitLabel.length > 80 || !unitLabel || !validColumns || !validRows) {
                    return json({ success: false, message: "Revisa los encabezados y valores de la guía. Añade entre 1 y 12 columnas y entre 1 y 100 filas." }, 400, origin);
                }
                const category = await env.DB.prepare(`SELECT id FROM categories WHERE id = ?`).bind(categoryId).first();
                if (!category) return json({ success: false, message: "La categoría no existe." }, 404, origin);
                const normalizedColumns = (columns as string[]).map(column => column.trim());
                await env.DB.prepare(`
                    INSERT INTO category_size_guides (category_id, description, unit_label, columns_json, rows_json, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(category_id) DO UPDATE SET description = excluded.description,
                        unit_label = excluded.unit_label, columns_json = excluded.columns_json,
                        rows_json = excluded.rows_json, updated_at = excluded.updated_at
                `).bind(categoryId, description, unitLabel, JSON.stringify(normalizedColumns), JSON.stringify(rows), new Date().toISOString()).run();
                return json({ success: true, message: "Guía de tallas guardada." }, 200, origin);
            }

            if (sizeGuideMatch && request.method === "DELETE") {
                const categoryId = decodeURIComponent(sizeGuideMatch[1]);
                const result = await env.DB.prepare(`DELETE FROM category_size_guides WHERE category_id = ?`).bind(categoryId).run();
                return result.meta.changes ? json({ success: true, message: "Guía eliminada." }, 200, origin) : json({ success: false, message: "No hay una guía configurada para esta categoría." }, 404, origin);
            }

            const collectionCoverMatch = url.pathname.match(/^\/api\/admin\/collections\/([^/]+)\/cover$/);
            if (collectionCoverMatch && request.method === "POST") {
                if (!env.IMAGES) return json({ success: false, message: "El almacenamiento de imágenes R2 todavía no está configurado." }, 503, origin);
                const collectionId = decodeURIComponent(collectionCoverMatch[1]);
                const collection = await env.DB.prepare(`SELECT id, cover_image_key AS coverImageKey FROM collections WHERE id = ?`).bind(collectionId).first<{ id: string; coverImageKey: string | null }>();
                if (!collection) return json({ success: false, message: "Colección no encontrada." }, 404, origin);
                let form: FormData;
                try { form = await request.formData(); }
                catch { return json({ success: false, message: "No se pudo leer el archivo enviado." }, 400, origin); }
                const file = form.get("file");
                if (!(file instanceof File)) return json({ success: false, message: "Selecciona una imagen." }, 400, origin);
                if (file.size < 1 || file.size > 5 * 1024 * 1024) return json({ success: false, message: "La imagen debe pesar entre 1 byte y 5 MB." }, 413, origin);
                const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
                const valid = file.type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
                    : file.type === "image/png" ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
                        : file.type === "image/webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
                if (!valid) return json({ success: false, message: "Formato no válido. Usa JPG, PNG o WEBP." }, 415, origin);
                const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
                const key = `collections/${crypto.randomUUID()}.${extension}`;
                await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
                try {
                    await env.DB.prepare(`UPDATE collections SET cover_image_key = ?, updated_at = ? WHERE id = ?`).bind(key, new Date().toISOString(), collectionId).run();
                } catch (error) {
                    await env.IMAGES.delete(key);
                    throw error;
                }
                if (collection.coverImageKey) {
                    try { await env.IMAGES.delete(collection.coverImageKey); }
                    catch (error) { console.error("No se pudo limpiar la portada R2 anterior de la colección.", error); }
                }
                return json({ success: true, coverImageKey: key }, 200, origin);
            }

            const imageMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/images(?:\/([^/]+))?$/);
            if (imageMatch) {
                if (!env.IMAGES) return json({ success: false, message: "El almacenamiento de imágenes R2 todavía no está configurado." }, 503, origin);
                const productId = decodeURIComponent(imageMatch[1]);
                const product = await env.DB.prepare(`SELECT id, name FROM products WHERE id = ?`).bind(productId).first<{ id: string; name: string }>();
                if (!product) return json({ success: false, message: "Producto no encontrado." }, 404, origin);

                if (request.method === "POST" && !imageMatch[2]) {
                    let form: FormData;
                    try { form = await request.formData(); }
                    catch { return json({ success: false, message: "No se pudo leer el archivo enviado." }, 400, origin); }
                    const file = form.get("file");
                    if (!(file instanceof File)) return json({ success: false, message: "Selecciona una imagen." }, 400, origin);
                    if (file.size < 1 || file.size > 5 * 1024 * 1024) return json({ success: false, message: "La imagen debe pesar entre 1 byte y 5 MB." }, 413, origin);
                    const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
                        "image/jpeg": bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
                        "image/png": bytes => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
                        "image/webp": bytes => String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
                    };
                    const check = signatures[file.type];
                    if (!check || !check(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) return json({ success: false, message: "Formato no válido. Usa JPG, PNG o WEBP." }, 415, origin);
                    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
                    const imageId = crypto.randomUUID();
                    const key = `products/${productId}/${imageId}.${extension}`;
                    const current = await env.DB.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS lastOrder, MAX(is_primary) AS hasPrimary, COUNT(*) AS imageCount FROM product_images WHERE product_id = ?`).bind(productId).first<{ lastOrder: number; hasPrimary: number; imageCount: number }>();
                    if ((current?.imageCount ?? 0) >= 8) return json({ success: false, message: "Cada producto admite un máximo de 8 fotografías." }, 409, origin);
                    await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
                    try {
                        await env.DB.prepare(`INSERT INTO product_images (id, product_id, image_key, alt_text, sort_order, is_primary) VALUES (?, ?, ?, ?, ?, ?)`)
                            .bind(imageId, productId, key, product.name, (current?.lastOrder ?? -1) + 1, current?.hasPrimary ? 0 : 1).run();
                    } catch (error) {
                        await env.IMAGES.delete(key);
                        throw error;
                    }
                    return json({ success: true, image: { id: imageId, imageKey: key, altText: product.name, sortOrder: (current?.lastOrder ?? -1) + 1, isPrimary: current?.hasPrimary ? 0 : 1 } }, 201, origin);
                }

                if (request.method === "PUT" && imageMatch[2]) {
                    const imageId = decodeURIComponent(imageMatch[2]);
                    const image = await env.DB.prepare(`SELECT id FROM product_images WHERE id = ? AND product_id = ?`).bind(imageId, productId).first();
                    if (!image) return json({ success: false, message: "Imagen no encontrada." }, 404, origin);
                    let body: { isPrimary?: unknown; sortOrder?: unknown };
                    try { body = await request.json() as { isPrimary?: unknown; sortOrder?: unknown }; }
                    catch { return json({ success: false, message: "El contenido JSON no es válido." }, 400, origin); }
                    if (typeof body.isPrimary !== "boolean" || !Number.isSafeInteger(body.sortOrder) || Number(body.sortOrder) < 0) return json({ success: false, message: "Orden o imagen principal no válidos." }, 400, origin);
                    const statements = [];
                    if (body.isPrimary) statements.push(env.DB.prepare(`UPDATE product_images SET is_primary = 0 WHERE product_id = ?`).bind(productId));
                    statements.push(env.DB.prepare(`UPDATE product_images SET is_primary = ?, sort_order = ? WHERE id = ? AND product_id = ?`).bind(body.isPrimary ? 1 : 0, body.sortOrder, imageId, productId));
                    await env.DB.batch(statements);
                    return json({ success: true }, 200, origin);
                }

                if (request.method === "DELETE" && imageMatch[2]) {
                    const imageId = decodeURIComponent(imageMatch[2]);
                    const image = await env.DB.prepare(`SELECT image_key AS imageKey FROM product_images WHERE id = ? AND product_id = ?`).bind(imageId, productId).first<{ imageKey: string }>();
                    if (!image) return json({ success: false, message: "Imagen no encontrada." }, 404, origin);
                    await env.IMAGES.delete(image.imageKey);
                    await env.DB.prepare(`DELETE FROM product_images WHERE id = ?`).bind(imageId).run();
                    return json({ success: true }, 200, origin);
                }
            }


            // CONSULTAR CATEGORIAS
            if (url.pathname === "/api/admin/dashboard" && request.method === "GET") {
                const counts = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM products WHERE status = 'published') AS publishedProducts, (SELECT COUNT(*) FROM products WHERE status = 'draft') AS draftProducts, (SELECT COUNT(*) FROM categories WHERE is_active = 1) AS activeCategories, (SELECT COUNT(*) FROM collections) AS collections, (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pendingOrders`).first<Record<string, number>>();
                return json({ success: true, ...(counts || { products: 0, collections: 0 }) }, 200, origin);
            }

            if (url.pathname === "/api/admin/settings" && request.method === "GET") {
                const rows = await env.DB.prepare(`SELECT setting_key AS key, setting_value AS value FROM store_settings`).all<{ key: string; value: string | null }>();
                return json({ success: true, settings: Object.fromEntries(rows.results.map(row => [row.key, row.value || ""])) }, 200, origin);
            }

            if (url.pathname === "/api/admin/settings" && request.method === "PUT") {
                let body: Record<string, unknown>;
                try { body = await request.json() as Record<string, unknown>; }
                catch { return json({ success: false, message: "El contenido JSON no es válido." }, 400, origin); }
                const limits: Record<string, number> = { store_name: 80, store_description: 500, whatsapp_number: 18, contact_email: 254, contact_phone: 18, instagram_url: 300, tiktok_url: 300, shipping_info: 1000, returns_info: 1000 };
                const values: Array<[string, string]> = [];
                for (const [key, value] of Object.entries(body)) {
                    if (!(key in limits) || typeof value !== "string" || value.length > limits[key]) return json({ success: false, message: `El campo ${key} no es válido.` }, 400, origin);
                    const trimmed = value.trim();
                    if ((key === "whatsapp_number" || key === "contact_phone") && trimmed) {
                        let digits = trimmed.replace(/\D/g, "");
                        if (digits.startsWith("57") && digits.length === 12) digits = digits.slice(2);
                        if (!/^\d{10}$/.test(digits)) return json({ success: false, message: "Ingresa un celular colombiano de 10 dígitos." }, 400, origin);
                        values.push([key, `57${digits}`]);
                        continue;
                    }
                    if (key === "contact_email" && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return json({ success: false, message: "El correo no es válido." }, 400, origin);
                    if ((key === "instagram_url" || key === "tiktok_url") && trimmed) {
                        let parsed: URL;
                        try { parsed = new URL(trimmed); } catch { return json({ success: false, message: "La URL de redes sociales no es válida." }, 400, origin); }
                        if (!["https:", "http:"].includes(parsed.protocol)) return json({ success: false, message: "La URL debe usar HTTP o HTTPS." }, 400, origin);
                    }
                    values.push([key, trimmed]);
                }
                await env.DB.batch(values.map(([key, value]) => env.DB.prepare(`INSERT INTO store_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`).bind(key, value || null, new Date().toISOString())));
                return json({ success: true, message: "Configuración guardada.", settings: Object.fromEntries(values) }, 200, origin);
            }

            if (url.pathname === "/api/admin/orders" && request.method === "GET") {
                const result = await env.DB.prepare(`SELECT o.id, o.order_number AS orderNumber, o.customer_name AS customerName, o.customer_phone AS customerPhone, o.total_cop AS totalCop, o.status, o.created_at AS createdAt, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS itemCount FROM orders o ORDER BY o.created_at DESC`).all();
                return json({ success: true, orders: result.results }, 200, origin);
            }

            const orderMatch = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
            if (orderMatch && request.method === "GET") {
                const orderId = decodeURIComponent(orderMatch[1]);
                const [order, items] = await Promise.all([
                    env.DB.prepare(`SELECT id, order_number AS orderNumber, customer_name AS customerName, customer_phone AS customerPhone, customer_address AS customerAddress, customer_notes AS customerNotes, total_cop AS totalCop, status, created_at AS createdAt FROM orders WHERE id = ?`).bind(orderId).first(),
                    env.DB.prepare(`SELECT product_name AS productName, sku, size, quantity, unit_price_cop AS unitPriceCop, subtotal_cop AS subtotalCop FROM order_items WHERE order_id = ?`).bind(orderId).all()
                ]);
                if (!order) return json({ success: false, message: "Pedido no encontrado." }, 404, origin);
                return json({ success: true, order, items: items.results }, 200, origin);
            }

            if (orderMatch && request.method === "PUT") {
                const orderId = decodeURIComponent(orderMatch[1]);
                let body: { status?: unknown };
                try { body = await request.json() as { status?: unknown }; }
                catch { return json({ success: false, message: "El contenido JSON no es válido." }, 400, origin); }
                const transitions: Record<string, string[]> = { pending: ["confirmed", "cancelled"], confirmed: ["processing", "cancelled"], processing: ["shipped", "cancelled"], shipped: ["delivered"], delivered: [], cancelled: [] };
                const current = await env.DB.prepare(`SELECT status FROM orders WHERE id = ?`).bind(orderId).first<{ status: string }>();
                if (!current) return json({ success: false, message: "Pedido no encontrado." }, 404, origin);
                if (typeof body.status !== "string" || !transitions[current.status]?.includes(body.status)) return json({ success: false, message: "El cambio de estado no está permitido." }, 409, origin);
                await env.DB.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`).bind(body.status, new Date().toISOString(), orderId).run();
                return json({ success: true }, 200, origin);
            }

            if (url.pathname === "/api/admin/inventory" && request.method === "GET") {
                const result = await env.DB.prepare(`SELECT ps.id AS sizeId, p.id AS productId, p.name AS productName, p.status AS productStatus, c.name AS categoryName, ps.size, CASE WHEN ps.is_available = 1 AND p.status = 'published' THEN 1 ELSE 0 END AS isAvailable FROM product_sizes ps JOIN products p ON p.id = ps.product_id JOIN categories c ON c.id = p.category_id ORDER BY p.name, ps.size`).all();
                return json({ success: true, inventory: result.results }, 200, origin);
            }

            if (
                url.pathname === "/api/admin/categories" &&
                request.method === "GET"
            ) {
                const includeInactive = url.searchParams.get("all") === "1";
                const result = await env.DB.prepare(`
                    SELECT id, name, slug, description, image_key,
                           sort_order, is_active AS isActive,
                           (SELECT COUNT(*) FROM products p WHERE p.category_id = categories.id) AS productCount
                    FROM categories
                    WHERE (? = 1 OR is_active = 1)
                    ORDER BY sort_order ASC, name ASC
                `).bind(includeInactive ? 1 : 0).all();

                return json({
                    success: true,
                    categories: result.results
                }, 200, origin);
            }

            if (url.pathname === "/api/admin/categories" && request.method === "POST") {
                let body: Record<string, unknown>;
                try { body = await request.json() as Record<string, unknown>; }
                catch { return json({ success: false, message: "El contenido JSON no es válido." }, 400, origin); }
                const name = typeof body.name === "string" ? body.name.trim() : "";
                const description = typeof body.description === "string" ? body.description.trim() : "";
                const sortOrder = body.sortOrder === undefined ? 0 : body.sortOrder;
                if (!name || name.length > 80 || description.length > 500 || !Number.isSafeInteger(sortOrder) || Number(sortOrder) < 0) {
                    return json({ success: false, message: "Revisa el nombre, la descripción y el orden." }, 400, origin);
                }
                const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                if (!slug) return json({ success: false, message: "No se pudo generar un slug válido." }, 400, origin);
                try {
                    await env.DB.prepare(`INSERT INTO categories (id, name, slug, description, sort_order, is_active) VALUES (?, ?, ?, ?, ?, 1)`)
                        .bind(crypto.randomUUID(), name, slug, description || null, sortOrder).run();
                } catch (error) {
                    if (error instanceof Error && error.message.includes("UNIQUE")) return json({ success: false, message: "Ya existe una categoría con ese nombre o slug." }, 409, origin);
                    throw error;
                }
                return json({ success: true, message: "Categoría creada." }, 201, origin);
            }

            const categoryMatch = url.pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
            if (categoryMatch && request.method === "PUT") {
                const categoryId = decodeURIComponent(categoryMatch[1]);
                let body: Record<string, unknown>;
                try { body = await request.json() as Record<string, unknown>; }
                catch { return json({ success: false, message: "El contenido JSON no es válido." }, 400, origin); }
                const name = typeof body.name === "string" ? body.name.trim() : "";
                const description = typeof body.description === "string" ? body.description.trim() : "";
                const isActive = body.isActive;
                const sortOrder = body.sortOrder;
                if (!name || name.length > 80 || description.length > 500 || typeof isActive !== "boolean" || !Number.isSafeInteger(sortOrder) || Number(sortOrder) < 0) {
                    return json({ success: false, message: "Revisa los datos de la categoría." }, 400, origin);
                }
                const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                try {
                    const result = await env.DB.prepare(`UPDATE categories SET name = ?, slug = ?, description = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?`)
                        .bind(name, slug, description || null, isActive ? 1 : 0, sortOrder, new Date().toISOString(), categoryId).run();
                    if (!result.meta.changes) return json({ success: false, message: "Categoría no encontrada." }, 404, origin);
                } catch (error) {
                    if (error instanceof Error && error.message.includes("UNIQUE")) return json({ success: false, message: "Ya existe una categoría con ese nombre o slug." }, 409, origin);
                    throw error;
                }
                return json({ success: true, message: "Categoría actualizada." }, 200, origin);
            }

            if (categoryMatch && request.method === "DELETE") {
                const categoryId = decodeURIComponent(categoryMatch[1]);
                const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM products WHERE category_id = ?`).bind(categoryId).first<{ total: number }>();
                if ((count?.total ?? 0) > 0) return json({ success: false, message: "La categoría tiene productos asociados. Desactívala para conservar su historial." }, 409, origin);
                const result = await env.DB.prepare(`DELETE FROM categories WHERE id = ?`).bind(categoryId).run();
                return result.meta.changes ? json({ success: true, message: "Categoría eliminada." }, 200, origin) : json({ success: false, message: "Categoría no encontrada." }, 404, origin);
            }

            // CONSULTAR COLECCIONES
            if (
                url.pathname === "/api/admin/collections" &&
                request.method === "GET"
            ) {
                const result = await env.DB.prepare(`
                    SELECT id, name, slug, description,
                           cover_image_key AS coverImageKey, launch_date,
                           status, sort_order AS sortOrder
                    FROM collections
                    ORDER BY sort_order ASC, name ASC
                `).all();

                return json({
                    success: true,
                    collections: result.results
                }, 200, origin);
            }

            if ((url.pathname === "/api/admin/collections" && request.method === "POST") || (/^\/api\/admin\/collections\/[^/]+$/.test(url.pathname) && ["PUT", "DELETE"].includes(request.method))) {
                if (request.method === "DELETE") {
                    const collectionId = decodeURIComponent(url.pathname.split("/").pop() || "");
                    const collection = await env.DB.prepare(`SELECT cover_image_key AS coverImageKey FROM collections WHERE id = ?`).bind(collectionId).first<{ coverImageKey: string | null }>();
                    const result = await env.DB.prepare(`DELETE FROM collections WHERE id = ?`).bind(collectionId).run();
                    if (!result.meta.changes) return json({ success: false, message: "Colección no encontrada." }, 404, origin);
                    if (env.IMAGES && collection?.coverImageKey) {
                        try { await env.IMAGES.delete(collection.coverImageKey); }
                        catch (error) { console.error("No se pudo limpiar la portada R2 de la colección eliminada.", error); }
                    }
                    return json({ success: true, message: "Colección eliminada." }, 200, origin);
                }
                let body: Record<string, unknown>;
                try { body = await request.json() as Record<string, unknown>; }
                catch { return json({ success: false, message: "El contenido JSON no es válido." }, 400, origin); }
                const name = typeof body.name === "string" ? body.name.trim() : "";
                const status = body.status;
                const launchDate = typeof body.launchDate === "string" && body.launchDate ? body.launchDate : null;
                const description = typeof body.description === "string" ? body.description.trim() : "";
                const sortOrder = body.sortOrder === undefined ? 0 : body.sortOrder;
                if (!name || name.length > 120 || description.length > 1000 || !Number.isSafeInteger(sortOrder) || Number(sortOrder) < 0 || !["draft", "published", "archived"].includes(String(status)) || (launchDate && !/^\d{4}-\d{2}-\d{2}$/.test(launchDate))) {
                    return json({ success: false, message: "Revisa el nombre, la descripción, el orden, la fecha y el estado de la colección." }, 400, origin);
                }
                const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                const collectionId = request.method === "POST" ? crypto.randomUUID() : decodeURIComponent(url.pathname.split("/").pop() || "");
                try {
                    if (request.method === "POST") {
                        await env.DB.prepare(`INSERT INTO collections (id, name, slug, description, launch_date, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                            .bind(collectionId, name, slug, description || null, launchDate, status, sortOrder).run();
                    } else {
                        const result = await env.DB.prepare(`UPDATE collections SET name = ?, slug = ?, description = ?, launch_date = ?, status = ?, sort_order = ?, updated_at = ? WHERE id = ?`)
                            .bind(name, slug, description || null, launchDate, status, sortOrder, new Date().toISOString(), collectionId).run();
                        if (!result.meta.changes) return json({ success: false, message: "Colección no encontrada." }, 404, origin);
                    }
                } catch (error) {
                    if (error instanceof Error && error.message.includes("UNIQUE")) return json({ success: false, message: "Ya existe una colección con ese nombre." }, 409, origin);
                    throw error;
                }
                return json({ success: true, collectionId, message: "Colección guardada correctamente." }, request.method === "POST" ? 201 : 200, origin);
            }

            // LISTAR PRODUCTOS
            if (
                url.pathname === "/api/admin/products" &&
                request.method === "GET"
            ) {
                const result = await env.DB.prepare(`
                    SELECT
                        p.id,
                        p.category_id AS categoryId,
                        p.collection_id AS collectionId,
                        p.name,
                        p.slug,
                        p.description,
                        p.price_cop AS priceCop,
                        p.compare_price_cop AS comparePriceCop,
                        p.status,
                        p.is_featured AS isFeatured,
                        p.sort_order AS sortOrder,
                        p.created_at AS createdAt,
                        c.name AS categoryName,
                        co.name AS collectionName,
                        COALESCE((
                            SELECT SUM(CASE WHEN ps.is_available = 1 THEN 1 ELSE 0 END)
                            FROM product_sizes ps
                            WHERE ps.product_id = p.id
                    ), 0) AS availableSizesCount
                    FROM products p
                    INNER JOIN categories c
                        ON c.id = p.category_id
                    LEFT JOIN collections co
                        ON co.id = p.collection_id
                    ORDER BY p.created_at DESC
                `).all();

                return json({
                    success: true,
                    products: result.results
                }, 200, origin);
            }

            // CONSULTAR UN PRODUCTO
            const productMatch = url.pathname.match(
                /^\/api\/admin\/products\/([^/]+)$/
            );

            if (productMatch && request.method === "GET") {
                const productId = decodeURIComponent(productMatch[1]);

                const product = await env.DB.prepare(`
                    SELECT
                        p.id,
                        p.category_id AS categoryId,
                        p.collection_id AS collectionId,
                        p.name,
                        p.slug,
                        p.description,
                        p.price_cop AS priceCop,
                        p.compare_price_cop AS comparePriceCop,
                        p.status,
                        p.is_featured AS isFeatured,
                        p.sort_order AS sortOrder,
                        c.name AS categoryName,
                        co.name AS collectionName
                    FROM products p
                    INNER JOIN categories c
                        ON c.id = p.category_id
                    LEFT JOIN collections co
                        ON co.id = p.collection_id
                    WHERE p.id = ?
                `).bind(productId).first();

                if (!product) {
                    return json({
                        success: false,
                        message: "Producto no encontrado."
                    }, 404, origin);
                }

                const [sizes, images] = await Promise.all([
                    env.DB.prepare(`
                        SELECT id, size, sku, is_available AS isAvailable
                        FROM product_sizes
                        WHERE product_id = ?
                        ORDER BY size ASC
                    `).bind(productId).all(),

                    env.DB.prepare(`
                        SELECT id, image_key AS imageKey,
                               alt_text AS altText,
                               sort_order AS sortOrder,
                               is_primary AS isPrimary
                        FROM product_images
                        WHERE product_id = ?
                        ORDER BY sort_order ASC
                    `).bind(productId).all()
                ]);

                return json({
                    success: true,
                    product,
                    sizes: sizes.results,
                    images: images.results
                }, 200, origin);
            }

            // CREAR PRODUCTO
            if (
                url.pathname === "/api/admin/products" &&
                request.method === "POST"
            ) {
                let body: Record<string, unknown>;

                try {
                    body = await request.json() as Record<string, unknown>;
                } catch {
                    return json({
                        success: false,
                        message: "El contenido JSON no es válido."
                    }, 400, origin);
                }

                const name = typeof body.name === "string" ? body.name.trim() : "";
                const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
                const collectionId = typeof body.collectionId === "string" && body.collectionId.trim()
                    ? body.collectionId.trim()
                    : null;
                const description = typeof body.description === "string" ? body.description.trim() : null;
                const priceCop = body.priceCop;
                const status = body.status;
                const allowedSizes = ["XS", "S", "M", "L", "XL", "XXL"];

                if (
                    !name || name.length > 150 || !categoryId ||
                    !Number.isSafeInteger(priceCop) || Number(priceCop) < 0 || Number(priceCop) > 10000000 ||
                    !["draft", "published", "archived"].includes(String(status)) ||
                    !Array.isArray(body.sizes) || body.sizes.length !== allowedSizes.length
                ) {
                    return json({ success: false, message: "Revisa el nombre, categoría, precio y tallas." }, 400, origin);
                }

                const normalizedSizes: { size: string; isAvailable: boolean }[] = [];
                for (const item of body.sizes) {
                    if (
                        !item || typeof item !== "object" ||
                        !allowedSizes.includes((item as { size?: string }).size || "") ||
                        typeof (item as { isAvailable?: unknown }).isAvailable !== "boolean"
                    ) {
                        return json({ success: false, message: "La información de las tallas no es válida." }, 400, origin);
                    }
                    normalizedSizes.push({
                        size: (item as { size: string }).size,
                        isAvailable: (item as { isAvailable: boolean }).isAvailable,
                    });
                }

                if (
                    new Set(normalizedSizes.map(item => item.size)).size !== allowedSizes.length ||
                    !allowedSizes.every(size => normalizedSizes.some(item => item.size === size))
                ) {
                    return json({ success: false, message: "Debes enviar todas las tallas." }, 400, origin);
                }

                const activeCategory = await env.DB.prepare(`SELECT id FROM categories WHERE id = ? AND is_active = 1`).bind(categoryId).first();
                if (!activeCategory) return json({ success: false, message: "Selecciona una categoría activa." }, 400, origin);

                const slug = name.normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "");

                if (!slug) {
                    return json({ success: false, message: "No se pudo generar un identificador válido." }, 400, origin);
                }

                const id = crypto.randomUUID();
                const statements = [
                    env.DB.prepare(`
                        INSERT INTO products (
                            id, category_id, collection_id, name, slug, description,
                            price_cop, compare_price_cop, status, is_featured, sort_order
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, 0)
                    `).bind(id, categoryId, collectionId, name, slug, description, priceCop, status),
                    ...normalizedSizes.map(item => env.DB.prepare(`
                        INSERT INTO product_sizes (id, product_id, size, sku, stock, is_available)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).bind(
                        crypto.randomUUID(), id, item.size,
                        `${slug}-${item.size.toLowerCase()}`,
                        item.isAvailable ? 1 : 0, item.isAvailable ? 1 : 0
                    ))
                ];

                try {
                    await env.DB.batch(statements);
                } catch (error) {
                    const message = error instanceof Error ? error.message : "";
                    if (message.includes("UNIQUE") || message.includes("FOREIGN KEY")) {
                        return json({
                            success: false,
                            message: "El nombre del producto ya existe o la categoría/colección seleccionada no es válida."
                        }, 409, origin);
                    }
                    throw error;
                }

                return json({
                    success: true,
                    message: "Producto y tallas guardados correctamente.",
                    productId: id
                }, 201, origin);
            }

            // EDITAR PRODUCTO
            if (productMatch && request.method === "PUT") {
                const productId = decodeURIComponent(productMatch[1]);
                let body: Record<string, unknown>;

                try {
                    body = await request.json() as Record<string, unknown>;
                } catch {
                    return json({ success: false, message: "El contenido JSON no es válido." }, 400, origin);
                }

                const current = await env.DB.prepare(`
                    SELECT id, category_id AS categoryId FROM products WHERE id = ?
                `).bind(productId).first<{ id: string; categoryId: string }>();

                if (!current) {
                    return json({ success: false, message: "Producto no encontrado." }, 404, origin);
                }

                const name = typeof body.name === "string" ? body.name.trim() : "";
                const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
                const collectionId = typeof body.collectionId === "string" && body.collectionId.trim()
                    ? body.collectionId.trim()
                    : null;
                const description = typeof body.description === "string" ? body.description.trim() : null;
                const priceCop = body.priceCop;
                const status = body.status;
                const allowedSizes = ["XS", "S", "M", "L", "XL", "XXL"];

                if (
                    !name || name.length > 150 || !categoryId ||
                    !Number.isSafeInteger(priceCop) || Number(priceCop) < 0 || Number(priceCop) > 10000000 ||
                    !["draft", "published", "archived"].includes(String(status)) ||
                    !Array.isArray(body.sizes) || body.sizes.length !== allowedSizes.length
                ) {
                    return json({ success: false, message: "Revisa el nombre, categoría, precio y tallas." }, 400, origin);
                }

                const normalizedSizes: { size: string; isAvailable: boolean }[] = [];
                for (const item of body.sizes) {
                    if (
                        !item || typeof item !== "object" ||
                        !allowedSizes.includes((item as { size?: string }).size || "") ||
                        typeof (item as { isAvailable?: unknown }).isAvailable !== "boolean"
                    ) {
                        return json({ success: false, message: "La información de las tallas no es válida." }, 400, origin);
                    }
                    normalizedSizes.push({
                        size: (item as { size: string }).size,
                        isAvailable: (item as { isAvailable: boolean }).isAvailable,
                    });
                }

                if (
                    new Set(normalizedSizes.map(item => item.size)).size !== allowedSizes.length ||
                    !allowedSizes.every(size => normalizedSizes.some(item => item.size === size))
                ) {
                    return json({ success: false, message: "Debes enviar todas las tallas." }, 400, origin);
                }

                if (categoryId !== current.categoryId) {
                    const activeCategory = await env.DB.prepare(`SELECT id FROM categories WHERE id = ? AND is_active = 1`).bind(categoryId).first();
                    if (!activeCategory) return json({ success: false, message: "Selecciona una categoría activa." }, 400, origin);
                }

                const slug = name.normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "");

                const statements = [
                    env.DB.prepare(`
                        UPDATE products
                        SET category_id = ?, collection_id = ?, name = ?, slug = ?,
                            description = ?, price_cop = ?, status = ?,
                            updated_at = ?
                        WHERE id = ?
                    `).bind(
                        categoryId, collectionId, name, slug, description,
                        priceCop, status, new Date().toISOString(), productId
                    ),
                    env.DB.prepare(`DELETE FROM product_sizes WHERE product_id = ?`).bind(productId),
                    ...normalizedSizes.map(item => env.DB.prepare(`
                        INSERT INTO product_sizes (id, product_id, size, sku, stock, is_available)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).bind(
                        crypto.randomUUID(), productId, item.size,
                        `${slug}-${item.size.toLowerCase()}`,
                        item.isAvailable ? 1 : 0, item.isAvailable ? 1 : 0
                    ))
                ];

                try {
                    await env.DB.batch(statements);
                } catch (error) {
                    const message = error instanceof Error ? error.message : "";
                    if (message.includes("UNIQUE") || message.includes("FOREIGN KEY")) {
                        return json({
                            success: false,
                            message: "El nombre ya existe o la categoría/colección no es válida."
                        }, 409, origin);
                    }
                    throw error;
                }

                return json({
                    success: true,
                    message: "Producto y tallas actualizados correctamente."
                }, 200, origin);
            }

            // ELIMINAR PRODUCTO
            if (productMatch && request.method === "DELETE") {
                const productId = decodeURIComponent(productMatch[1]);
                const images = await env.DB.prepare(`SELECT image_key AS imageKey FROM product_images WHERE product_id = ?`).bind(productId).all<{ imageKey: string }>();

                const result = await env.DB.prepare(`
                    DELETE FROM products
                    WHERE id = ?
                `).bind(productId).run();

                if (!result.meta.changes) {
                    return json({
                        success: false,
                        message: "Producto no encontrado."
                    }, 404, origin);
                }

                if (env.IMAGES && images.results.length) {
                    try {
                        await env.IMAGES.delete(images.results.map(image => image.imageKey));
                    } catch (error) {
                        console.error("No se pudieron limpiar todas las imágenes R2 del producto eliminado.", error);
                    }
                }

                return json({
                    success: true,
                    message: "Producto eliminado correctamente."
                }, 200, origin);
            }
        }


        // RUTA NO ENCONTRADA
        return json({
            success: false,
            message: "Endpoint no encontrado"
        }, 404, origin || "");
    }
};
