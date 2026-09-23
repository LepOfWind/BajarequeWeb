// Generador del sitio estático de Bajareque Outdoor.
// Uso:  node build.mjs      → genera la carpeta ./sitio lista para publicar.
// No necesita dependencias (solo Node 18+).
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const SALIDA = join(RAIZ, 'sitio');
const datos = JSON.parse(readFileSync(join(RAIZ, 'datos', 'tienda.json'), 'utf8'));
const { tienda, cdn } = datos;

// Mientras no estén todas las imágenes en static/img, se cargan desde el CDN de Shopify como respaldo.
// Cuando canceles Shopify, ese respaldo deja de funcionar: corre descargar-imagenes.ps1 antes.
const IMG_DIR = join(RAIZ, 'static', 'img');
const imagenesLocales = new Set(existsSync(IMG_DIR) ? readdirSync(IMG_DIR) : []);

const MAN_DIR = join(RAIZ, 'static', 'manuales');
for (const p of datos.productos) for (const m of p.manuales || []) {
  const ruta = join(MAN_DIR, m.archivo);
  if (existsSync(ruta)) m.tamano = (statSync(ruta).size / 1048576).toFixed(1) + ' MB';
  else console.warn(`⚠ No existe static/manuales/${m.archivo} (producto ${p.handle}).`);
}
const productos = new Map(datos.productos.map(p => [p.handle, p]));
const colecciones = datos.colecciones;
const anio = new Date().getFullYear();

// ---------- utilidades ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dinero = n => `${tienda.moneda}${Number(n).toFixed(2)}`;
const texto = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const recortar = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function urlCdn(archivo, ancho = 1600) {
  const base = archivo.startsWith('articles/') ? cdn.articles + archivo.slice(9) : cdn.files + archivo;
  return `${base}?width=${ancho}`;
}
function srcImg(archivo) {
  return `/img/${basename(archivo)}`;
}
function img(archivo, alt = '', { clase = '', ancho = 1200, lazy = true, extra = '' } = {}) {
  const local = imagenesLocales.has(basename(archivo));
  const src = local ? srcImg(archivo) : urlCdn(archivo, ancho);
  return `<img src="${src}" alt="${esc(alt)}"${clase ? ` class="${clase}"` : ''}${lazy ? ' loading="lazy"' : ''} decoding="async" ${extra}>`;
}
function reemplazarImgs(html) {
  return html.replace(/\{\{img:([^}]+)\}\}/g, (_, f) => (imagenesLocales.has(basename(f)) ? srcImg(f) : urlCdn(f)));
}
function escribir(ruta, contenido) {
  const destino = join(SALIDA, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, contenido);
}

// ---------- iconos ----------
const icono = {
  buscar: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="5.25" stroke="currentColor" stroke-width="1.5"/><path d="m13 13 3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  bolsa: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3.4 6.9h13.2v8a2.1 2.1 0 0 1-2.1 2.1h-9a2.1 2.1 0 0 1-2.1-2.1v-8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 9V5.5a3 3 0 0 1 6 0V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 6h14M3 14h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  cerrar: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M15 5 5 15M5 5l10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  descargar: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14.5v1A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flecha: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m6 8 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.58-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.43 9.43 0 0 1-1.45-5.03c0-5.2 4.24-9.44 9.45-9.44 2.52 0 4.9.99 6.68 2.77a9.38 9.38 0 0 1 2.76 6.68c0 5.21-4.24 9.44-9.45 9.44m8.04-17.48A11.3 11.3 0 0 0 12.05.7C5.78.7.68 5.8.68 12.06c0 2 .52 3.96 1.52 5.68L.58 23.3l5.7-1.5a11.3 11.3 0 0 0 5.76 1.47h.01c6.26 0 11.36-5.1 11.36-11.36 0-3.03-1.18-5.89-3.33-8.03"/></svg>'
};

// ---------- piezas comunes ----------
function cabecera() {
  const submenu = colecciones.map(c => `<li><a href="/collections/${c.handle}/">${esc(c.titulo)}</a></li>`).join('');
  return `
<header class="cabecera">
  <div class="contenedor cabecera__fila">
    <button class="icon-btn solo-movil" data-abrir-menu aria-label="Abrir menú" aria-expanded="false">${icono.menu}</button>
    <a class="logo" href="/">${esc(tienda.nombre)}</a>
    <nav class="nav" id="nav-principal" aria-label="Principal">
      <button class="icon-btn solo-movil nav__cerrar" data-cerrar-menu aria-label="Cerrar menú">${icono.cerrar}</button>
      <ul class="nav__lista">
        <li><a href="/">Inicio</a></li>
        <li class="nav__desplegable">
          <a href="/collections/all/" class="nav__padre">Catálogo ${icono.flecha}</a>
          <ul class="nav__submenu"><li><a href="/collections/all/">Ver todo</a></li>${submenu}</ul>
        </li>
        <li><a href="/pages/contact/">Contacto</a></li>
        <li><a href="/blogs/articulos/">Blog</a></li>
      </ul>
    </nav>
    <div class="cabecera__acciones">
      <a class="icon-btn" href="/collections/all/?buscar" aria-label="Buscar">${icono.buscar}</a>
      <button class="icon-btn bolsa" data-abrir-pedido aria-label="Ver pedido">${icono.bolsa}<span class="bolsa__cuenta" data-cuenta hidden>0</span></button>
    </div>
  </div>
</header>`;
}

function pie() {
  const cols = colecciones.map(c => `<li><a href="/collections/${c.handle}/">${esc(c.titulo)}</a></li>`).join('');
  const redes = [
    tienda.instagram && `<li><a href="${esc(tienda.instagram)}" rel="noopener" target="_blank">Instagram</a></li>`,
    tienda.facebook && `<li><a href="${esc(tienda.facebook)}" rel="noopener" target="_blank">Facebook</a></li>`
  ].filter(Boolean).join('');
  return `
<footer class="pie">
  <div class="contenedor pie__grid">
    <div>
      <p class="logo">${esc(tienda.nombre)}</p>
      <p class="pie__texto">${esc(tienda.descripcion)}</p>
    </div>
    <div>
      <h2 class="pie__titulo">Catálogo</h2>
      <ul>${cols}</ul>
    </div>
    <div>
      <h2 class="pie__titulo">Tienda</h2>
      <ul>
        <li><a href="/pages/contact/">Contacto</a></li>
        <li><a href="/blogs/articulos/">Blog</a></li>
        <li><a href="https://wa.me/${tienda.whatsapp}" rel="noopener" target="_blank">WhatsApp</a></li>
        ${tienda.correo ? `<li><a href="mailto:${esc(tienda.correo)}">${esc(tienda.correo)}</a></li>` : ''}
        ${redes}
      </ul>
    </div>
  </div>
  <div class="contenedor pie__legal">© ${anio} ${esc(tienda.nombre)}. Panamá.</div>
</footer>`;
}

function cajonPedido() {
  return `
<div class="cajon" data-cajon hidden>
  <div class="cajon__fondo" data-cerrar-pedido></div>
  <aside class="cajon__panel" role="dialog" aria-modal="true" aria-labelledby="titulo-pedido">
    <div class="cajon__cabeza">
      <h2 id="titulo-pedido">Tu pedido</h2>
      <button class="icon-btn" data-cerrar-pedido aria-label="Cerrar">${icono.cerrar}</button>
    </div>
    <div class="cajon__cuerpo" data-lista-pedido></div>
    <div class="cajon__pie" data-pie-pedido>
      <div class="cajon__total"><span>Total</span><strong data-total>${dinero(0)}</strong></div>
      <p class="nota">Te confirmamos disponibilidad, entrega y forma de pago por WhatsApp.</p>
      <button class="btn btn--wa btn--bloque" data-enviar-pedido>${icono.whatsapp} Enviar pedido por WhatsApp</button>
    </div>
  </aside>
</div>
<a class="wa-flotante" href="https://wa.me/${tienda.whatsapp}" target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp">${icono.whatsapp}</a>`;
}

function pagina({ titulo, descripcion = tienda.descripcion, ruta, cuerpo, imagenOg, clase = '' }) {
  const t = titulo ? `${titulo} – ${tienda.nombre}` : tienda.nombre;
  const url = tienda.dominio + ruta;
  const og = imagenOg ? urlCdn(imagenOg, 1200) : '';
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t)}</title>
<meta name="description" content="${esc(recortar(descripcion, 160))}">
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="${esc(tienda.nombre)}">
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(recortar(descripcion, 200))}">
<meta property="og:url" content="${url}">
${og ? `<meta property="og:image" content="${imagenOg && imagenesLocales.has(basename(imagenOg)) ? tienda.dominio + srcImg(imagenOg) : og}">` : ''}
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/estilos.css">
<script>window.TIENDA=${JSON.stringify({ nombre: tienda.nombre, whatsapp: tienda.whatsapp, moneda: tienda.moneda })}</script>
<script src="/js/app.js" defer></script>
</head>
<body class="${clase}">
<a class="saltar" href="#contenido">Saltar al contenido</a>
${cabecera()}
<main id="contenido">
${cuerpo}
</main>
${pie()}
${cajonPedido()}
</body>
</html>`;
}

function tarjetaProducto(p) {
  const [a, b] = p.imagenes;
  return `
<a class="tarjeta" href="/products/${p.handle}/" data-nombre="${esc(p.titulo.toLowerCase())}" data-precio="${p.precio}">
  <div class="tarjeta__media">
    ${img(a, p.titulo, { ancho: 800 })}
    ${b ? img(b, '', { ancho: 800, clase: 'tarjeta__alt', extra: 'aria-hidden="true"' }) : ''}
    ${p.disponible === false ? '<span class="etiqueta">Agotado</span>' : ''}
  </div>
  <div class="tarjeta__info">
    <h3 class="tarjeta__titulo">${esc(p.titulo)}</h3>
    <p class="tarjeta__precio">${dinero(p.precio)}</p>
  </div>
</a>`;
}

const rejilla = handles => `<div class="rejilla">${handles.map(h => productos.get(h)).filter(Boolean).map(tarjetaProducto).join('')}</div>`;

// ---------- páginas ----------
function inicio() {
  const { hero, categorias, destacados } = datos.inicio;
  const cats = categorias.map(c => {
    const col = colecciones.find(x => x.handle === c.coleccion);
    return `
<a class="categoria" href="/collections/${col.handle}/">
  <div class="categoria__media">${img(c.imagen, col.titulo, { ancho: 700 })}</div>
  <h3>${esc(col.titulo)}</h3>
</a>`;
  }).join('');
  const a = datos.articulos[0];
  const cuerpo = `
<section class="hero">
  <div class="hero__medios">${hero.imagenes.map((f, i) => img(f, '', { ancho: 1600, lazy: i > 0, extra: 'fetchpriority="high"' })).join('')}</div>
  <div class="hero__capa">
    <h1>${esc(hero.titulo)}</h1>
    <a class="btn btn--claro" href="${hero.enlace}">${esc(hero.boton)}</a>
  </div>
</section>

<section class="seccion contenedor">
  <h2 class="seccion__titulo">Productos</h2>
  <div class="categorias">${cats}</div>
</section>

<section class="seccion contenedor">
  <div class="seccion__cabeza">
    <h2 class="seccion__titulo">Destacados</h2>
    <a class="enlace" href="/collections/all/">Ver todo</a>
  </div>
  ${rejilla(destacados)}
</section>

${a ? `<section class="seccion contenedor">
  <h2 class="seccion__titulo">Artículos</h2>
  <a class="articulo-destacado" href="/blogs/articulos/${a.handle}/">
    <div class="articulo-destacado__media">${img(a.imagen, a.titulo, { ancho: 1400 })}</div>
    <div class="articulo-destacado__info">
      <h3>${esc(a.titulo)}</h3>
      <p>${esc(a.resumen)}</p>
      <span class="enlace">Leer artículo</span>
    </div>
  </a>
</section>` : ''}`;
  escribir('index.html', pagina({ ruta: '/', cuerpo, imagenOg: hero.imagenes[0] }));
}

function barraColecciones(activa) {
  const chips = [{ handle: 'all', titulo: 'Todo' }, ...colecciones]
    .map(c => `<a class="chip${c.handle === activa ? ' chip--activa' : ''}" href="/collections/${c.handle}/"${c.handle === activa ? ' aria-current="page"' : ''}>${esc(c.titulo)}</a>`)
    .join('');
  return `<nav class="chips" aria-label="Colecciones">${chips}</nav>`;
}

function coleccion(handle, titulo, handles) {
  const buscador = handle === 'all'
    ? `<label class="buscador"><span class="sr">Buscar productos</span>${icono.buscar}<input type="search" placeholder="Buscar productos" data-buscar></label>` : '';
  const cuerpo = `
<section class="contenedor pagina-coleccion">
  <h1 class="titulo-pagina">${esc(titulo)}</h1>
  ${barraColecciones(handle)}
  <div class="herramientas">
    <p class="nota" data-conteo>${handles.length} productos</p>
    ${buscador}
    <label class="orden"><span class="sr">Ordenar</span>
      <select data-ordenar>
        <option value="">Destacados</option>
        <option value="precio-asc">Precio: menor a mayor</option>
        <option value="precio-desc">Precio: mayor a menor</option>
        <option value="nombre">Nombre: A-Z</option>
      </select>
    </label>
  </div>
  ${rejilla(handles)}
  <p class="nota vacio" data-vacio hidden>No encontramos productos con esa búsqueda.</p>
</section>`;
  const primero = productos.get(handles[0]);
  escribir(`collections/${handle}/index.html`, pagina({
    titulo, ruta: `/collections/${handle}/`, cuerpo,
    descripcion: `${titulo} en ${tienda.nombre}: ${handles.map(h => productos.get(h)?.titulo).filter(Boolean).join(', ')}.`,
    imagenOg: primero?.imagenes[0]
  }));
}

function producto(p) {
  const col = colecciones.find(c => c.productos.includes(p.handle));
  const variantes = p.variantes || [];
  const selector = variantes.length ? `
<fieldset class="variantes">
  <legend>${esc(p.opcion || 'Opción')}</legend>
  ${variantes.map((v, i) => `
  <label class="pill">
    <input type="radio" name="variante" value="${esc(v.nombre)}" data-precio="${v.precio}" data-imagen="${v.imagen ? p.imagenes.indexOf(v.imagen) : -1}"${i === 0 ? ' checked' : ''}${v.disponible === false ? ' disabled' : ''}>
    <span>${esc(v.nombre)}</span>
  </label>`).join('')}
</fieldset>` : '';

  const relacionados = (col ? col.productos : []).filter(h => h !== p.handle);
  const extra = datos.inicio.destacados.filter(h => h !== p.handle && !relacionados.includes(h));
  const sugeridos = [...relacionados, ...extra].slice(0, 4);

  const principal = p.imagenes[0];
  const cuerpo = `
<div class="contenedor">
  <nav class="migas" aria-label="Ruta"><a href="/">Inicio</a> / ${col ? `<a href="/collections/${col.handle}/">${esc(col.titulo)}</a> / ` : ''}<span>${esc(p.titulo)}</span></nav>
  <section class="producto" data-producto="${esc(p.handle)}" data-titulo="${esc(p.titulo)}" data-precio="${p.precio}">
    <div class="galeria">
      <div class="galeria__principal">${img(principal, p.titulo, { lazy: false, ancho: 1600, extra: 'data-principal fetchpriority="high"' })}</div>
      ${p.imagenes.length > 1 ? `<div class="galeria__miniaturas">${p.imagenes.map((f, i) => `
        <button type="button" class="miniatura${i === 0 ? ' miniatura--activa' : ''}" data-miniatura="${i}" aria-label="Ver imagen ${i + 1}">${img(f, '', { ancho: 300 })}</button>`).join('')}
      </div>` : ''}
    </div>
    <div class="producto__info">
      <h1 class="producto__titulo">${esc(p.titulo)}</h1>
      <p class="producto__precio" data-precio-visible>${dinero(variantes[0]?.precio ?? p.precio)}</p>
      ${selector}
      <div class="cantidad">
        <span class="etiqueta-campo">Cantidad</span>
        <div class="cantidad__control">
          <button type="button" data-menos aria-label="Menos">−</button>
          <input type="number" min="1" value="1" inputmode="numeric" data-cantidad aria-label="Cantidad">
          <button type="button" data-mas aria-label="Más">+</button>
        </div>
      </div>
      <div class="producto__acciones">
        <button type="button" class="btn btn--bloque" data-agregar${p.disponible === false ? ' disabled' : ''}>${p.disponible === false ? 'Agotado' : 'Agregar al pedido'}</button>
        <button type="button" class="btn btn--wa btn--bloque" data-pedir-ya>${icono.whatsapp} Pedir por WhatsApp</button>
      </div>
      ${(p.manuales || []).length ? `<div class="descargas">
        <h2 class="descargas__titulo">Descargas</h2>
        ${p.manuales.map(m => `<a class="descarga" href="/manuales/${encodeURIComponent(m.archivo)}" target="_blank" rel="noopener" download>${icono.descargar}<span>${esc(m.titulo)}</span><small>PDF${m.tamano ? ` · ${esc(m.tamano)}` : ''}</small></a>`).join('')}
      </div>` : ''}
      <div class="rte">${p.descripcion}</div>
    </div>
  </section>
  ${sugeridos.length ? `<section class="seccion">
    <h2 class="seccion__titulo">También te puede interesar</h2>
    ${rejilla(sugeridos)}
  </section>` : ''}
</div>
<script type="application/json" data-imagenes>${JSON.stringify(p.imagenes.map(f => (imagenesLocales.has(basename(f)) ? srcImg(f) : urlCdn(f, 1600))))}</script>
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Product', name: p.titulo,
    image: p.imagenes.slice(0, 3).map(f => urlCdn(f, 1200)), description: recortar(texto(p.descripcion), 500),
    brand: { '@type': 'Brand', name: 'Claymore' },
    offers: { '@type': 'Offer', price: p.precio.toFixed(2), priceCurrency: 'USD', availability: p.disponible === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', url: `${tienda.dominio}/products/${p.handle}/` }
  })}</script>`;
  escribir(`products/${p.handle}/index.html`, pagina({
    titulo: p.titulo, ruta: `/products/${p.handle}/`, cuerpo, descripcion: texto(p.descripcion), imagenOg: principal
  }));
}

function fechaLarga(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-PA', { day: 'numeric', month: 'long', year: 'numeric' });
}

function blog() {
  const lista = datos.articulos.map(a => `
<a class="articulo-tarjeta" href="/blogs/articulos/${a.handle}/">
  <div class="articulo-tarjeta__media">${img(a.imagen, a.titulo, { ancho: 1000 })}</div>
  <time datetime="${a.fecha}">${fechaLarga(a.fecha)}</time>
  <h2>${esc(a.titulo)}</h2>
  <p>${esc(a.resumen)}</p>
</a>`).join('');
  escribir('blogs/articulos/index.html', pagina({
    titulo: 'Artículos', ruta: '/blogs/articulos/',
    cuerpo: `<section class="contenedor"><h1 class="titulo-pagina">Artículos</h1><div class="articulos">${lista}</div></section>`
  }));
  for (const a of datos.articulos) {
    const cuerpo = `
<article class="articulo contenedor contenedor--estrecho">
  <header class="articulo__cabeza">
    <h1>${esc(a.titulo)}</h1>
    <time datetime="${a.fecha}">${fechaLarga(a.fecha)}</time>
  </header>
  <div class="articulo__portada">${img(a.imagen, a.titulo, { lazy: false, ancho: 1800 })}</div>
  <div class="rte">${reemplazarImgs(a.contenido)}</div>
  <p><a class="enlace" href="/blogs/articulos/">← Volver a artículos</a></p>
</article>`;
    escribir(`blogs/articulos/${a.handle}/index.html`, pagina({
      titulo: a.titulo, ruta: `/blogs/articulos/${a.handle}/`, cuerpo, descripcion: a.resumen, imagenOg: a.imagen
    }));
  }
}

function contacto() {
  const cuerpo = `
<section class="contenedor contenedor--estrecho">
  <h1 class="titulo-pagina">Contacto</h1>
  <p class="intro">Escríbenos y te respondemos por WhatsApp. También puedes preguntarnos por disponibilidad, entregas o garantía.</p>
  <form class="formulario" data-contacto novalidate>
    <div class="formulario__fila">
      <label>Nombre<input name="nombre" autocomplete="name"></label>
      <label>Correo electrónico<input name="correo" type="email" autocomplete="email"></label>
    </div>
    <label>Teléfono<input name="telefono" type="tel" autocomplete="tel"></label>
    <label>Comentario<textarea name="mensaje" rows="5" required></textarea></label>
    <p class="error" data-error hidden>Escribe tu comentario antes de enviar.</p>
    <button class="btn btn--wa" type="submit">${icono.whatsapp} Enviar por WhatsApp</button>
    ${tienda.correo ? `<p class="nota">O escríbenos a <a href="mailto:${esc(tienda.correo)}">${esc(tienda.correo)}</a>.</p>` : ''}
  </form>
</section>`;
  escribir('pages/contact/index.html', pagina({ titulo: 'Contacto', ruta: '/pages/contact/', cuerpo }));
}

function error404() {
  escribir('404.html', pagina({
    titulo: 'Página no encontrada', ruta: '/404',
    cuerpo: `<section class="contenedor contenedor--estrecho centro"><h1 class="titulo-pagina">Página no encontrada</h1><p class="intro">La página que buscas no existe o cambió de dirección.</p><a class="btn" href="/collections/all/">Ver catálogo</a></section>`
  }));
}

function extras() {
  const urls = ['/', '/collections/all/', ...colecciones.map(c => `/collections/${c.handle}/`),
    ...datos.productos.map(p => `/products/${p.handle}/`), '/blogs/articulos/',
    ...datos.articulos.map(a => `/blogs/articulos/${a.handle}/`), '/pages/contact/'];
  escribir('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${tienda.dominio}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
  escribir('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${tienda.dominio}/sitemap.xml\n`);
  // Redirecciones para que los enlaces viejos de Shopify sigan funcionando (Cloudflare Pages y Netlify).
  escribir('_redirects', [
    '/collections /collections/all/ 301',
    '/products /collections/all/ 301',
    '/collections/:c/products/:p /products/:p/ 301',
    '/blogs/noticias /blogs/articulos/ 301',
    '/blogs/noticias/* /blogs/articulos/ 301',
    '/blogs /blogs/articulos/ 301',
    '/cart / 302',
    '/account / 302',
    '/search /collections/all/ 302',
    '/policies/* / 302',
    ''
  ].join('\n'));
  escribir('favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111"/><text x="32" y="44" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">B</text></svg>`);
}

// ---------- ejecución ----------
try { rmSync(SALIDA, { recursive: true, force: true }); } catch { /* si no se puede borrar, se sobrescriben los archivos */ }
mkdirSync(SALIDA, { recursive: true });
cpSync(join(RAIZ, 'static'), SALIDA, { recursive: true });

inicio();
coleccion('all', 'Catálogo', datos.productos.map(p => p.handle));
for (const c of colecciones) coleccion(c.handle, c.titulo, c.productos);
for (const p of datos.productos) producto(p);
blog();
contacto();
error404();
extras();

// Avisos útiles
const todas = new Set([...datos.productos.flatMap(p => p.imagenes), ...datos.inicio.hero.imagenes, ...datos.articulos.map(a => a.imagen), ...datos.inicio.categorias.map(c => c.imagen)].map(f => basename(f)));
const faltan = [...todas].filter(f => !imagenesLocales.has(f));
console.log(`✔ Sitio generado en ./sitio (${datos.productos.length} productos, ${colecciones.length} colecciones).`);
if (faltan.length) console.warn(`⚠ ${faltan.length} de ${todas.size} imágenes aún se cargan desde Shopify. Corre descargar-imagenes.ps1 antes de cancelar Shopify.`);
if (/^5070+$/.test(tienda.whatsapp)) console.warn('⚠ Falta tu número de WhatsApp: edítalo en datos/tienda.json → tienda.whatsapp (ej. 50761234567).');
