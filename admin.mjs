// Panel de administración LOCAL de Bajareque Outdoor.
// Uso:  node admin.mjs   (o doble clic en "Abrir admin.bat")
// Abre http://localhost:4321/admin/ en tu navegador. Solo funciona en esta PC.
// No necesita dependencias (Node 18+).
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, createReadStream } from 'node:fs';
import { join, dirname, extname, normalize, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, exec } from 'node:child_process';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PUERTO) || 4321;
const HOST = '127.0.0.1';
const ARCHIVO_DATOS = join(RAIZ, 'datos', 'tienda.json');
const DIR_RESPALDOS = join(RAIZ, 'datos', 'respaldos');
const DIR_IMG = join(RAIZ, 'static', 'img');
const DIR_MANUALES = join(RAIZ, 'static', 'manuales');
const DIR_ADMIN = join(RAIZ, 'admin');
const DIR_SITIO = join(RAIZ, 'sitio');
const MAX_RESPALDOS = 30;

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.pdf': 'application/pdf',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon'
};
const EXT_IMG = new Set(['.webp', '.jpg', '.jpeg', '.png', '.gif', '.avif']);

// ---------- utilidades ----------
function enviar(res, estado, cuerpo, tipo = 'application/json; charset=utf-8') {
  res.writeHead(estado, { 'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof cuerpo === 'string' || Buffer.isBuffer(cuerpo) ? cuerpo : JSON.stringify(cuerpo));
}
function leerCuerpo(req, limite) {
  return new Promise((resolve, reject) => {
    const partes = []; let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > limite) { reject(Object.assign(new Error('El archivo es demasiado grande.'), { estado: 413 })); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}
function servirArchivo(res, ruta) {
  if (!existsSync(ruta) || !statSync(ruta).isFile()) return false;
  res.writeHead(200, { 'Content-Type': TIPOS[extname(ruta).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(ruta).pipe(res);
  return true;
}
function dentroDe(base, relativo) {
  const ruta = normalize(join(base, relativo));
  return ruta === base || ruta.startsWith(base + sep) ? ruta : null;
}
function nombreSeguro(nombre, extPermitidas) {
  let ext = extname(nombre).toLowerCase();
  if (!extPermitidas.has(ext)) return null;
  if (ext === '.jpeg') ext = '.jpg';
  const base = basename(nombre, extname(nombre)).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'archivo';
  return base + ext;
}
function nombreLibre(dir, nombre) {
  const ext = extname(nombre); const base = basename(nombre, ext);
  let n = nombre, i = 2;
  while (existsSync(join(dir, n))) n = `${base}-${i++}${ext}`;
  return n;
}
function marcaTiempo() {
  const d = new Date(); const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function correr(cmd, args, opciones = {}) {
  return new Promise(resolve => {
    execFile(cmd, args, { cwd: RAIZ, windowsHide: true, timeout: 120000, ...opciones }, (err, stdout, stderr) => {
      resolve({ ok: !err, codigo: err?.code ?? 0, salida: `${stdout || ''}${stderr || ''}`.trim() });
    });
  });
}
const regenerar = () => correr(process.execPath, [join(RAIZ, 'build.mjs')]);

// ---------- validación de los datos ----------
function validar(d) {
  const errores = [];
  if (!d || typeof d !== 'object') return ['Datos vacíos o inválidos.'];
  if (!d.tienda?.nombre) errores.push('Falta el nombre de la tienda.');
  if (!Array.isArray(d.productos)) errores.push('La lista de productos no es válida.');
  if (!Array.isArray(d.colecciones)) errores.push('La lista de colecciones no es válida.');
  if (!Array.isArray(d.articulos)) errores.push('La lista de artículos no es válida.');
  if (errores.length) return errores;
  const handle = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const vistos = new Set();
  for (const p of d.productos) {
    const nombre = p.titulo || p.handle || '(sin nombre)';
    if (!p.titulo?.trim()) errores.push(`Hay un producto sin nombre.`);
    if (!handle.test(p.handle || '')) errores.push(`"${nombre}": la dirección web no es válida.`);
    if (vistos.has(p.handle)) errores.push(`"${nombre}": hay dos productos con la misma dirección web.`);
    vistos.add(p.handle);
    if (typeof p.precio !== 'number' || !(p.precio >= 0)) errores.push(`"${nombre}": el precio no es válido.`);
    if (!Array.isArray(p.imagenes) || !p.imagenes.length) errores.push(`"${nombre}": necesita al menos una foto.`);
    for (const v of p.variantes || []) if (!v.nombre?.trim() || typeof v.precio !== 'number') errores.push(`"${nombre}": hay una variante incompleta.`);
  }
  const cols = new Set();
  for (const c of d.colecciones) {
    if (!c.titulo?.trim()) errores.push('Hay una colección sin nombre.');
    if (!handle.test(c.handle || '') || c.handle === 'all') errores.push(`Colección "${c.titulo}": la dirección web no es válida.`);
    if (cols.has(c.handle)) errores.push(`Hay dos colecciones con la misma dirección web (${c.handle}).`);
    cols.add(c.handle);
    for (const h of c.productos || []) if (!vistos.has(h)) errores.push(`Colección "${c.titulo}" incluye un producto que no existe (${h}).`);
  }
  for (const c of d.inicio?.categorias || []) if (!cols.has(c.coleccion)) errores.push(`Portada: la categoría "${c.coleccion}" no existe.`);
  for (const h of d.inicio?.destacados || []) if (!vistos.has(h)) errores.push(`Portada: el destacado "${h}" no existe.`);
  const arts = new Set();
  for (const a of d.articulos) {
    if (!a.titulo?.trim()) errores.push('Hay un artículo sin título.');
    if (!handle.test(a.handle || '')) errores.push(`Artículo "${a.titulo}": la dirección web no es válida.`);
    if (arts.has(a.handle)) errores.push(`Hay dos artículos con la misma dirección web.`);
    arts.add(a.handle);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha || '')) errores.push(`Artículo "${a.titulo}": la fecha no es válida.`);
    if (!a.imagen) errores.push(`Artículo "${a.titulo}": necesita una imagen de portada.`);
  }
  if (!/^\d{10,15}$/.test(d.tienda.whatsapp || '')) errores.push('El número de WhatsApp debe tener solo dígitos, con código de país (ej. 50761234567).');
  return errores;
}

function respaldar() {
  if (!existsSync(ARCHIVO_DATOS)) return;
  mkdirSync(DIR_RESPALDOS, { recursive: true });
  copyFileSync(ARCHIVO_DATOS, join(DIR_RESPALDOS, `tienda-${marcaTiempo()}.json`));
}
function listaRespaldos() {
  if (!existsSync(DIR_RESPALDOS)) return [];
  return readdirSync(DIR_RESPALDOS).filter(f => /^tienda-\d{8}-\d{6}\.json$/.test(f)).sort().reverse();
}

// ---------- API ----------
async function api(req, res, url) {
  const ruta = url.pathname;

  if (req.method === 'GET' && ruta === '/api/datos') {
    return enviar(res, 200, readFileSync(ARCHIVO_DATOS, 'utf8'));
  }

  if (req.method === 'PUT' && ruta === '/api/datos') {
    let datos;
    try { datos = JSON.parse((await leerCuerpo(req, 5 * 1048576)).toString('utf8')); }
    catch { return enviar(res, 400, { ok: false, errores: ['No se pudieron leer los datos enviados.'] }); }
    const errores = validar(datos);
    if (errores.length) return enviar(res, 422, { ok: false, errores });
    respaldar();
    writeFileSync(ARCHIVO_DATOS, JSON.stringify(datos, null, 2) + '\n', 'utf8');
    const build = await regenerar();
    return enviar(res, 200, { ok: build.ok, build: build.salida });
  }

  if (req.method === 'GET' && ruta === '/api/archivos') {
    const leer = dir => (existsSync(dir) ? readdirSync(dir).filter(f => !f.startsWith('.')) : []);
    return enviar(res, 200, { imagenes: leer(DIR_IMG), manuales: leer(DIR_MANUALES) });
  }

  if (req.method === 'POST' && (ruta === '/api/imagen' || ruta === '/api/manual')) {
    const esImagen = ruta === '/api/imagen';
    const dir = esImagen ? DIR_IMG : DIR_MANUALES;
    const nombre = nombreSeguro(url.searchParams.get('nombre') || '', esImagen ? EXT_IMG : new Set(['.pdf']));
    if (!nombre) return enviar(res, 400, { ok: false, error: esImagen ? 'Solo se aceptan imágenes JPG, PNG o WebP.' : 'Solo se aceptan archivos PDF.' });
    const limite = esImagen ? 15 * 1048576 : 25 * 1048576;
    let cuerpo;
    try { cuerpo = await leerCuerpo(req, limite); }
    catch (e) { return enviar(res, e.estado || 400, { ok: false, error: esImagen ? 'La imagen pesa más de 15 MB.' : 'El PDF pesa más de 25 MB (límite de Cloudflare). Comprímelo antes de subirlo.' }); }
    if (!cuerpo.length) return enviar(res, 400, { ok: false, error: 'El archivo está vacío.' });
    if (!esImagen && cuerpo.subarray(0, 4).toString() !== '%PDF') return enviar(res, 400, { ok: false, error: 'El archivo no parece un PDF válido.' });
    mkdirSync(dir, { recursive: true });
    const final = nombreLibre(dir, nombre);
    writeFileSync(join(dir, final), cuerpo);
    return enviar(res, 200, { ok: true, archivo: final, bytes: cuerpo.length });
  }

  if (req.method === 'GET' && ruta === '/api/respaldos') {
    return enviar(res, 200, { respaldos: listaRespaldos().slice(0, MAX_RESPALDOS) });
  }

  if (req.method === 'POST' && ruta === '/api/restaurar') {
    const { archivo } = JSON.parse((await leerCuerpo(req, 10000)).toString('utf8') || '{}');
    if (!listaRespaldos().includes(archivo)) return enviar(res, 404, { ok: false, error: 'Ese respaldo no existe.' });
    respaldar();
    copyFileSync(join(DIR_RESPALDOS, archivo), ARCHIVO_DATOS);
    const build = await regenerar();
    return enviar(res, 200, { ok: build.ok, build: build.salida });
  }

  if (req.method === 'GET' && ruta === '/api/publicar') {
    const esGit = existsSync(join(RAIZ, '.git'));
    if (!esGit) return enviar(res, 200, { git: false });
    const estado = await correr('git', ['status', '--porcelain']);
    const remoto = await correr('git', ['remote']);
    return enviar(res, 200, { git: true, remoto: !!remoto.salida, pendientes: estado.ok ? estado.salida.split('\n').filter(Boolean).length : null });
  }

  if (req.method === 'POST' && ruta === '/api/publicar') {
    if (!existsSync(join(RAIZ, '.git'))) return enviar(res, 400, { ok: false, error: 'Esta carpeta todavía no está conectada a GitHub. Ver README → Publicar.' });
    const pasos = [];
    const add = await correr('git', ['add', '-A']); pasos.push(add.salida);
    if (!add.ok) return enviar(res, 500, { ok: false, error: 'git add falló', detalle: pasos.join('\n') });
    const commit = await correr('git', ['commit', '-m', `Actualización desde el admin (${new Date().toLocaleString('es-PA')})`]);
    pasos.push(commit.salida);
    const nadaQueSubir = !commit.ok && /nothing to commit|nada para hacer commit/i.test(commit.salida);
    if (!commit.ok && !nadaQueSubir) return enviar(res, 500, { ok: false, error: 'No se pudo crear el commit.', detalle: pasos.join('\n') });
    const push = await correr('git', ['push'], { timeout: 180000 }); pasos.push(push.salida);
    if (!push.ok) return enviar(res, 500, { ok: false, error: 'No se pudo subir a GitHub (git push). Revisa tu conexión o credenciales.', detalle: pasos.join('\n') });
    return enviar(res, 200, { ok: true, sinCambios: nadaQueSubir, detalle: pasos.join('\n') });
  }

  return enviar(res, 404, { ok: false, error: 'Ruta desconocida' });
}

// ---------- servidor ----------
const servidor = http.createServer(async (req, res) => {
  try {
    // Protección: solo peticiones dirigidas a localhost (evita "DNS rebinding")...
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    if (!['localhost', '127.0.0.1'].includes(host)) return enviar(res, 403, 'Prohibido', 'text/plain');
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith('/api/')) {
      // ...y los cambios solo pueden venir de esta misma página (evita que otra web los dispare).
      if (req.method !== 'GET') {
        const origen = req.headers.origin || '';
        if (origen !== `http://localhost:${PUERTO}` && origen !== `http://127.0.0.1:${PUERTO}`) return enviar(res, 403, { ok: false, error: 'Origen no permitido' });
      }
      return await api(req, res, url);
    }

    let ruta = decodeURIComponent(url.pathname);
    if (ruta === '/admin') { res.writeHead(302, { Location: '/admin/' }); return res.end(); }
    if (ruta.startsWith('/admin/')) {
      const archivo = dentroDe(DIR_ADMIN, ruta.slice(7) || 'index.html');
      if (archivo && servirArchivo(res, archivo)) return;
      return enviar(res, 404, 'No encontrado', 'text/plain');
    }
    // Las imágenes y manuales se sirven desde static/ para ver al instante lo que subes.
    if (ruta.startsWith('/img/') || ruta.startsWith('/manuales/')) {
      const archivo = dentroDe(join(RAIZ, 'static'), ruta.slice(1));
      if (archivo && servirArchivo(res, archivo)) return;
    }
    // Vista previa del sitio generado.
    let archivo = dentroDe(DIR_SITIO, ruta.slice(1));
    if (archivo && existsSync(archivo) && statSync(archivo).isDirectory()) archivo = join(archivo, 'index.html');
    if (archivo && servirArchivo(res, archivo)) return;
    const e404 = join(DIR_SITIO, '404.html');
    if (existsSync(e404)) { res.writeHead(404, { 'Content-Type': TIPOS['.html'] }); return res.end(readFileSync(e404)); }
    enviar(res, 404, 'No encontrado', 'text/plain');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) enviar(res, 500, { ok: false, error: 'Error interno: ' + e.message });
  }
});

servidor.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`\n✖ El puerto ${PUERTO} ya está en uso. ¿Ya tienes el admin abierto en otra ventana?\n`);
  else console.error(e);
  process.exit(1);
});

servidor.listen(PUERTO, HOST, async () => {
  if (!existsSync(join(DIR_SITIO, 'index.html'))) await regenerar();
  const url = `http://localhost:${PUERTO}/admin/`;
  console.log(`\n  Admin de Bajareque Outdoor listo`);
  console.log(`  → Panel:        ${url}`);
  console.log(`  → Vista previa: http://localhost:${PUERTO}/`);
  console.log(`\n  Deja esta ventana abierta mientras trabajas. Para cerrar: Ctrl + C\n`);
  if (!process.argv.includes('--sin-navegador')) {
    const abrir = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(abrir, () => {});
  }
});
