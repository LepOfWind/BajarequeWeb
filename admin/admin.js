// Admin local de Bajareque Outdoor
(() => {
  'use strict';

  // ================= utilidades =================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\+/g, '-plus').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const dinero = n => (typeof n === 'number' && !isNaN(n) ? `$${n.toFixed(2)}` : '—');
  const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const mover = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  const fechaLarga = iso => { try { return new Date(iso + 'T12:00:00').toLocaleDateString('es-PA', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return iso; } };

  let datos = null;          // copia de trabajo
  let original = '';         // última versión guardada (para detectar cambios)
  let archivos = { imagenes: [], manuales: [] };
  let errores = [];
  let guardando = false;

  let vista = $('#vista');
  const limpioJSON = obj => JSON.stringify(obj, (k, v) => (k.startsWith('_') ? undefined : v));
  const haySinGuardar = () => datos && limpioJSON(datos) !== original;

  // ================= imágenes =================
  function urlImg(archivo, ancho = 500) {
    if (!archivo) return '';
    const base = archivo.split('/').pop();
    if (archivos.imagenes.includes(base)) return '/img/' + encodeURIComponent(base);
    const cdn = archivo.startsWith('articles/') ? datos.cdn.articles + archivo.slice(9) : datos.cdn.files + archivo;
    return `${cdn}?width=${ancho}`;
  }

  async function procesarImagen(file) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error(`"${file.name}" no es JPG, PNG o WebP. Si es una foto de iPhone (HEIC), conviértela antes.`);
    if (file.type === 'image/gif') return { blob: file, nombre: file.name };
    let bmp;
    try { bmp = await createImageBitmap(file); } catch { throw new Error(`No se pudo leer "${file.name}".`); }
    const max = 1600;
    const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * escala), h = Math.round(bmp.height * escala);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.86));
    const base = file.name.replace(/\.[^.]+$/, '');
    if (!blob) return { blob: file, nombre: file.name };
    if (escala === 1 && file.type === 'image/webp' && file.size <= blob.size) return { blob: file, nombre: file.name };
    return { blob, nombre: base + '.webp' };
  }

  async function subirArchivo(tipo, blob, nombre) {
    const r = await fetch(`/api/${tipo}?nombre=${encodeURIComponent(nombre)}`, { method: 'POST', body: blob });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo subir el archivo.');
    const lista = tipo === 'imagen' ? archivos.imagenes : archivos.manuales;
    if (!lista.includes(j.archivo)) lista.push(j.archivo);
    return j.archivo;
  }

  async function subirImagenes(files) {
    const nombres = [];
    for (const f of files) {
      try {
        avisar(`Subiendo ${f.name}…`);
        const { blob, nombre } = await procesarImagen(f);
        nombres.push(await subirArchivo('imagen', blob, nombre));
      } catch (e) { avisar(e.message, 'error'); }
    }
    if (nombres.length) avisar(nombres.length === 1 ? 'Foto subida' : `${nombres.length} fotos subidas`, 'ok');
    return nombres;
  }

  function pedirArchivo(tipo) {
    const input = $(tipo === 'pdf' ? '[data-subir-pdf]' : '[data-subir-img]');
    return new Promise(resolve => {
      input.value = '';
      input.onchange = () => resolve([...input.files]);
      input.click();
    });
  }

  // ================= avisos y modales =================
  function avisar(texto, tipo = '', ms = 3200) {
    const d = document.createElement('div');
    d.className = `aviso${tipo ? ' aviso--' + tipo : ''}`;
    d.textContent = texto;
    $('[data-avisos]').appendChild(d);
    setTimeout(() => d.remove(), tipo === 'error' ? Math.max(ms, 6000) : ms);
  }

  const modal = $('[data-modal]');
  function abrirModal({ titulo, cuerpo, botones = [] }) {
    return new Promise(resolve => {
      modal.innerHTML = `
        <div class="modal__cabeza"><h2>${esc(titulo)}</h2><button class="icono" data-x aria-label="Cerrar">✕</button></div>
        <div class="modal__cuerpo">${cuerpo}</div>
        ${botones.length ? `<div class="modal__pie">${botones.map((b, i) => `<button class="btn ${b.clase || ''}" data-b="${i}">${esc(b.texto)}</button>`).join('')}</div>` : ''}`;
      const cerrar = valor => { modal.close(); resolve(valor); };
      $('[data-x]', modal).onclick = () => cerrar(null);
      modal.oncancel = e => { e.preventDefault(); cerrar(null); };
      $$('[data-b]', modal).forEach(b => { b.onclick = () => cerrar(botones[+b.dataset.b].valor); });
      modal.showModal();
      modal._resolver = cerrar;
    });
  }
  const confirmar = (titulo, mensaje, textoSi = 'Sí, continuar', peligro = false) =>
    abrirModal({ titulo, cuerpo: `<p>${mensaje}</p>`, botones: [{ texto: 'Cancelar', clase: 'btn--linea', valor: false }, { texto: textoSi, clase: peligro ? 'btn--peligro' : '', valor: true }] });

  async function elegirImagenes({ multiple = true, titulo = 'Elegir fotos' } = {}) {
    const seleccion = new Set();
    const pintar = () => {
      const lista = [...archivos.imagenes].sort((a, b) => a.localeCompare(b));
      $('.galeria-picker', modal).innerHTML = lista.map(f => `<button type="button" data-f="${esc(f)}" class="${seleccion.has(f) ? 'sel' : ''}" title="${esc(f)}"><img src="${urlImg(f, 300)}" alt="" loading="lazy"></button>`).join('')
        || '<p class="ayuda">Todavía no hay fotos. Sube una con el botón de arriba.</p>';
    };
    const promesa = abrirModal({
      titulo,
      cuerpo: `<div class="herramientas"><button type="button" class="btn btn--linea" data-subir>⬆ Subir desde la computadora</button><span class="ayuda" style="align-self:center">${multiple ? 'Toca varias fotos para elegirlas.' : 'Toca una foto para elegirla.'}</span></div><div class="galeria-picker"></div>`,
      botones: [{ texto: 'Cancelar', clase: 'btn--linea', valor: null }, { texto: 'Usar selección', valor: 'ok' }]
    });
    pintar();
    $('.galeria-picker', modal).onclick = e => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      const f = b.dataset.f;
      if (!multiple) seleccion.clear();
      seleccion.has(f) ? seleccion.delete(f) : seleccion.add(f);
      pintar();
      if (!multiple) modal._resolver('ok');
    };
    $('[data-subir]', modal).onclick = async () => {
      const files = await pedirArchivo('img');
      const nuevos = await subirImagenes(multiple ? files : files.slice(0, 1));
      if (!multiple) seleccion.clear();
      nuevos.forEach(n => seleccion.add(n));
      pintar();
    };
    const r = await promesa;
    return r === 'ok' ? [...seleccion] : [];
  }

  // ================= editor de texto enriquecido =================
  const BLOQUES = { P: 'p', DIV: 'p', H1: 'h2', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3', UL: 'ul', OL: 'ol', LI: 'li', BLOCKQUOTE: 'p' };
  const EN_LINEA = { STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', A: 'a', BR: 'br' };

  function sanear(raiz, { imagenes = false } = {}) {
    const salida = document.createElement('div');
    const copiar = (origen, destino) => {
      for (const n of origen.childNodes) {
        if (n.nodeType === 3) { destino.appendChild(document.createTextNode(n.textContent.replace(/\u00a0/g, ' '))); continue; }
        if (n.nodeType !== 1 || /^(SCRIPT|STYLE|META|LINK|TITLE|svg)$/i.test(n.tagName)) continue;
        if (n.tagName === 'IMG') {
          if (imagenes && n.dataset.archivo) {
            const im = document.createElement('img');
            im.setAttribute('src', `{{img:${n.dataset.archivo}}}`);
            im.setAttribute('alt', n.getAttribute('alt') || '');
            destino.appendChild(im);
          }
          continue;
        }
        const tag = BLOQUES[n.tagName] || EN_LINEA[n.tagName];
        if (!tag) { copiar(n, destino); continue; }
        if (tag === 'a') {
          const href = (n.getAttribute('href') || '').trim();
          if (!/^(https?:|mailto:|\/)/i.test(href)) { copiar(n, destino); continue; }
          const a = document.createElement('a'); a.setAttribute('href', href); copiar(n, a); destino.appendChild(a); continue;
        }
        const el = document.createElement(tag);
        copiar(n, el);
        destino.appendChild(el);
      }
    };
    copiar(raiz, salida);
    // <p> que envuelven bloques (listas, títulos…) → se desenvuelven
    let hay;
    do { hay = false; for (const e of salida.querySelectorAll('p, h2, h3')) if (e.querySelector('p, h2, h3, ul, ol')) { e.replaceWith(...e.childNodes); hay = true; break; } } while (hay);
    // Texto suelto al nivel raíz → dentro de <p>
    const bloques = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'img']);
    let grupo = null;
    for (const n of [...salida.childNodes]) {
      const esBloque = n.nodeType === 1 && bloques.has(n.tagName.toLowerCase());
      if (esBloque) { grupo = null; continue; }
      if (n.nodeType === 3 && !n.textContent.trim() && !grupo) { n.remove(); continue; }
      if (!grupo) { grupo = document.createElement('p'); salida.insertBefore(grupo, n); }
      grupo.appendChild(n);
    }
    salida.querySelectorAll('li > p').forEach(e => e.replaceWith(...e.childNodes));
    salida.querySelectorAll('p, h2, h3, li, strong, em, a').forEach(e => { if (!e.textContent.trim() && !e.querySelector('img')) e.remove(); });
    salida.querySelectorAll('ul, ol').forEach(e => { if (!e.querySelector('li')) e.remove(); });
    return salida.innerHTML.replace(/(<br>)+(<\/(p|li|h2|h3)>)/g, '$2').trim();
  }

  function crearEditor(contenedor, html, { imagenes = false, alCambiar, placeholder = 'Escribe aquí…' } = {}) {
    const inicial = imagenes
      ? String(html || '').replace(/<img([^>]*?)src="\{\{img:([^}]+)\}\}"/g, (_, a, f) => `<img${a}data-archivo="${esc(f)}" src="${urlImg(f, 1200)}"`)
      : String(html || '');
    contenedor.innerHTML = `
      <div class="editor">
        <div class="editor__barra" role="toolbar" aria-label="Formato">
          <button type="button" data-cmd="p" title="Texto normal">Texto</button>
          ${imagenes ? '<button type="button" data-cmd="h2" title="Título grande"><b>T</b></button>' : ''}
          <button type="button" data-cmd="h3" title="Subtítulo"><b>T</b><small>2</small></button>
          <span class="sep"></span>
          <button type="button" data-cmd="bold" title="Negrita (Ctrl+B)"><b>B</b></button>
          <button type="button" data-cmd="italic" title="Cursiva (Ctrl+I)"><i>I</i></button>
          <span class="sep"></span>
          <button type="button" data-cmd="ul" title="Lista con viñetas">• Lista</button>
          <button type="button" data-cmd="ol" title="Lista numerada">1. Lista</button>
          <button type="button" data-cmd="link" title="Agregar enlace">🔗 Enlace</button>
          ${imagenes ? '<button type="button" data-cmd="img" title="Insertar foto">🖼 Foto</button>' : ''}
          <span class="sep"></span>
          <button type="button" data-cmd="clear" title="Quitar formato">⌫ Formato</button>
          <button type="button" data-cmd="undo" title="Deshacer (Ctrl+Z)">↶</button>
          <button type="button" data-cmd="redo" title="Rehacer">↷</button>
        </div>
        <div class="editor__area" contenteditable="true" data-placeholder="${esc(placeholder)}">${inicial}</div>
      </div>`;
    const area = $('.editor__area', contenedor);
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch {}
    const emitir = () => alCambiar(sanear(area, { imagenes }));
    area.addEventListener('input', emitir);
    area.addEventListener('paste', e => {
      e.preventDefault();
      const htmlPegado = e.clipboardData.getData('text/html');
      if (htmlPegado) {
        const tmp = document.createElement('div'); tmp.innerHTML = htmlPegado;
        document.execCommand('insertHTML', false, sanear(tmp));
      } else {
        const txt = e.clipboardData.getData('text/plain');
        const partes = txt.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`);
        document.execCommand('insertHTML', false, partes.join(''));
      }
      emitir();
    });
    let rango = null;
    const guardarSeleccion = () => { const s = getSelection(); if (s.rangeCount && area.contains(s.anchorNode)) rango = s.getRangeAt(0).cloneRange(); };
    area.addEventListener('keyup', guardarSeleccion); area.addEventListener('mouseup', guardarSeleccion); area.addEventListener('blur', guardarSeleccion);
    const restaurar = () => { area.focus(); if (rango) { const s = getSelection(); s.removeAllRanges(); s.addRange(rango); } };

    $('.editor__barra', contenedor).addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
    $('.editor__barra', contenedor).addEventListener('click', async e => {
      const b = e.target.closest('[data-cmd]'); if (!b) return;
      const cmd = b.dataset.cmd;
      restaurar();
      if (cmd === 'p' || cmd === 'h2' || cmd === 'h3') document.execCommand('formatBlock', false, `<${cmd}>`);
      else if (cmd === 'ul') document.execCommand('insertUnorderedList');
      else if (cmd === 'ol') document.execCommand('insertOrderedList');
      else if (cmd === 'clear') { document.execCommand('removeFormat'); document.execCommand('unlink'); document.execCommand('formatBlock', false, '<p>'); }
      else if (cmd === 'link') {
        const url = await abrirModal({
          titulo: 'Agregar enlace',
          cuerpo: '<label class="campo"><span>Dirección del enlace</span><input type="url" class="entrada" data-url placeholder="https://… o /products/heady-r/"></label><p class="ayuda">Primero selecciona el texto que quieres convertir en enlace.</p>',
          botones: [{ texto: 'Cancelar', clase: 'btn--linea', valor: null }, { texto: 'Agregar', valor: 'ok' }]
        }).then(r => (r ? $('[data-url]', modal).value.trim() : null));
        restaurar();
        if (url) document.execCommand('createLink', false, url);
      } else if (cmd === 'img') {
        const [f] = await elegirImagenes({ multiple: false, titulo: 'Insertar foto en el artículo' });
        restaurar();
        if (f) document.execCommand('insertHTML', false, `<p><img data-archivo="${esc(f)}" src="${urlImg(f, 1200)}" alt=""></p><p><br></p>`);
      } else document.execCommand(cmd);
      emitir();
    });
    return area;
  }

  // ================= estado general =================
  function actualizarEstado() {
    const el = $('[data-estado]');
    const sucio = haySinGuardar();
    el.className = 'barra__estado' + (sucio ? ' sucio' : ' ok');
    el.textContent = guardando ? 'Guardando…' : sucio ? 'Tienes cambios sin guardar' : 'Todo guardado';
    $('[data-guardar]').disabled = !sucio || guardando;
    $('[data-descartar]').hidden = !sucio || guardando;
  }
  const cambio = () => actualizarEstado();

  // Enlaza <input data-k="campo"> con un objeto
  function enlazar(raiz, obj, { alCambiar } = {}) {
    raiz.addEventListener('input', e => {
      const el = e.target.closest('[data-k]'); if (!el || !raiz.contains(el) || el.closest('[data-propio]')) return;
      const k = el.dataset.k;
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'number') v = el.value === '' ? NaN : Number(el.value);
      else v = el.value;
      obj[k] = v;
      alCambiar?.(k, v, el);
      cambio();
    });
  }

  function handleUnico(base, lista, actual) {
    let h = base || 'nuevo', i = 2;
    while (lista.some(x => x !== actual && x.handle === h)) h = `${base}-${i++}`;
    return h;
  }
  function renombrarProducto(viejo, nuevo) {
    for (const c of datos.colecciones) c.productos = c.productos.map(h => (h === viejo ? nuevo : h));
    datos.inicio.destacados = datos.inicio.destacados.map(h => (h === viejo ? nuevo : h));
  }
  function renombrarColeccion(viejo, nuevo) {
    for (const c of datos.inicio.categorias) if (c.coleccion === viejo) c.coleccion = nuevo;
  }

  // ================= vistas =================
  function bloqueErrores() {
    if (!errores.length) return '';
    return `<div class="errores"><strong>No se pudo guardar. Corrige esto:</strong><ul>${errores.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
  }
  const urlSitio = ruta => `<a href="${ruta}" target="_blank" rel="noopener" class="url">${esc(ruta)}</a>`;

  // ---------- Productos: lista ----------
  let filtro = '';
  function vistaProductos() {
    vista.innerHTML = `
      ${bloqueErrores()}
      <div class="cabeza">
        <div><h1>Productos</h1><p>${datos.productos.length} productos. El orden de esta lista es el orden del catálogo.</p></div>
        <button class="btn" data-nuevo>+ Nuevo producto</button>
      </div>
      <div class="herramientas"><input type="search" class="entrada" placeholder="Buscar producto…" value="${esc(filtro)}" data-buscar></div>
      <div class="lista" data-lista></div>`;
    const pintar = () => {
      const q = slug(filtro);
      const items = datos.productos.map((p, i) => ({ p, i })).filter(({ p }) => !q || slug(p.titulo).includes(q));
      $('[data-lista]').innerHTML = items.map(({ p, i }) => {
        const cols = datos.colecciones.filter(c => c.productos.includes(p.handle)).map(c => c.titulo);
        return `
        <div class="fila-item">
          <div class="miniatura">${p.imagenes[0] ? `<img src="${urlImg(p.imagenes[0], 200)}" alt="" loading="lazy">` : ''}</div>
          <div style="min-width:0">
            <a class="fila-item__nombre" href="#producto/${encodeURIComponent(p.handle)}">${esc(p.titulo || '(sin nombre)')}</a>
            <div class="fila-item__meta">${cols.length ? esc(cols.join(' · ')) : '<em>Sin colección</em>'}${datos.inicio.destacados.includes(p.handle) ? ' · ★ En portada' : ''}</div>
          </div>
          <div class="fila-item__precio">${dinero(p.precio)}</div>
          <label class="interruptor" title="Disponible / Agotado"><input type="checkbox" data-disp="${i}" ${p.disponible !== false ? 'checked' : ''}><i></i><span class="pill ${p.disponible !== false ? 'pill--verde' : 'pill--rojo'}">${p.disponible !== false ? 'Disponible' : 'Agotado'}</span></label>
          <div class="orden">
            <button class="icono" data-sube="${i}" ${i === 0 || q ? 'disabled' : ''} aria-label="Subir">↑</button>
            <button class="icono" data-baja="${i}" ${i === datos.productos.length - 1 || q ? 'disabled' : ''} aria-label="Bajar">↓</button>
            <a class="btn btn--linea btn--chico" href="#producto/${encodeURIComponent(p.handle)}">Editar</a>
          </div>
        </div>`;
      }).join('') || '<div class="vacio">No hay productos que coincidan.</div>';
    };
    pintar();
    $('[data-buscar]').oninput = e => { filtro = e.target.value; pintar(); };
    $('[data-lista]').onclick = e => {
      const b = e.target.closest('[data-sube],[data-baja]'); if (!b) return;
      mover(datos.productos, +(b.dataset.sube ?? b.dataset.baja), b.dataset.sube !== undefined ? -1 : 1);
      pintar(); cambio();
    };
    $('[data-lista]').onchange = e => {
      const c = e.target.closest('[data-disp]'); if (!c) return;
      datos.productos[+c.dataset.disp].disponible = c.checked;
      pintar(); cambio();
    };
    $('[data-nuevo]').onclick = () => {
      const p = { handle: handleUnico('nuevo-producto', datos.productos), titulo: '', precio: NaN, disponible: true, imagenes: [], descripcion: '', _nuevo: true };
      datos.productos.unshift(p);
      cambio();
      location.hash = `#producto/${p.handle}`;
    };
  }

  // ---------- Producto: editor ----------
  function vistaProducto(handle) {
    const p = datos.productos.find(x => x.handle === handle);
    if (!p) { vista.innerHTML = `<a class="volver" href="#productos">← Productos</a><div class="panel">Ese producto no existe.</div>`; return; }
    const tieneVariantes = Array.isArray(p.variantes) && p.variantes.length > 0;

    vista.innerHTML = `
      <a class="volver" href="#productos">← Productos</a>
      ${bloqueErrores()}
      <div class="cabeza">
        <div><h1 data-titulo-vista>${esc(p.titulo || 'Nuevo producto')}</h1>
        <p>Dirección: <span data-url-prod>${p._nuevo ? `<span class="url">/products/${esc(p.handle)}/</span> (se crea al guardar)` : urlSitio(`/products/${p.handle}/`)}</span></p></div>
      </div>
      <div class="rejilla-editor">
        <div>
          <section class="panel">
            <label class="campo"><span>Nombre del producto *</span><input type="text" data-k="titulo" value="${esc(p.titulo)}" placeholder="Ej. Heady 3" data-foco></label>
            <div class="fila" data-sin-variantes ${tieneVariantes ? 'hidden' : ''}>
              <label class="campo"><span>Precio *</span><div class="con-prefijo"><b>$</b><input type="number" min="0" step="0.01" data-k="precio" value="${isNaN(p.precio) ? '' : p.precio}" placeholder="0.00"></div></label>
            </div>
          </section>

          <section class="panel">
            <h2>Fotos</h2>
            <p class="ayuda">La primera foto es la principal (la que sale en el catálogo). Usa las flechas para cambiar el orden. Se reducen automáticamente a 1600 px.</p>
            <div class="fotos" data-fotos></div>
            <div class="agregar"><button type="button" class="btn btn--linea btn--chico" data-existentes>Elegir de las fotos ya subidas</button></div>
          </section>

          <section class="panel">
            <h2>Descripción</h2>
            <p class="ayuda">Usa "Subtítulo" para secciones como <em>Especificaciones</em> y "• Lista" para las características.</p>
            <div data-editor></div>
          </section>

          <section class="panel">
            <h2>Opciones (colores, tamaños…)</h2>
            <label class="interruptor" style="margin:6px 0 12px"><input type="checkbox" data-variantes ${tieneVariantes ? 'checked' : ''}><i></i> Este producto tiene opciones</label>
            <div data-panel-variantes></div>
          </section>

          <section class="panel">
            <h2>Manuales y descargas</h2>
            <p class="ayuda">PDF que el cliente puede descargar desde la página del producto (máx. 25 MB).</p>
            <div data-manuales></div>
            <div class="agregar"><button type="button" class="btn btn--linea btn--chico" data-subir-manual>⬆ Subir PDF</button></div>
          </section>
        </div>

        <div>
          <section class="panel">
            <h2>Estado</h2>
            <label class="interruptor" style="margin-top:8px"><input type="checkbox" data-k="disponible" ${p.disponible !== false ? 'checked' : ''}><i></i> <span data-txt-disp>${p.disponible !== false ? 'Disponible para la venta' : 'Agotado'}</span></label>
          </section>
          <section class="panel">
            <h2>Colecciones</h2>
            <p class="ayuda">¿En qué secciones del catálogo aparece?</p>
            <div class="casillas">${datos.colecciones.map((c, i) => `
              <label class="casilla"><input type="checkbox" data-col="${i}" ${c.productos.includes(p.handle) ? 'checked' : ''}> ${esc(c.titulo)}</label>`).join('')}
            </div>
          </section>
          <section class="panel">
            <h2>Página de inicio</h2>
            <label class="casilla"><input type="checkbox" data-destacado ${datos.inicio.destacados.includes(p.handle) ? 'checked' : ''}><div>Mostrar en "Destacados"<small>Aparece en la portada del sitio.</small></div></label>
          </section>
          <section class="panel zona-peligro">
            <h2>Eliminar producto</h2>
            <p class="ayuda">Se quita del sitio al guardar. Las fotos quedan guardadas por si las necesitas.</p>
            <button type="button" class="btn btn--peligro" data-eliminar>Eliminar este producto</button>
          </section>
        </div>
      </div>`;

    enlazar(vista, p, {
      alCambiar: (k, v) => {
        if (k === 'titulo') {
          $('[data-titulo-vista]').textContent = v || 'Nuevo producto';
          if (p._nuevo) {
            const viejo = p.handle;
            p.handle = handleUnico(slug(v) || 'nuevo-producto', datos.productos, p);
            renombrarProducto(viejo, p.handle);
            $('[data-url-prod]').innerHTML = `<span class="url">/products/${esc(p.handle)}/</span> (se crea al guardar)`;
            history.replaceState(null, '', `#producto/${encodeURIComponent(p.handle)}`);
          }
        }
        if (k === 'disponible') $('[data-txt-disp]').textContent = v ? 'Disponible para la venta' : 'Agotado';
      }
    });

    // Fotos
    const pintarFotos = () => {
      $('[data-fotos]').innerHTML = p.imagenes.map((f, i) => `
        <div class="foto">
          ${i === 0 ? '<span class="foto__principal">Principal</span>' : ''}
          <img src="${urlImg(f, 400)}" alt="" loading="lazy">
          <div class="foto__acciones">
            <button type="button" class="icono" data-izq="${i}" ${i === 0 ? 'disabled' : ''} title="Mover a la izquierda">←</button>
            <button type="button" class="icono" data-der="${i}" ${i === p.imagenes.length - 1 ? 'disabled' : ''} title="Mover a la derecha">→</button>
            <button type="button" class="icono icono--rojo" data-quitar="${i}" title="Quitar del producto">✕</button>
          </div>
        </div>`).join('') + `
        <div class="soltar" data-soltar tabindex="0" role="button"><div><strong>+ Agregar fotos</strong><br>Haz clic o arrastra aquí</div></div>`;
    };
    pintarFotos();
    const agregarFotos = nombres => { for (const n of nombres) if (!p.imagenes.includes(n)) p.imagenes.push(n); pintarFotos(); pintarVariantes(); cambio(); };
    const zonaFotos = $('[data-fotos]');
    zonaFotos.onclick = async e => {
      const b = e.target.closest('button');
      if (b?.dataset.izq) { mover(p.imagenes, +b.dataset.izq, -1); }
      else if (b?.dataset.der) { mover(p.imagenes, +b.dataset.der, 1); }
      else if (b?.dataset.quitar) {
        const f = p.imagenes.splice(+b.dataset.quitar, 1)[0];
        for (const v of p.variantes || []) if (v.imagen === f) v.imagen = p.imagenes[0] || '';
      } else if (e.target.closest('[data-soltar]')) { agregarFotos(await subirImagenes(await pedirArchivo('img'))); return; }
      else return;
      pintarFotos(); pintarVariantes(); cambio();
    };
    zonaFotos.addEventListener('keydown', async e => { if (e.target.matches('[data-soltar]') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); agregarFotos(await subirImagenes(await pedirArchivo('img'))); } });
    zonaFotos.addEventListener('dragover', e => { const z = e.target.closest('[data-soltar]'); if (z) { e.preventDefault(); z.classList.add('encima'); } });
    zonaFotos.addEventListener('dragleave', e => e.target.closest('[data-soltar]')?.classList.remove('encima'));
    zonaFotos.addEventListener('drop', async e => { const z = e.target.closest('[data-soltar]'); if (!z) return; e.preventDefault(); z.classList.remove('encima'); agregarFotos(await subirImagenes([...e.dataTransfer.files])); });
    $('[data-existentes]').onclick = async () => agregarFotos(await elegirImagenes({ titulo: 'Agregar fotos al producto' }));

    // Descripción
    crearEditor($('[data-editor]'), p.descripcion, { alCambiar: html => { p.descripcion = html; cambio(); }, placeholder: 'Describe el producto…' });

    // Variantes
    const sincronizarPrecio = () => { if (p.variantes?.length) { const precios = p.variantes.map(v => v.precio).filter(n => typeof n === 'number' && !isNaN(n)); p.precio = precios.length ? Math.min(...precios) : NaN; } };
    function pintarVariantes() {
      const cont = $('[data-panel-variantes]');
      if (!p.variantes?.length) { cont.innerHTML = '<p class="ayuda">Actívalo si el cliente debe elegir entre opciones, por ejemplo colores con precios o fotos distintas.</p>'; return; }
      cont.innerHTML = `
        <label class="campo" style="max-width:260px"><span>Nombre de la opción</span><input type="text" data-propio data-opcion value="${esc(p.opcion || '')}" placeholder="Ej. Color"></label>
        <table class="tabla">
          <thead><tr><th>Opción</th><th>Precio</th><th>Foto</th><th>Disponible</th><th></th></tr></thead>
          <tbody>${p.variantes.map((v, i) => `
            <tr>
              <td><input class="entrada" data-propio data-v="${i}" data-vk="nombre" value="${esc(v.nombre)}" placeholder="Ej. Negro"></td>
              <td style="width:120px"><input class="entrada" type="number" min="0" step="0.01" data-propio data-v="${i}" data-vk="precio" value="${isNaN(v.precio) ? '' : v.precio}"></td>
              <td><select class="entrada" data-propio data-v="${i}" data-vk="imagen"><option value="">—</option>${p.imagenes.map((f, j) => `<option value="${esc(f)}" ${v.imagen === f ? 'selected' : ''}>Foto ${j + 1}</option>`).join('')}</select></td>
              <td style="text-align:center"><input type="checkbox" data-propio data-v="${i}" data-vk="disponible" ${v.disponible !== false ? 'checked' : ''}></td>
              <td><button type="button" class="icono icono--rojo" data-quitar-v="${i}" title="Quitar opción" ${p.variantes.length === 1 ? 'disabled' : ''}>✕</button></td>
            </tr>`).join('')}</tbody>
        </table>
        <div class="agregar"><button type="button" class="btn btn--linea btn--chico" data-agregar-v>+ Agregar opción</button></div>`;
    }
    pintarVariantes();
    const panelV = $('[data-panel-variantes]');
    panelV.addEventListener('input', e => {
      const el = e.target;
      if (el.matches('[data-opcion]')) { p.opcion = el.value; cambio(); return; }
      if (!el.matches('[data-v]')) return;
      const v = p.variantes[+el.dataset.v]; const k = el.dataset.vk;
      v[k] = k === 'precio' ? (el.value === '' ? NaN : Number(el.value)) : k === 'disponible' ? el.checked : el.value;
      sincronizarPrecio(); cambio();
    });
    panelV.addEventListener('click', e => {
      if (e.target.closest('[data-agregar-v]')) { p.variantes.push({ nombre: '', precio: isNaN(p.precio) ? NaN : p.precio, disponible: true, imagen: p.imagenes[0] || '' }); }
      else if (e.target.closest('[data-quitar-v]')) { p.variantes.splice(+e.target.closest('[data-quitar-v]').dataset.quitarV, 1); sincronizarPrecio(); }
      else return;
      pintarVariantes(); cambio();
    });
    $('[data-variantes]').onchange = async e => {
      if (e.target.checked) {
        p.opcion = p.opcion || 'Color';
        p.variantes = [{ nombre: '', precio: isNaN(p.precio) ? NaN : p.precio, disponible: true, imagen: p.imagenes[0] || '' }];
      } else {
        if (p.variantes?.some(v => v.nombre) && !(await confirmar('Quitar opciones', 'Se borrarán las opciones de este producto. ¿Continuar?', 'Quitar opciones', true))) { e.target.checked = true; return; }
        delete p.variantes; delete p.opcion;
      }
      $('[data-sin-variantes]').hidden = e.target.checked;
      $('[data-sin-variantes] input').value = isNaN(p.precio) ? '' : p.precio;
      pintarVariantes(); cambio();
    };

    // Manuales
    const pintarManuales = () => {
      const m = p.manuales || [];
      $('[data-manuales]').innerHTML = m.length ? `<div class="ordenable">${m.map((x, i) => `
        <div class="ordenable__item">📄 <input class="entrada" data-propio data-man="${i}" value="${esc(x.titulo)}" placeholder="Título del documento" style="flex:1">
          <a href="/manuales/${encodeURIComponent(x.archivo)}" target="_blank" rel="noopener" class="ayuda">${esc(x.archivo)}</a>
          <button type="button" class="icono icono--rojo" data-quitar-man="${i}" title="Quitar">✕</button></div>`).join('')}</div>` : '<p class="ayuda">Sin documentos.</p>';
    };
    pintarManuales();
    $('[data-manuales]').addEventListener('input', e => { if (e.target.matches('[data-man]')) { p.manuales[+e.target.dataset.man].titulo = e.target.value; cambio(); } });
    $('[data-manuales]').addEventListener('click', e => {
      const b = e.target.closest('[data-quitar-man]'); if (!b) return;
      p.manuales.splice(+b.dataset.quitarMan, 1); if (!p.manuales.length) delete p.manuales;
      pintarManuales(); cambio();
    });
    $('[data-subir-manual]').onclick = async () => {
      const [f] = await pedirArchivo('pdf'); if (!f) return;
      if (f.size > 25 * 1048576) { avisar('El PDF pesa más de 25 MB. Comprímelo antes de subirlo (por ejemplo en ilovepdf.com).', 'error'); return; }
      try {
        avisar('Subiendo PDF…');
        const archivo = await subirArchivo('manual', f, f.name);
        (p.manuales ||= []).push({ titulo: 'Manual de usuario', archivo });
        pintarManuales(); cambio(); avisar('PDF subido', 'ok');
      } catch (err) { avisar(err.message, 'error'); }
    };

    // Colecciones / destacados
    vista.addEventListener('change', e => {
      const c = e.target.closest('[data-col]');
      if (c) {
        const col = datos.colecciones[+c.dataset.col];
        if (c.checked && !col.productos.includes(p.handle)) col.productos.push(p.handle);
        if (!c.checked) col.productos = col.productos.filter(h => h !== p.handle);
        cambio();
      }
      if (e.target.matches('[data-destacado]')) {
        const d = datos.inicio.destacados;
        if (e.target.checked && !d.includes(p.handle)) d.push(p.handle);
        if (!e.target.checked) datos.inicio.destacados = d.filter(h => h !== p.handle);
        cambio();
      }
    });

    $('[data-eliminar]').onclick = async () => {
      if (!(await confirmar('Eliminar producto', `¿Seguro que quieres eliminar <strong>${esc(p.titulo || 'este producto')}</strong>? Puedes deshacerlo con "Descartar cambios" antes de guardar.`, 'Eliminar', true))) return;
      datos.productos = datos.productos.filter(x => x !== p);
      for (const c of datos.colecciones) c.productos = c.productos.filter(h => h !== p.handle);
      datos.inicio.destacados = datos.inicio.destacados.filter(h => h !== p.handle);
      cambio(); location.hash = '#productos';
    };
    if (p._nuevo && !p.titulo) $('[data-foco]').focus();
  }

  // ---------- Colecciones ----------
  function vistaColecciones() {
    vista.innerHTML = `
      ${bloqueErrores()}
      <div class="cabeza">
        <div><h1>Colecciones</h1><p>Las secciones del catálogo (menú "Catálogo" del sitio).</p></div>
        <button class="btn" data-nueva>+ Nueva colección</button>
      </div>
      <div data-cols></div>`;
    const pintar = () => {
      $('[data-cols]').innerHTML = datos.colecciones.map((c, i) => {
        const fuera = datos.productos.filter(p => !c.productos.includes(p.handle));
        return `
        <section class="panel" data-c="${i}">
          <div class="cabeza" style="margin-bottom:12px">
            <label class="campo" style="flex:1;margin:0;max-width:420px"><span>Nombre</span><input type="text" data-propio data-ct="${i}" value="${esc(c.titulo)}" placeholder="Ej. Linternas"></label>
            <div class="orden">
              <button class="icono" data-csube="${i}" ${i === 0 ? 'disabled' : ''} title="Subir en el menú">↑</button>
              <button class="icono" data-cbaja="${i}" ${i === datos.colecciones.length - 1 ? 'disabled' : ''} title="Bajar en el menú">↓</button>
              <button class="btn btn--peligro btn--chico" data-cborrar="${i}">Eliminar</button>
            </div>
          </div>
          <p class="ayuda">Dirección: ${c._nuevo ? `<span class="url">/collections/${esc(c.handle)}/</span>` : urlSitio(`/collections/${c.handle}/`)} · ${c.productos.length} productos</p>
          <div class="ordenable">${c.productos.map((h, j) => {
            const p = datos.productos.find(x => x.handle === h);
            return `<div class="ordenable__item"><div class="miniatura">${p?.imagenes[0] ? `<img src="${urlImg(p.imagenes[0], 120)}" alt="">` : ''}</div><span>${esc(p?.titulo || h)}</span>
              <button class="icono" data-psube="${i}:${j}" ${j === 0 ? 'disabled' : ''}>↑</button><button class="icono" data-pbaja="${i}:${j}" ${j === c.productos.length - 1 ? 'disabled' : ''}>↓</button><button class="icono icono--rojo" data-pquitar="${i}:${j}" title="Quitar de la colección">✕</button></div>`;
          }).join('') || '<p class="ayuda">Todavía no tiene productos.</p>'}</div>
          ${fuera.length ? `<div class="agregar"><select class="entrada" data-psel="${i}"><option value="">Agregar un producto…</option>${fuera.map(p => `<option value="${esc(p.handle)}">${esc(p.titulo)}</option>`).join('')}</select></div>` : ''}
        </section>`;
      }).join('');
    };
    pintar();
    const cont = $('[data-cols]');
    cont.addEventListener('input', e => {
      if (!e.target.matches('[data-ct]')) return;
      const c = datos.colecciones[+e.target.dataset.ct];
      c.titulo = e.target.value;
      if (c._nuevo) {
        const viejo = c.handle;
        c.handle = handleUnico(slug(c.titulo) || 'coleccion', datos.colecciones, c);
        if (c.handle === 'all') c.handle = 'all-2';
        renombrarColeccion(viejo, c.handle);
        const url = e.target.closest('.panel').querySelector('.url'); if (url) url.textContent = `/collections/${c.handle}/`;
      }
      cambio();
    });
    cont.addEventListener('change', e => {
      if (!e.target.matches('[data-psel]') || !e.target.value) return;
      datos.colecciones[+e.target.dataset.psel].productos.push(e.target.value);
      pintar(); cambio();
    });
    cont.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.csube) mover(datos.colecciones, +d.csube, -1);
      else if (d.cbaja) mover(datos.colecciones, +d.cbaja, 1);
      else if (d.psube || d.pbaja || d.pquitar) {
        const [i, j] = (d.psube || d.pbaja || d.pquitar).split(':').map(Number);
        const arr = datos.colecciones[i].productos;
        if (d.pquitar) arr.splice(j, 1); else mover(arr, j, d.psube ? -1 : 1);
      } else if (d.cborrar) {
        const c = datos.colecciones[+d.cborrar];
        if (!(await confirmar('Eliminar colección', `¿Eliminar la colección <strong>${esc(c.titulo || 'sin nombre')}</strong>? Los productos no se borran.`, 'Eliminar', true))) return;
        datos.colecciones.splice(+d.cborrar, 1);
        datos.inicio.categorias = datos.inicio.categorias.filter(x => x.coleccion !== c.handle);
      } else return;
      pintar(); cambio();
    });
    $('[data-nueva]').onclick = () => {
      datos.colecciones.push({ handle: handleUnico('nueva-coleccion', datos.colecciones), titulo: '', productos: [], _nuevo: true });
      pintar(); cambio();
      const inputs = $$('[data-ct]'); inputs[inputs.length - 1].focus();
    };
  }

  // ---------- Artículos ----------
  function vistaArticulos() {
    const lista = [...datos.articulos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    vista.innerHTML = `
      ${bloqueErrores()}
      <div class="cabeza">
        <div><h1>Artículos del blog</h1><p>El artículo más reciente aparece en la página de inicio.</p></div>
        <button class="btn" data-nuevo>+ Nuevo artículo</button>
      </div>
      <div class="lista">${lista.map(a => `
        <div class="fila-item" style="grid-template-columns:56px minmax(0,1fr) auto">
          <div class="miniatura">${a.imagen ? `<img src="${urlImg(a.imagen, 200)}" alt="">` : ''}</div>
          <div style="min-width:0"><a class="fila-item__nombre" href="#articulo/${encodeURIComponent(a.handle)}">${esc(a.titulo || '(sin título)')}</a><div class="fila-item__meta">${esc(fechaLarga(a.fecha))}</div></div>
          <a class="btn btn--linea btn--chico" href="#articulo/${encodeURIComponent(a.handle)}">Editar</a>
        </div>`).join('') || '<div class="vacio">Todavía no hay artículos.</div>'}</div>`;
    $('[data-nuevo]').onclick = () => {
      const a = { handle: handleUnico('nuevo-articulo', datos.articulos), titulo: '', fecha: hoy(), imagen: '', resumen: '', contenido: '', _nuevo: true };
      datos.articulos.unshift(a); cambio();
      location.hash = `#articulo/${a.handle}`;
    };
  }

  function vistaArticulo(handle) {
    const a = datos.articulos.find(x => x.handle === handle);
    if (!a) { vista.innerHTML = `<a class="volver" href="#articulos">← Artículos</a><div class="panel">Ese artículo no existe.</div>`; return; }
    vista.innerHTML = `
      <a class="volver" href="#articulos">← Artículos</a>
      ${bloqueErrores()}
      <div class="cabeza"><div><h1 data-titulo-vista>${esc(a.titulo || 'Nuevo artículo')}</h1>
        <p>Dirección: <span data-url-art>${a._nuevo ? `<span class="url">/blogs/articulos/${esc(a.handle)}/</span> (se crea al guardar)` : urlSitio(`/blogs/articulos/${a.handle}/`)}</span></p></div></div>
      <div class="rejilla-editor">
        <div>
          <section class="panel">
            <label class="campo"><span>Título *</span><input type="text" data-k="titulo" value="${esc(a.titulo)}" data-foco></label>
            <label class="campo"><span>Resumen</span><textarea rows="3" data-k="resumen" placeholder="Una o dos frases que invitan a leer.">${esc(a.resumen)}</textarea><small>Aparece en la portada y en la lista de artículos.</small></label>
          </section>
          <section class="panel"><h2>Contenido</h2><p class="ayuda">Con "🖼 Foto" puedes insertar imágenes dentro del texto.</p><div data-editor></div></section>
        </div>
        <div>
          <section class="panel">
            <label class="campo"><span>Fecha</span><input type="date" data-k="fecha" value="${esc(a.fecha)}"></label>
          </section>
          <section class="panel">
            <h2>Imagen de portada *</h2>
            <div class="foto-unica" style="margin-top:10px"><div class="miniatura" data-portada>${a.imagen ? `<img src="${urlImg(a.imagen, 300)}" alt="">` : ''}</div>
            <button type="button" class="btn btn--linea btn--chico" data-cambiar-portada>${a.imagen ? 'Cambiar imagen' : 'Elegir imagen'}</button></div>
          </section>
          <section class="panel zona-peligro"><h2>Eliminar artículo</h2><p class="ayuda">Se quita del blog al guardar.</p><button class="btn btn--peligro" data-eliminar>Eliminar este artículo</button></section>
        </div>
      </div>`;
    enlazar(vista, a, {
      alCambiar: (k, v) => {
        if (k !== 'titulo') return;
        $('[data-titulo-vista]').textContent = v || 'Nuevo artículo';
        if (a._nuevo) {
          a.handle = handleUnico(slug(v) || 'nuevo-articulo', datos.articulos, a);
          $('[data-url-art]').innerHTML = `<span class="url">/blogs/articulos/${esc(a.handle)}/</span> (se crea al guardar)`;
          history.replaceState(null, '', `#articulo/${encodeURIComponent(a.handle)}`);
        }
      }
    });
    crearEditor($('[data-editor]'), a.contenido, { imagenes: true, alCambiar: html => { a.contenido = html; cambio(); }, placeholder: 'Escribe el artículo…' });
    $('[data-cambiar-portada]').onclick = async () => {
      const [f] = await elegirImagenes({ multiple: false, titulo: 'Imagen de portada del artículo' });
      if (!f) return;
      a.imagen = f; $('[data-portada]').innerHTML = `<img src="${urlImg(f, 300)}" alt="">`; cambio();
    };
    $('[data-eliminar]').onclick = async () => {
      if (!(await confirmar('Eliminar artículo', `¿Eliminar <strong>${esc(a.titulo || 'este artículo')}</strong>?`, 'Eliminar', true))) return;
      datos.articulos = datos.articulos.filter(x => x !== a); cambio(); location.hash = '#articulos';
    };
    if (a._nuevo && !a.titulo) $('[data-foco]').focus();
  }

  // ---------- Portada ----------
  function vistaPortada() {
    const ini = datos.inicio;
    vista.innerHTML = `
      ${bloqueErrores()}
      <div class="cabeza"><div><h1>Página de inicio</h1><p>Lo primero que ven tus clientes al entrar a ${urlSitio('/')}</p></div></div>
      <section class="panel">
        <h2>Banner principal</h2>
        <p class="ayuda">Las dos fotos grandes de arriba, con el título y el botón encima.</p>
        <div class="fila">
          <label class="campo"><span>Título</span><input type="text" data-hero="titulo" value="${esc(ini.hero.titulo)}"></label>
          <label class="campo"><span>Texto del botón</span><input type="text" data-hero="boton" value="${esc(ini.hero.boton)}"></label>
        </div>
        <div class="fila" data-hero-fotos></div>
      </section>
      <section class="panel">
        <h2>Categorías ("Productos")</h2>
        <p class="ayuda">Las tarjetas de colecciones que aparecen debajo del banner.</p>
        <div class="ordenable" data-cats></div>
        <div class="agregar"><button type="button" class="btn btn--linea btn--chico" data-agregar-cat>+ Agregar categoría</button></div>
      </section>
      <section class="panel">
        <h2>Destacados</h2>
        <p class="ayuda">Productos que se muestran en la portada, en este orden.</p>
        <div class="ordenable" data-dest></div>
        <div class="agregar" data-dest-agregar></div>
      </section>`;

    vista.addEventListener('input', e => { const k = e.target.dataset.hero; if (k) { ini.hero[k] = e.target.value; cambio(); } });

    const pintarHero = () => {
      $('[data-hero-fotos]').innerHTML = [0, 1].map(i => `
        <div class="foto-unica"><div class="miniatura">${ini.hero.imagenes[i] ? `<img src="${urlImg(ini.hero.imagenes[i], 300)}" alt="">` : ''}</div>
        <div><strong>Foto ${i === 0 ? 'izquierda' : 'derecha'}</strong><br><button type="button" class="btn btn--linea btn--chico" data-hero-foto="${i}" style="margin-top:6px">Cambiar</button></div></div>`).join('');
    };
    pintarHero();
    $('[data-hero-fotos]').onclick = async e => {
      const b = e.target.closest('[data-hero-foto]'); if (!b) return;
      const [f] = await elegirImagenes({ multiple: false, titulo: 'Foto del banner' }); if (!f) return;
      ini.hero.imagenes[+b.dataset.heroFoto] = f; pintarHero(); cambio();
    };

    const pintarCats = () => {
      $('[data-cats]').innerHTML = ini.categorias.map((c, i) => `
        <div class="ordenable__item">
          <div class="miniatura">${c.imagen ? `<img src="${urlImg(c.imagen, 120)}" alt="">` : ''}</div>
          <select class="entrada" data-cat-col="${i}" style="flex:1">${datos.colecciones.map(col => `<option value="${esc(col.handle)}" ${col.handle === c.coleccion ? 'selected' : ''}>${esc(col.titulo || col.handle)}</option>`).join('')}</select>
          <button type="button" class="btn btn--linea btn--chico" data-cat-foto="${i}">Foto</button>
          <button type="button" class="icono" data-cat-sube="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icono" data-cat-baja="${i}" ${i === ini.categorias.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="icono icono--rojo" data-cat-quitar="${i}">✕</button>
        </div>`).join('') || '<p class="ayuda">Sin categorías.</p>';
    };
    pintarCats();
    $('[data-cats]').addEventListener('change', e => { if (e.target.matches('[data-cat-col]')) { ini.categorias[+e.target.dataset.catCol].coleccion = e.target.value; cambio(); } });
    $('[data-cats]').addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
      if (d.catFoto) { const [f] = await elegirImagenes({ multiple: false, titulo: 'Foto de la categoría' }); if (!f) return; ini.categorias[+d.catFoto].imagen = f; }
      else if (d.catSube) mover(ini.categorias, +d.catSube, -1);
      else if (d.catBaja) mover(ini.categorias, +d.catBaja, 1);
      else if (d.catQuitar) ini.categorias.splice(+d.catQuitar, 1);
      else return;
      pintarCats(); cambio();
    });
    $('[data-agregar-cat]').onclick = () => {
      const libre = datos.colecciones.find(c => !ini.categorias.some(x => x.coleccion === c.handle)) || datos.colecciones[0];
      if (!libre) return avisar('Primero crea una colección.', 'error');
      const primerProd = datos.productos.find(p => libre.productos.includes(p.handle));
      ini.categorias.push({ coleccion: libre.handle, imagen: primerProd?.imagenes[0] || '' });
      pintarCats(); cambio();
    };

    const pintarDest = () => {
      $('[data-dest]').innerHTML = ini.destacados.map((h, i) => {
        const p = datos.productos.find(x => x.handle === h);
        return `<div class="ordenable__item"><div class="miniatura">${p?.imagenes[0] ? `<img src="${urlImg(p.imagenes[0], 120)}" alt="">` : ''}</div><span>${esc(p?.titulo || h)}</span>
          <button type="button" class="icono" data-d-sube="${i}" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="icono" data-d-baja="${i}" ${i === ini.destacados.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="icono icono--rojo" data-d-quitar="${i}">✕</button></div>`;
      }).join('') || '<p class="ayuda">Sin destacados.</p>';
      const fuera = datos.productos.filter(p => !ini.destacados.includes(p.handle));
      $('[data-dest-agregar]').innerHTML = fuera.length ? `<select class="entrada" data-d-sel><option value="">Agregar un producto…</option>${fuera.map(p => `<option value="${esc(p.handle)}">${esc(p.titulo)}</option>`).join('')}</select>` : '';
    };
    pintarDest();
    $('[data-dest]').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
      if (d.dSube) mover(ini.destacados, +d.dSube, -1);
      else if (d.dBaja) mover(ini.destacados, +d.dBaja, 1);
      else if (d.dQuitar) ini.destacados.splice(+d.dQuitar, 1);
      else return;
      pintarDest(); cambio();
    });
    $('[data-dest-agregar]').addEventListener('change', e => { if (e.target.value) { ini.destacados.push(e.target.value); pintarDest(); cambio(); } });
  }

  // ---------- Configuración ----------
  function vistaConfig() {
    const t = datos.tienda;
    vista.innerHTML = `
      ${bloqueErrores()}
      <div class="cabeza"><div><h1>Datos de la tienda</h1><p>Información de contacto que aparece en todo el sitio.</p></div></div>
      <section class="panel">
        <label class="campo"><span>Nombre de la tienda</span><input type="text" data-k="nombre" value="${esc(t.nombre)}"></label>
        <label class="campo"><span>Descripción corta</span><textarea rows="2" data-k="descripcion">${esc(t.descripcion)}</textarea><small>Aparece en el pie de página y en Google.</small></label>
      </section>
      <section class="panel">
        <h2>Contacto</h2>
        <label class="campo"><span>Número de WhatsApp para pedidos *</span>
          <input type="tel" data-k="whatsapp" value="${esc(t.whatsapp)}" inputmode="numeric" placeholder="50761234567">
          <small>Solo números, empezando con el código de país (507 en Panamá). Sin espacios, guiones ni "+". <a href="#" data-probar>Probar número ↗</a></small></label>
        <label class="campo"><span>Correo (opcional)</span><input type="email" data-k="correo" value="${esc(t.correo)}" placeholder="ventas@bajarequeoutdoor.com"></label>
        <div class="fila">
          <label class="campo"><span>Instagram (opcional)</span><input type="url" data-k="instagram" value="${esc(t.instagram)}" placeholder="https://instagram.com/…"></label>
          <label class="campo"><span>Facebook (opcional)</span><input type="url" data-k="facebook" value="${esc(t.facebook)}" placeholder="https://facebook.com/…"></label>
        </div>
      </section>
      <section class="panel">
        <h2>Avanzado</h2>
        <label class="campo"><span>Dominio</span><input type="url" data-k="dominio" value="${esc(t.dominio)}"><small>Se usa para Google y al compartir en redes. Normalmente no se cambia.</small></label>
      </section>`;
    enlazar(vista, t, { alCambiar: (k, v, el) => { if (k === 'whatsapp') { const limpio = v.replace(/\D/g, ''); if (limpio !== v) { el.value = limpio; t.whatsapp = limpio; } } } });
    $('[data-probar]').onclick = e => { e.preventDefault(); window.open(`https://wa.me/${t.whatsapp}?text=${encodeURIComponent('Prueba desde el admin de Bajareque Outdoor')}`, '_blank', 'noopener'); };
  }

  // ---------- Respaldos ----------
  async function vistaRespaldos() {
    vista.innerHTML = `<div class="cabeza"><div><h1>Respaldos</h1><p>Cada vez que guardas, se hace una copia de la versión anterior. Si algo salió mal, puedes volver atrás.</p></div></div><div class="lista" data-resp><div class="vacio">Cargando…</div></div>`;
    const { respaldos } = await (await fetch('/api/respaldos')).json();
    const fecha = f => { const m = f.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).toLocaleString('es-PA', { dateStyle: 'long', timeStyle: 'short' }) : f; };
    $('[data-resp]').innerHTML = respaldos.map(f => `
      <div class="fila-item" style="grid-template-columns:minmax(0,1fr) auto"><div><strong>${esc(fecha(f))}</strong><div class="fila-item__meta">${esc(f)}</div></div>
      <button class="btn btn--linea btn--chico" data-rest="${esc(f)}">Restaurar esta versión</button></div>`).join('') || '<div class="vacio">Todavía no hay respaldos. Se crean al guardar.</div>';
    $('[data-resp]').onclick = async e => {
      const b = e.target.closest('[data-rest]'); if (!b) return;
      const aviso = haySinGuardar() ? '<br><br><strong>Ojo:</strong> perderás los cambios que no has guardado.' : '';
      if (!(await confirmar('Restaurar respaldo', `El sitio volverá a como estaba el <strong>${esc(fecha(b.dataset.rest))}</strong>. La versión actual también se respalda, por si acaso.${aviso}`, 'Restaurar'))) return;
      const r = await fetch('/api/restaurar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archivo: b.dataset.rest }) });
      const j = await r.json();
      if (!j.ok) return avisar(j.error || 'No se pudo restaurar.', 'error');
      await cargarDatos(); avisar('Respaldo restaurado. El sitio se actualizó.', 'ok'); render();
    };
  }

  // ================= guardar / publicar =================
  async function guardar() {
    if (!haySinGuardar() || guardando) return;
    const copia = JSON.parse(limpioJSON(datos));
    copia.articulos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    guardando = true; actualizarEstado();
    try {
      const r = await fetch('/api/datos', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(copia) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 422) { errores = j.errores || []; avisar('Hay datos que corregir antes de guardar.', 'error'); render(); return; }
      if (!r.ok) throw new Error(j.errores?.[0] || j.error || 'Error al guardar');
      errores = [];
      datos = copia; original = limpioJSON(copia);
      const avisosBuild = (j.build || '').split('\n').filter(l => l.includes('⚠') && !l.includes('WhatsApp'));
      avisar(j.ok ? 'Cambios guardados. La vista previa ya está actualizada.' : 'Se guardó, pero hubo un problema al regenerar el sitio.', j.ok ? 'ok' : 'error');
      avisosBuild.forEach(l => avisar(l.replace('⚠', '').trim(), '', 7000));
      render();
    } catch (e) { avisar(e.message, 'error'); }
    finally { guardando = false; actualizarEstado(); }
  }

  async function publicar() {
    if (haySinGuardar()) {
      const ok = await confirmar('Primero guarda', 'Tienes cambios sin guardar. ¿Guardarlos y publicar?', 'Guardar y publicar');
      if (!ok) return;
      await guardar();
      if (haySinGuardar()) return;
    }
    const estado = await (await fetch('/api/publicar')).json();
    if (!estado.git || !estado.remoto) {
      return abrirModal({
        titulo: 'Publicación no configurada',
        cuerpo: `<p>Tus cambios están <strong>guardados en esta computadora</strong> y ya se ven en la <a href="/" target="_blank">vista previa</a>, pero todavía no se pueden subir a internet desde aquí.</p>
          <p class="ayuda">Para activarlo hay que conectar esta carpeta con GitHub y Cloudflare Pages una sola vez (instrucciones en README.md, sección "Publicar"). Después, este botón sube todo con un clic.</p>`,
        botones: [{ texto: 'Entendido', valor: true }]
      });
    }
    const otraRama = estado.rama && estado.ramaTienda && estado.rama !== estado.ramaTienda;
    const ok = await confirmar('Publicar en internet', otraRama
      ? `<strong>Atención:</strong> esta carpeta está en la rama <span class="url">${esc(estado.rama)}</span>, no en <span class="url">${esc(estado.ramaTienda)}</span>. Los cambios se subirán a GitHub, pero <strong>no aparecerán en la tienda</strong> hasta unirlos a ${esc(estado.ramaTienda)} (por ejemplo con un Pull Request).`
      : 'Se subirán los cambios guardados. En 1 o 2 minutos se verán en el sitio público.', 'Publicar');
    if (!ok) return;
    const btn = $('[data-publicar]'); btn.disabled = true; btn.textContent = 'Publicando…';
    try {
      const r = await fetch('/api/publicar', { method: 'POST' });
      const j = await r.json();
      if (j.ok) {
        avisar(j.sinCambios ? 'No había cambios nuevos para publicar.' : '¡Publicado! En 1–2 minutos estará en línea.', 'ok', 6000);
        if (j.actualizado) { await cargarDatos(); render(); avisar('También se incluyeron los cambios publicados desde otra computadora.', '', 7000); }
        $('[data-franja]').hidden = true;
      } else if (j.conflicto) mostrarConflicto(j.detalle);
      else abrirModal({ titulo: 'No se pudo publicar', cuerpo: `<p>${esc(j.error)}</p><details><summary>Detalle técnico</summary><pre class="salida">${esc(j.detalle || '')}</pre></details>`, botones: [{ texto: 'Cerrar', valor: true }] });
    } catch (e) { avisar('No se pudo publicar: ' + e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Publicar en internet'; }
  }

  // ================= sincronización con GitHub =================
  function mostrarConflicto(detalle) {
    return abrirModal({
      titulo: 'No se pudieron combinar los cambios',
      cuerpo: `<p>Otra persona publicó cambios en <strong>lo mismo</strong> que tú editaste (por ejemplo, el mismo producto) y no se pueden juntar automáticamente.</p>
        <p><strong>Tu trabajo no se perdió:</strong> quedó guardado en esta computadora.</p>
        <p class="ayuda">Para resolverlo: abre GitHub Desktop, pulsa <em>Fetch origin → Pull origin</em> y elige qué versión conservar en cada archivo marcado. O pídele ayuda a Luis.</p>
        <details><summary>Detalle técnico</summary><pre class="salida">${esc(detalle || '')}</pre></details>`,
      botones: [{ texto: 'Entendido', valor: true }]
    });
  }

  function mostrarFranja(nuevos) {
    $('[data-franja-texto]').textContent = `Hay ${nuevos === 1 ? 'un cambio nuevo publicado' : `${nuevos} cambios nuevos publicados`} desde otra computadora.`;
    $('[data-franja]').hidden = false;
  }

  async function revisarGitHub() {
    try {
      const j = await (await fetch('/api/sincronizar?revisar=1')).json();
      if (j.estado === 'hay-nuevos') mostrarFranja(j.nuevos);
    } catch {}
  }

  async function actualizarDesdeGitHub() {
    if (haySinGuardar()) {
      const ok = await confirmar('Primero guarda', 'Tienes cambios sin guardar. Se guardarán y luego se combinarán con los cambios nuevos.', 'Guardar y actualizar');
      if (!ok) return;
      await guardar();
      if (haySinGuardar()) return;
    }
    const btn = $('[data-actualizar]'); btn.disabled = true; btn.textContent = 'Actualizando…';
    try {
      const j = await (await fetch('/api/sincronizar', { method: 'POST' })).json();
      if (j.estado === 'actualizado' || j.estado === 'al-dia') {
        await cargarDatos(); render();
        $('[data-franja]').hidden = true;
        avisar(j.estado === 'actualizado' ? 'Listo: ya tienes la versión más reciente.' : 'Ya tenías la versión más reciente.', 'ok');
      } else if (j.estado === 'conflicto') mostrarConflicto(j.detalle);
      else avisar(j.estado === 'sin-conexion' ? 'Sin conexión con GitHub. Intenta más tarde.' : 'No se pudo actualizar: ' + (j.detalle || j.estado), 'error');
    } catch (e) { avisar('No se pudo actualizar: ' + e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Actualizar ahora'; }
  }

  async function avisosDeArranque() {
    try {
      const { ultima } = await (await fetch('/api/sincronizar')).json();
      if (ultima?.estado === 'actualizado') avisar(`Se descargaron ${ultima.nuevos || ''} cambio(s) publicados desde otra computadora.`.replace('  ', ' '), 'ok', 6000);
      else if (ultima?.estado === 'conflicto') mostrarConflicto(ultima.detalle);
      else if (ultima?.estado === 'sin-conexion') avisar('Sin conexión con GitHub: estás trabajando con la versión guardada en esta computadora.', '', 6000);
    } catch {}
  }

  // ================= enrutador =================
  function render() {
    const [seccion, id] = decodeURIComponent(location.hash.slice(1) || 'productos').split('/');
    const grupo = { producto: 'productos', articulo: 'articulos' }[seccion] || seccion;
    $$('[data-seccion]').forEach(a => a.classList.toggle('activa', a.dataset.seccion === grupo));
    const vistas = {
      productos: vistaProductos, producto: () => vistaProducto(id), colecciones: vistaColecciones,
      articulos: vistaArticulos, articulo: () => vistaArticulo(id), portada: vistaPortada, config: vistaConfig, respaldos: vistaRespaldos
    };
    // Reemplaza el nodo para soltar escuchas de la vista anterior
    const nueva = vista.cloneNode(false); vista.replaceWith(nueva); vista = nueva;
    (vistas[seccion] || vistaProductos)();
    actualizarEstado();
  }

  async function cargarDatos() {
    const [d, a] = await Promise.all([fetch('/api/datos').then(r => r.json()), fetch('/api/archivos').then(r => r.json())]);
    datos = d; archivos = a; original = limpioJSON(d); errores = [];
  }

  // ================= arranque =================
  $('[data-guardar]').onclick = guardar;
  $('[data-publicar]').onclick = publicar;
  $('[data-descartar]').onclick = async () => {
    if (!(await confirmar('Descartar cambios', 'Se perderán todos los cambios desde la última vez que guardaste.', 'Descartar', true))) return;
    datos = JSON.parse(original); errores = [];
    if (/^#(producto|articulo)\//.test(location.hash)) {
      const [s, id] = location.hash.slice(1).split('/');
      const lista = s === 'producto' ? datos.productos : datos.articulos;
      if (!lista.some(x => x.handle === decodeURIComponent(id))) { location.hash = s === 'producto' ? '#productos' : '#articulos'; return; }
    }
    render();
  };
  window.addEventListener('hashchange', render);
  window.addEventListener('beforeunload', e => { if (haySinGuardar()) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardar(); } });

  $('[data-actualizar]').onclick = actualizarDesdeGitHub;
  setInterval(revisarGitHub, 5 * 60 * 1000);
  let ultimaRevision = Date.now();
  window.addEventListener('focus', () => { if (Date.now() - ultimaRevision > 60000) { ultimaRevision = Date.now(); revisarGitHub(); } });
  cargarDatos().then(() => { render(); avisosDeArranque(); }).catch(() => {
    document.querySelector('#vista').innerHTML = '<div class="errores">No se pudo conectar con el admin. ¿Está abierta la ventana de <code>node admin.mjs</code>?</div>';
  });
})();
