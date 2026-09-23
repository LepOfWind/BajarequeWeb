# Bajareque Outdoor — sitio propio (sin Shopify)

Sitio estático que reemplaza la tienda de Shopify: catálogo, páginas de producto, blog, contacto y un **pedido que se envía por WhatsApp**. No tiene base de datos ni servidor, así que se puede hospedar gratis.

Las direcciones son las mismas que en Shopify (`/products/heady-r`, `/collections/ventiladores`, `/blogs/articulos/...`, `/pages/contact`). Así los enlaces que ya compartiste y los resultados de Google siguen funcionando.

## Estructura

```
Abrir admin.bat         ← doble clic para abrir el panel de administración
admin.mjs, admin/       ← el panel de administración (solo local)
datos/tienda.json       ← TODO el contenido: productos, precios, colecciones, artículos, WhatsApp
static/css/estilos.css  ← diseño
static/js/app.js        ← menú, pedido, galería, búsqueda
static/img/             ← imágenes (se llenan con descargar-imagenes.ps1)
build.mjs               ← genera el sitio en ./sitio
descargar-imagenes.ps1  ← baja las fotos del CDN de Shopify
sitio/                  ← resultado generado (no editar a mano)
```

## Pasos antes de cancelar Shopify

1. **Pon tu número de WhatsApp** en `datos/tienda.json` → `"whatsapp": "507XXXXXXXX"` (código de país + número, sin `+` ni espacios). Si quieres, completa también `correo`, `instagram` y `facebook`.
2. **Descarga las imágenes** (mientras Shopify siga activo):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\descargar-imagenes.ps1
   ```
3. **Genera el sitio**:
   ```powershell
   node build.mjs
   ```
   Si ya no aparece el aviso "imágenes aún se cargan desde Shopify", el sitio no depende de Shopify.
4. **Pruébalo en tu PC**:
   ```powershell
   npx serve sitio      # o:  python -m http.server 8080 -d sitio
   ```
   Hay que abrirlo con un servidor como estos. Si abres el `index.html` directamente, los enlaces no funcionan.

## Publicar gratis en Cloudflare Pages (recomendado)

Cloudflare Pages entiende el archivo `_redirects`, que redirige las direcciones viejas de Shopify que ya no existen (`/cart`, `/blogs/noticias`, etc.).

1. Sube esta carpeta a un repositorio de GitHub. Incluye `static/img`.
2. En Cloudflare, entra a **Workers & Pages → Create → Pages → Connect to Git** y elige el repositorio.
3. Configuración de build:
   - Build command: `node build.mjs`
   - Build output directory: `sitio`
4. Cada vez que hagas `git push`, el sitio se vuelve a publicar solo.

También puedes subirlo sin GitHub: corre `node build.mjs` y arrastra la carpeta `sitio` en **Pages → Upload assets**.

### Tu dominio bajarequeoutdoor.com

- **Si compraste el dominio en Shopify:** en Shopify ve a *Configuración → Dominios → bajarequeoutdoor.com → Transferir dominio* y pide el código de autorización. Luego transfiérelo a Cloudflare Registrar o a otro registrador. **Hazlo antes de cancelar el plan.**
- **Si lo compraste en otro registrador:** en Cloudflare Pages ve a *Custom domains → Set up a domain* y sigue las instrucciones de DNS. Normalmente es cambiar el registro `CNAME`/`A` que hoy apunta a Shopify.

Cancela Shopify solo después de ver el sitio nuevo funcionando en tu dominio.

## Panel de administración

Para editar productos, precios, fotos, colecciones, artículos y la portada **sin tocar código**:

1. Doble clic en **`Abrir admin.bat`** (o en una terminal: `node admin.mjs`).
2. Se abre el navegador en `http://localhost:4321/admin/`. Deja abierta la ventana negra mientras trabajas.
3. Haz tus cambios y pulsa **Guardar cambios** (o `Ctrl + S`). El sitio se regenera solo; la vista previa está en `http://localhost:4321/`.
4. Pulsa **Publicar en internet** para subirlo (hace `git add`, `commit` y `push`; Cloudflare Pages publica en 1-2 minutos). Solo funciona si la carpeta ya está conectada a GitHub.

Detalles:
- Solo funciona en esta computadora (escucha en `127.0.0.1`); nadie más puede entrar.
- Las fotos se reducen a 1600 px y se convierten a WebP antes de guardarse en `static/img/`.
- Antes de cada guardado se crea un respaldo en `datos/respaldos/`. Desde **Respaldos** puedes volver a cualquier versión.
- Valida antes de guardar: nombres, precios, al menos una foto, WhatsApp con código de país, etc.
- Si el puerto 4321 está ocupado, usa otro. En CMD: `set PUERTO=5000 && node admin.mjs`; en PowerShell: `$env:PUERTO=5000; node admin.mjs`.

## Cambios a mano (sin el admin)

Todo está en `datos/tienda.json`; después corre `node build.mjs`, o haz `git push` si usas Cloudflare conectado a GitHub.

- **Cambiar un precio:** edita `"precio"` del producto.
- **Marcar agotado:** `"disponible": false`. Se muestra la etiqueta y se desactiva el botón.
- **Agregar un producto:** copia un bloque de `productos`, cambia `handle` (la dirección, sin espacios), `titulo`, `precio`, `descripcion` (HTML) e `imagenes`. Luego agrega el `handle` a su colección y, si quieres, a `inicio.destacados`.
- **Imágenes nuevas:** copia el archivo a `static/img/` y escribe solo su nombre en `imagenes`.
- **Variantes (colores):** mira el ejemplo del `V600+` (`opcion` + `variantes`).
- **Nuevo artículo del blog:** agrega un bloque a `articulos`.
- **Manuales en PDF:** copia el PDF a `static/manuales/` y agrégalo al producto: `"manuales": [{ "titulo": "Manual de usuario", "archivo": "nombre.pdf" }]` (ver Handy A). Cloudflare Pages no acepta archivos de más de 25 MB: si un PDF pesa más, comprímelo antes.

## Cómo funciona el pedido

El cliente agrega productos a "Tu pedido" (se guarda en su navegador) y pulsa **Enviar pedido por WhatsApp**. Se abre WhatsApp con un mensaje ya escrito, con productos, cantidades y total. En cada producto también hay un botón **Pedir por WhatsApp** directo. El formulario de Contacto también envía por WhatsApp.

Si más adelante quieres cobrar en línea, se puede agregar un enlace de pago (Stripe Payment Links, PayPal o Yappy) por producto sin cambiar el hosting.
