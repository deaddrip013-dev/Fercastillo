# FerCastillo

Tienda independiente de ropa y accesorios, basada en la arquitectura de DEADDRIP y adaptada a la identidad visual blanca y rosada de FerCastillo. El proyecto tiene su propio repositorio y no usa el Worker, D1, R2 ni los secretos de DEADDRIP.

## Arquitectura

- `src/`: tienda pública, carrito, flujo de pedido por WhatsApp, páginas informativas y panel administrativo React/TypeScript.
- `src/admin/services/adminApi.tsx`: cliente HTTP. Solo usa `VITE_API_URL`; no tiene URL predeterminada de otra marca.
- `backend/src/index.ts`: API Cloudflare Worker independiente.
- `backend/migrations/`: esquema y cambios D1 propios del proyecto.
- `public/fercastillo-logo.jpg`: logo suministrado para la pestaña y la tienda.

## Desarrollo

```sh
npm ci
npm run dev
```

La tienda muestra un catálogo de muestra hasta que se configure la API FerCastillo. El pedido por WhatsApp y el panel administrativo requieren la API; no se guardan credenciales ni se envían solicitudes a servicios de DEADDRIP.

Para trabajar con el Worker local, crea `.env.local` con `VITE_API_URL=http://localhost:8787`, instala también las dependencias dentro de `backend/` y configura bindings locales propios de D1 y R2. Copia `backend/.dev.vars.example` como `backend/.dev.vars` y usa un valor local aleatorio para `ADMIN_SETUP_TOKEN`.

## Cloudflare: recursos que debe crear el propietario

Conectar este repositorio a Cloudflare Pages publica el frontend, pero para habilitar administración, catálogo real, imágenes y pedidos también hace falta desplegar el Worker independiente. Antes del Worker:

1. Crear una base D1 nueva para FerCastillo y un bucket R2 nuevo.
2. Añadir sus IDs/nombres como bindings `DB` e `IMAGES` en `backend/wrangler.jsonc`.
3. Sustituir `YOUR-FERCASTILLO-PAGES-DOMAIN` por el dominio exacto de Pages en `FRONTEND_ORIGIN`.
4. Aplicar las migraciones D1 de `backend/migrations/` a la base nueva.
5. Configurar `ADMIN_SETUP_TOKEN` como secreto del Worker, desplegar el Worker y crear el primer administrador con `backend/setup-admin.ps1`.
6. Configurar `VITE_API_URL` con la URL del Worker en las variables de build de Pages y reconstruir el frontend.

No se han creado recursos, secretos, base de datos ni despliegues en Cloudflare. Los archivos de configuración no contienen IDs de D1 ni bindings de DEADDRIP.

## Rutas principales

- `/`: tienda, catálogo y colecciones.
- `/products/:slug`: detalle de producto y selección de talla.
- `/info`: guías de tallas y cómo comprar.
- `/admin/login`: acceso de administrador.
- `/admin`: dashboard.
- `/admin/products`, `/admin/categories`, `/admin/collections`, `/admin/inventory`, `/admin/size-guides`, `/admin/settings`: gestión de tienda.

## Verificación

```sh
npm run build
npm run lint
```
