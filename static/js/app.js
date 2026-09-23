// Bajareque Outdoor — interacción del sitio (menú, pedido por WhatsApp, galería, catálogo).
(() => {
  const T = window.TIENDA || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const dinero = n => `${T.moneda || '$'}${Number(n).toFixed(2)}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLAVE = 'bajareque-pedido';

  const abrirWhatsApp = texto => {
    window.open(`https://wa.me/${T.whatsapp}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  };

  // ---------- menú móvil ----------
  const nav = $('#nav-principal');
  const btnMenu = $('[data-abrir-menu]');
  const cerrarMenu = () => { nav?.classList.remove('abierta'); document.body.classList.remove('menu-abierto'); btnMenu?.setAttribute('aria-expanded', 'false'); };
  btnMenu?.addEventListener('click', () => { nav.classList.add('abierta'); document.body.classList.add('menu-abierto'); btnMenu.setAttribute('aria-expanded', 'true'); });
  $('[data-cerrar-menu]')?.addEventListener('click', cerrarMenu);

  // ---------- pedido (carrito) ----------
  const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch { return []; } };
  const guardar = items => { try { localStorage.setItem(CLAVE, JSON.stringify(items)); } catch {} };
  let pedido = leer();

  const cajon = $('[data-cajon]');
  const lista = $('[data-lista-pedido]');
  const pieCajon = $('[data-pie-pedido]');

  function pintar() {
    const cuenta = pedido.reduce((a, i) => a + i.cantidad, 0);
    $$('[data-cuenta]').forEach(el => { el.textContent = cuenta; el.hidden = cuenta === 0; });
    if (!lista) return;
    if (!pedido.length) {
      lista.innerHTML = `<div class="cajon__vacio"><p>Tu pedido está vacío.</p><a class="btn" href="/collections/all/">Ver catálogo</a></div>`;
      pieCajon.hidden = true;
      return;
    }
    pieCajon.hidden = false;
    lista.innerHTML = pedido.map((i, n) => `
      <div class="item">
        <a class="item__img" href="/products/${esc(i.handle)}/">${i.imagen ? `<img src="${esc(i.imagen)}" alt="">` : ''}</a>
        <div>
          <p class="item__titulo">${esc(i.titulo)}</p>
          ${i.variante ? `<p class="item__var">${esc(i.variante)}</p>` : ''}
          <div class="item__control">
            <button type="button" data-restar="${n}" aria-label="Menos">−</button>
            <span>${i.cantidad}</span>
            <button type="button" data-sumar="${n}" aria-label="Más">+</button>
          </div>
        </div>
        <div class="item__precio">${dinero(i.precio * i.cantidad)}<button type="button" class="item__quitar" data-quitar="${n}">Quitar</button></div>
      </div>`).join('');
    $('[data-total]').textContent = dinero(pedido.reduce((a, i) => a + i.precio * i.cantidad, 0));
  }

  function abrirPedido() { if (!cajon) return; cajon.hidden = false; document.body.classList.add('pedido-abierto'); $('[data-cerrar-pedido].icon-btn', cajon)?.focus(); }
  function cerrarPedido() { if (!cajon) return; cajon.hidden = true; document.body.classList.remove('pedido-abierto'); }

  function agregar(item) {
    const existente = pedido.find(i => i.handle === item.handle && i.variante === item.variante);
    if (existente) existente.cantidad += item.cantidad; else pedido.push(item);
    guardar(pedido); pintar();
  }

  function mensajePedido(items) {
    const lineas = items.map(i => `• ${i.cantidad} x ${i.titulo}${i.variante ? ` (${i.variante})` : ''} — ${dinero(i.precio * i.cantidad)}`);
    const total = items.reduce((a, i) => a + i.precio * i.cantidad, 0);
    return `Hola ${T.nombre}, quiero hacer este pedido:\n\n${lineas.join('\n')}\n\nTotal: ${dinero(total)}\n\nNombre:\nEntrega (retiro / envío y dirección):`;
  }

  $$('[data-abrir-pedido]').forEach(b => b.addEventListener('click', abrirPedido));
  $$('[data-cerrar-pedido]').forEach(b => b.addEventListener('click', cerrarPedido));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { cerrarPedido(); cerrarMenu(); } });

  lista?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const n = +(b.dataset.sumar ?? b.dataset.restar ?? b.dataset.quitar);
    if (b.dataset.sumar !== undefined) pedido[n].cantidad++;
    else if (b.dataset.restar !== undefined) { pedido[n].cantidad--; if (pedido[n].cantidad < 1) pedido.splice(n, 1); }
    else if (b.dataset.quitar !== undefined) pedido.splice(n, 1);
    guardar(pedido); pintar();
  });

  $('[data-enviar-pedido]')?.addEventListener('click', () => { if (pedido.length) abrirWhatsApp(mensajePedido(pedido)); });

  window.addEventListener('storage', e => { if (e.key === CLAVE) { pedido = leer(); pintar(); } });

  function avisar(texto) {
    $('.aviso')?.remove();
    const d = document.createElement('div');
    d.className = 'aviso'; d.setAttribute('role', 'status'); d.textContent = texto;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2400);
  }

  // ---------- página de producto ----------
  const prod = $('[data-producto]');
  if (prod) {
    const imagenes = JSON.parse($('[data-imagenes]')?.textContent || '[]');
    const principal = $('[data-principal]');
    const minis = $$('[data-miniatura]');
    const mostrar = i => {
      if (i < 0 || !imagenes[i]) return;
      principal.src = imagenes[i];
      minis.forEach(m => m.classList.toggle('miniatura--activa', +m.dataset.miniatura === i));
    };
    minis.forEach(m => m.addEventListener('click', () => mostrar(+m.dataset.miniatura)));

    const precioVisible = $('[data-precio-visible]');
    const radios = $$('input[name="variante"]', prod);
    radios.forEach(r => r.addEventListener('change', () => {
      precioVisible.textContent = dinero(r.dataset.precio);
      mostrar(+r.dataset.imagen);
    }));

    const cant = $('[data-cantidad]', prod);
    $('[data-menos]', prod).addEventListener('click', () => { cant.value = Math.max(1, (+cant.value || 1) - 1); });
    $('[data-mas]', prod).addEventListener('click', () => { cant.value = (+cant.value || 1) + 1; });

    const item = () => {
      const r = radios.find(x => x.checked);
      return {
        handle: prod.dataset.producto,
        titulo: prod.dataset.titulo,
        variante: r ? r.value : '',
        precio: +(r ? r.dataset.precio : prod.dataset.precio),
        cantidad: Math.max(1, parseInt(cant.value, 10) || 1),
        imagen: imagenes[r && +r.dataset.imagen >= 0 ? +r.dataset.imagen : 0] || ''
      };
    };
    $('[data-agregar]', prod)?.addEventListener('click', () => { agregar(item()); avisar('Agregado a tu pedido'); abrirPedido(); });
    $('[data-pedir-ya]', prod)?.addEventListener('click', () => abrirWhatsApp(mensajePedido([item()])));
  }

  // ---------- catálogo: ordenar y buscar ----------
  const rejilla = $('.pagina-coleccion .rejilla');
  if (rejilla) {
    const tarjetas = $$('.tarjeta', rejilla);
    const original = [...tarjetas];
    const conteo = $('[data-conteo]');
    const vacio = $('[data-vacio]');
    const buscar = $('[data-buscar]');
    const normal = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const aplicar = () => {
      const q = buscar ? normal(buscar.value.trim()) : '';
      let visibles = 0;
      tarjetas.forEach(t => { const ok = !q || normal(t.dataset.nombre).includes(q); t.hidden = !ok; if (ok) visibles++; });
      conteo.textContent = `${visibles} producto${visibles === 1 ? '' : 's'}`;
      vacio.hidden = visibles > 0;
    };
    $('[data-ordenar]')?.addEventListener('change', e => {
      const v = e.target.value;
      const orden = v === 'precio-asc' ? (a, b) => a.dataset.precio - b.dataset.precio
        : v === 'precio-desc' ? (a, b) => b.dataset.precio - a.dataset.precio
        : v === 'nombre' ? (a, b) => a.dataset.nombre.localeCompare(b.dataset.nombre, 'es') : null;
      (orden ? [...tarjetas].sort(orden) : original).forEach(t => rejilla.appendChild(t));
    });
    if (buscar) {
      const params = new URLSearchParams(location.search);
      if (params.has('q')) buscar.value = params.get('q');
      if (params.has('buscar') || params.has('q')) buscar.focus();
      buscar.addEventListener('input', aplicar);
      aplicar();
    }
  }

  // ---------- contacto ----------
  const form = $('[data-contacto]');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const error = $('[data-error]', form);
    if (!d.mensaje.trim()) { error.hidden = false; form.mensaje.focus(); return; }
    error.hidden = true;
    const partes = [`Hola ${T.nombre},`, '', d.mensaje.trim(), ''];
    if (d.nombre) partes.push(`Nombre: ${d.nombre}`);
    if (d.correo) partes.push(`Correo: ${d.correo}`);
    if (d.telefono) partes.push(`Teléfono: ${d.telefono}`);
    abrirWhatsApp(partes.join('\n'));
  });

  pintar();
})();
