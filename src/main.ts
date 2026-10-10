import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import maplibregl from 'maplibre-gl';
import {buscar, ciudadCercana} from './buscador';
import {desfaseZoom, ordenar, vistaEn} from './camara';
import {precargarModelos} from './modelos3d';
import {aplicarElementos, borrador, olvidarEstado, precargarGeometrias, precargarImagenes, registrarImagenes} from './capas';
import {ATRIBUCION, BANDOS, construirEstilo, NOMBRES_ESTILO, paletaDe, PALETAS} from './estilos';
import {capturarPNG, diagnosticar, exportarVideo} from './exportar';
import {aplicarOpticaPrevia, cargarFuentes, pintarOverlay} from './overlay';
import {iniciarChat} from './chat';
import {encargarVideo, estadoVideo, faseSimple, seguirVideo} from './encargos';
import {vigilarVersion} from './version';
import {iniciarPuente, subirArchivo} from './puente';
import {
  cambiarFormato, type Elemento, type EstiloId, OPCIONES_DE_ESTILO, type Keyframe, type LonLat, normalizar, type OpcionesEstilo, type PresetEstilo, type Proyecto,
  proyectoDemo, proyectoNuevo, type TipoElemento, uid,
} from './proyecto';

// ── Estado ──────────────────────────────────────────────────────────────────────────
const CLAVE = 'electric-eye:proyecto';
let p: Proyecto = cargarGuardado() ?? proyectoDemo();
let t = 0;
let reproduciendo = false;
let sel: {tipo: 'kf' | 'el'; id: string} | null = null;
type Herramienta = 'navegar' | 'pais' | 'territorio' | 'ficha' | 'columna' | 'ruta' | 'pin' | 'texto' | 'zona' | 'titulo';
let herramienta: Herramienta = 'navegar';
let puntosRuta: LonLat[] = [];
const historia: string[] = [];
const futuro: string[] = [];

function cargarGuardado(): Proyecto | null {
  try {
    const s = localStorage.getItem(CLAVE) ?? localStorage.getItem('mapas-multimedia:proyecto');
    return s ? normalizar(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {}, ...hijos: (Node | string)[]) => {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const h of hijos) n.append(h);
  return n;
};

// ── Historia (deshacer / rehacer) y guardado automático ────────────────────────────
const instantanea = () => JSON.stringify(p);
let ultimo = instantanea();
const confirmar = () => {
  const s = instantanea();
  if (s === ultimo) return;
  historia.push(ultimo);
  if (historia.length > 200) historia.shift();
  futuro.length = 0;
  ultimo = s;
  try {
    localStorage.setItem(CLAVE, s);
  } catch {
    /* almacenamiento lleno o bloqueado: el proyecto sigue en memoria */
  }
};
const deshacer = () => {
  const prev = historia.pop();
  if (!prev) return;
  futuro.push(ultimo);
  cargarProyecto(normalizar(JSON.parse(prev)), false);
  ultimo = prev;
};
const rehacer = () => {
  const sig = futuro.pop();
  if (!sig) return;
  historia.push(ultimo);
  cargarProyecto(normalizar(JSON.parse(sig)), false);
  ultimo = sig;
};

// ── Mapa ──────────────────────────────────────────────────────────────────────────
const marco = $('marco');
const overlay = $<HTMLCanvasElement>('overlay');
const map = new maplibregl.Map({
  container: 'mapa',
  style: {version: 8, sources: {}, layers: [{id: 'f', type: 'background', paint: {'background-color': '#111'}}]},
  center: [20, 25],
  zoom: 1.6,
  attributionControl: {compact: true},
  canvasContextAttributes: {antialias: true, powerPreference: 'high-performance'},
  maxPitch: 80,
});
registrarImagenes(map);
map.addControl(new maplibregl.NavigationControl({visualizePitch: true}), 'top-right');
map.addControl(new maplibregl.ScaleControl({unit: 'metric'}), 'bottom-right');

let estiloCargando = Promise.resolve();
const recargarEstilo = () => {
  estiloCargando = (async () => {
    try {
      const estilo = await construirEstilo(p.estilo, p.opciones, p.preset);
      olvidarEstado(map);
      map.setStyle(estilo, {diff: false});
      await new Promise<void>((ok) => map.once('style.load', () => ok()));
      aplicar(false);
    } catch (e) {
      avisar((e as Error).message);
    }
  })();
  $('atribucion').textContent = atribucionDe(p.estilo, p.opciones);
};

const atribucionDe = (id: EstiloId, o: OpcionesEstilo) => {
  const a = [ATRIBUCION.ne];
  if (o.relieve || o.terreno3d || id === 'realista') a.push(ATRIBUCION.terreno);
  if (id === 'satelite') a.push(ATRIBUCION.satelite);
  if (id === 'calles') a.push(ATRIBUCION.calles);
  return 'Datos: ' + a.join(' · ');
};

map.on('styledata', () => map.getSource('mm-rutas') && aplicar(false));
map.on('sourcedata', (e) => {
  // Cuando llegan los países, se aplican los resaltados (feature-state necesita la fuente cargada).
  if (e.sourceId === 'ne-paises' && e.isSourceLoaded) aplicar(false);
});
map.on('move', () => actualizarHud());
map.on('error', (e) => console.warn('[mapa]', e.error?.message ?? e));

// ── Encuadre: el marco mantiene la proporción del formato de salida ────────────────
const ajustarMarco = () => {
  const esc = $('escenario').getBoundingClientRect();
  const margen = 28;
  const maxW = esc.width - margen * 2;
  const maxH = esc.height - margen * 2;
  const r = p.ancho / p.alto;
  let w = maxW;
  let h = w / r;
  if (h > maxH) {
    h = maxH;
    w = h * r;
  }
  w = Math.floor(w);
  h = Math.floor(h);
  marco.style.width = `${w}px`;
  marco.style.height = `${h}px`;
  const dpr = window.devicePixelRatio || 1;
  overlay.width = Math.round(w * dpr);
  overlay.height = Math.round(h * dpr);
  map.resize();
  pintarPrevia();
};
new ResizeObserver(ajustarMarco).observe($('escenario'));

const anchoMarco = () => marco.getBoundingClientRect().width;
const desfase = () => desfaseZoom(marco.getBoundingClientRect().height);

// ── Aplicar el proyecto al tiempo t ────────────────────────────────────────────────
function aplicar(moverCamara = true) {
  if (moverCamara && ($<HTMLInputElement>('seguir').checked || reproduciendo)) {
    const v = vistaEn(p.camara, t, anchoMarco());
    if (v) map.jumpTo({center: v.centro, zoom: v.zoom + desfase(), bearing: v.rumbo, pitch: v.inclinacion});
  }
  if (map.getSource('mm-rutas')) aplicarElementos(map, p, t, {seleccion: sel?.tipo === 'el' ? sel.id : null});
  pintarPrevia();
  actualizarCabezal();
}

function pintarPrevia() {
  aplicarOpticaPrevia(marco, p.opciones);
  const ctx = overlay.getContext('2d')!;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  pintarOverlay(ctx, overlay.width, overlay.height, p, t);
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, '0')}`;
};

function actualizarHud() {
  const c = map.getCenter();
  $('hud').textContent = `${c.lng.toFixed(3)}, ${c.lat.toFixed(3)} · zoom ${(map.getZoom() - desfase()).toFixed(2)} · rumbo ${map.getBearing().toFixed(0)}° · incl. ${map.getPitch().toFixed(0)}°`;
}

// ── Reproducción ──────────────────────────────────────────────────────────────────
let ultimoFrame = 0;
const bucle = (ahora: number) => {
  if (!reproduciendo) return;
  const dt = (ahora - ultimoFrame) / 1000;
  ultimoFrame = ahora;
  t += dt;
  if (t >= p.duracion) t = 0;
  aplicar(true);
  requestAnimationFrame(bucle);
};
const alternarPlay = () => {
  reproduciendo = !reproduciendo;
  $('b-play').textContent = reproduciendo ? '❚❚' : '▶';
  if (reproduciendo) {
    ultimoFrame = performance.now();
    requestAnimationFrame(bucle);
  }
};
const irA = (nuevo: number, camara = true) => {
  t = Math.max(0, Math.min(p.duracion, nuevo));
  aplicar(camara);
};

// ── Línea de tiempo ───────────────────────────────────────────────────────────────
const pistas = $('pistas');
const filas = $('filas');
const anchoPistas = () => pistas.clientWidth;
const xDe = (s: number) => (s / p.duracion) * anchoPistas();
const tDe = (x: number) => Math.max(0, Math.min(p.duracion, (x / anchoPistas()) * p.duracion));
const ajustarFps = (s: number) => Math.round(s * p.fps) / p.fps;

const COLOR_TIPO: Record<TipoElemento, string> = {
  pais: '#8A5CF6', ruta: '#E0402B', pin: '#F59E0B', texto: '#10B981', zona: '#3B82F6', titulo: '#EC4899', territorio: '#5C844E', columna: '#7A5C3A',
  recorte: '#64748B', grafico: '#B45309', foco: '#1F2937', trafico: '#0E7490',
};
const NOMBRE_TIPO: Record<TipoElemento, string> = {
  pais: 'País', ruta: 'Ruta', pin: 'Pin', texto: 'Texto', zona: 'Zona', titulo: 'Título', territorio: 'Territorio', columna: 'Columna 3D',
  recorte: 'Recorte', grafico: 'Gráfico', foco: 'Foco', trafico: 'Tráfico',
};

function actualizarCabezal() {
  $('cabezal').style.left = `${xDe(t)}px`;
  $('tiempo').textContent = fmt(t);
}

function renderRegla() {
  const regla = $('regla');
  regla.innerHTML = '';
  const paso = p.duracion > 60 ? 10 : p.duracion > 20 ? 5 : p.duracion > 8 ? 1 : 0.5;
  for (let s = 0; s <= p.duracion + 1e-6; s += paso) {
    regla.append(el('div', {className: 'marca-t', textContent: fmt(s).replace(/\.00$/, '')}));
    (regla.lastChild as HTMLElement).style.left = `${xDe(s)}px`;
  }
}

function arrastrar(e: PointerEvent, mover: (dx: number) => void, soltar: () => void) {
  e.preventDefault();
  e.stopPropagation();
  const x0 = e.clientX;
  const mv = (ev: PointerEvent) => mover(ev.clientX - x0);
  const up = () => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    soltar();
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
}

function renderLinea() {
  renderRegla();
  filas.innerHTML = '';
  // Pista de cámara
  const fCam = el('div', {className: 'pista'});
  fCam.append(el('div', {className: 'etq', textContent: '🎥 Cámara'}));
  for (const k of ordenar(p.camara)) {
    const r = el('div', {className: 'rombo' + (sel?.tipo === 'kf' && sel.id === k.id ? ' sel' : ''), title: `Keyframe ${fmt(k.t)}`});
    r.style.left = `${xDe(k.t)}px`;
    r.addEventListener('pointerdown', (e) => {
      seleccionar({tipo: 'kf', id: k.id});
      const t0 = k.t;
      arrastrar(e, (dx) => {
        k.t = ajustarFps(Math.max(0, Math.min(p.duracion, t0 + (dx / anchoPistas()) * p.duracion)));
        r.style.left = `${xDe(k.t)}px`;
        irA(k.t);
      }, () => {
        confirmar();
        renderInspector();
      });
    });
    fCam.append(r);
  }
  filas.append(fCam);

  // Una pista por elemento
  for (const e of p.elementos) {
    const f = el('div', {className: 'pista' + (sel?.tipo === 'el' && sel.id === e.id ? ' sel' : '')});
    const etq = el('div', {className: 'etq', textContent: `${e.oculto ? '◌ ' : ''}${e.nombre}`});
    etq.addEventListener('click', () => seleccionar({tipo: 'el', id: e.id}));
    f.append(etq);
    const fin = e.hasta ?? p.duracion;
    const b = el('div', {className: 'bloque', textContent: e.nombre});
    b.style.left = `${xDe(e.desde)}px`;
    b.style.width = `${Math.max(6, xDe(fin) - xDe(e.desde))}px`;
    b.style.background = colorElemento(e);
    const tir = el('div', {className: 'tirador'});
    b.append(tir);
    b.addEventListener('pointerdown', (ev) => {
      seleccionar({tipo: 'el', id: e.id});
      const d0 = e.desde;
      const h0 = e.hasta;
      arrastrar(ev, (dx) => {
        const ds = (dx / anchoPistas()) * p.duracion;
        e.desde = ajustarFps(Math.max(0, Math.min(p.duracion - 0.1, d0 + ds)));
        if (h0 != null) e.hasta = ajustarFps(Math.max(e.desde + 0.1, h0 + (e.desde - d0)));
        b.style.left = `${xDe(e.desde)}px`;
        b.style.width = `${Math.max(6, xDe(e.hasta ?? p.duracion) - xDe(e.desde))}px`;
        aplicar(false);
      }, () => {
        confirmar();
        renderInspector();
      });
    });
    tir.addEventListener('pointerdown', (ev) => {
      seleccionar({tipo: 'el', id: e.id});
      const h0 = e.hasta ?? p.duracion;
      arrastrar(ev, (dx) => {
        const h = ajustarFps(Math.max(e.desde + 0.1, Math.min(p.duracion, h0 + (dx / anchoPistas()) * p.duracion)));
        e.hasta = h >= p.duracion - 1e-6 ? null : h;
        b.style.width = `${Math.max(6, xDe(e.hasta ?? p.duracion) - xDe(e.desde))}px`;
        aplicar(false);
      }, () => {
        confirmar();
        renderInspector();
      });
    });
    f.append(b);
    filas.append(f);
  }
  actualizarCabezal();
}

const colorElemento = (e: Elemento) => ('color' in e ? e.color : COLOR_TIPO[e.tipo]);

$('regla').addEventListener('pointerdown', (e) => {
  const rect = $('regla').getBoundingClientRect();
  irA(ajustarFps(tDe(e.clientX - rect.left)));
  arrastrar(e, (dx) => irA(ajustarFps(tDe(e.clientX - rect.left + dx))), () => undefined);
});
new ResizeObserver(() => renderLinea()).observe(pistas);

// ── Selección, lista e inspector ──────────────────────────────────────────────────
function seleccionar(s: typeof sel) {
  sel = s;
  if (s?.tipo === 'kf') {
    const k = p.camara.find((x) => x.id === s.id);
    if (k) irA(k.t);
  }
  renderLista();
  renderLinea();
  renderInspector();
  aplicar(false);
}

function renderLista() {
  const ul = $('lista');
  ul.innerHTML = '';
  if (p.elementos.length === 0) {
    ul.append(el('li', {className: 'vacio', textContent: 'Aún no hay elementos. Elige una herramienta y haz clic en el mapa.'}));
  }
  for (const e of [...p.elementos].reverse()) {
    const li = el('li', {className: sel?.tipo === 'el' && sel.id === e.id ? 'sel' : ''});
    const chip = el('span', {className: 'chip'});
    chip.style.background = colorElemento(e);
    li.append(chip, el('span', {textContent: e.nombre}), el('span', {className: 'tipo', textContent: NOMBRE_TIPO[e.tipo]}));
    li.addEventListener('click', () => {
      seleccionar({tipo: 'el', id: e.id});
      if (e.desde > t || (e.hasta != null && e.hasta < t)) irA(e.desde + Math.min(1, e.fundido + 0.2), false);
    });
    ul.append(li);
  }
}

// Constructores de campos del inspector
const cambio = (fn: () => void, recargar = false) => {
  fn();
  confirmar();
  if (recargar) {
    renderLista();
    renderLinea();
  }
  aplicar(false);
};
const campo = (etiqueta: string, control: HTMLElement) => {
  const l = el('label', {className: 'campo'});
  l.append(etiqueta, control);
  return l;
};
const cTexto = (etq: string, v: string, set: (s: string) => void, recargar = false) => {
  const i = el('input', {value: v});
  i.addEventListener('input', () => {
    set(i.value);
    aplicar(false);
  });
  i.addEventListener('change', () => cambio(() => set(i.value), recargar));
  return campo(etq, i);
};
const cNum = (etq: string, v: number, set: (n: number) => void, o: {min?: number; max?: number; paso?: number} = {}) => {
  const i = el('input', {type: 'number', value: String(+v.toFixed(3)), step: String(o.paso ?? 0.1)});
  if (o.min != null) i.min = String(o.min);
  if (o.max != null) i.max = String(o.max);
  i.addEventListener('change', () => cambio(() => set(Number(i.value)), true));
  return campo(etq, i);
};
const cRango = (etq: string, v: number, set: (n: number) => void, min: number, max: number, paso: number) => {
  const i = el('input', {type: 'range', min: String(min), max: String(max), step: String(paso), value: String(v)});
  i.addEventListener('input', () => {
    set(Number(i.value));
    aplicar(false);
  });
  i.addEventListener('change', () => cambio(() => set(Number(i.value))));
  return campo(etq, i);
};
const MUESTRAS = ['#CB8C5B', '#5C844E', '#C74227', '#C44A33', '#B3261E', '#E0402B', '#C9A84C', '#F2C230', '#50B5A2', '#3B82F6', '#73247D', '#1A1A17', '#FFFFFF'];
const cColor = (etq: string, v: string, set: (s: string) => void) => {
  const cont = el('div', {className: 'colores'});
  const i = el('input', {type: 'color', value: v});
  i.addEventListener('input', () => {
    set(i.value);
    aplicar(false);
  });
  i.addEventListener('change', () => cambio(() => set(i.value), true));
  cont.append(i);
  for (const m of MUESTRAS) {
    const b = el('button', {className: 'swatch', title: m});
    b.style.background = m;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      i.value = m;
      cambio(() => set(m), true);
    });
    cont.append(b);
  }
  return campo(etq, cont);
};
const cSelect = <T extends string>(etq: string, v: T, opciones: [T, string][], set: (s: T) => void) => {
  const s = el('select');
  for (const [val, txt] of opciones) s.append(el('option', {value: val, textContent: txt, selected: val === v}));
  s.addEventListener('change', () => cambio(() => set(s.value as T)));
  return campo(etq, s);
};
const cCheck = (etq: string, v: boolean, set: (b: boolean) => void) => {
  const l = el('label', {className: 'check'});
  const i = el('input', {type: 'checkbox', checked: v});
  i.addEventListener('change', () => cambio(() => set(i.checked), true));
  l.append(i, etq);
  return l;
};
const fila = (...hijos: HTMLElement[]) => {
  const d = el('div', {className: hijos.length === 3 ? 'fila3' : 'fila'});
  d.append(...hijos);
  return d;
};
const boton = (txt: string, fn: () => void, clase = '') => {
  const b = el('button', {textContent: txt, className: clase});
  b.addEventListener('click', fn);
  return b;
};

const ICONOS_FICHA = ['🪖', '✈️', '🚢', '🚀', '💥', '⚓', '☢️', '⭐', '🛢️', '🏭', '⚔️', '🏛️'];

function controlesFicha(e: Extract<Elemento, {tipo: 'pin'}>): HTMLElement[] {
  const iconos = el('div', {className: 'colores'});
  for (const ic of ICONOS_FICHA) {
    const b = el('button', {className: 'emoji' + (e.icono === ic && !e.imagen ? ' activo' : ''), textContent: ic});
    b.addEventListener('click', () => {
      cambio(() => {
        e.icono = ic;
        e.imagen = undefined;
      });
      renderInspector();
    });
    iconos.append(b);
  }
  const archivo = el('input', {type: 'file', accept: 'image/*'});
  archivo.addEventListener('change', async () => {
    const f = archivo.files?.[0];
    if (!f) return;
    const url = await reducirImagen(f, 192);
    cambio(() => (e.imagen = url));
    await asegurarRecursos();
    renderInspector();
  });
  const quitar = boton('Quitar imagen', () => {
    cambio(() => (e.imagen = undefined));
    renderInspector();
  });
  return [
    campo('Icono (silueta)', iconos),
    cTexto('…o texto corto', e.icono ?? '', (s) => (e.icono = s.slice(0, 4))),
    campo('…o imagen (retrato, logo)', archivo),
    ...(e.imagen ? [quitar] : []),
    fila(
      cSelect('Fondo', e.fondo ?? 'color', [['color', 'Del color'], ['blanco', 'Blanco']], (v) => (e.fondo = v)),
      cNum('Tamaño', e.tamano ?? 1, (n) => (e.tamano = Math.max(0.3, Math.min(3, n))), {min: 0.3, max: 3, paso: 0.1}),
    ),
  ];
}

function botonesDireccion(e: Extract<Elemento, {tipo: 'territorio'}>) {
  const d = el('div', {className: 'botones'});
  for (const [txt, g] of [['↑ Norte', 0], ['→ Este', 90], ['↓ Sur', 180], ['← Oeste', 270]] as const) {
    d.append(boton(txt, () => {
      cambio(() => (e.direccion = g));
      renderInspector();
    }));
  }
  return d;
}

/** Reduce una imagen subida a un cuadrado pequeño (el proyecto se guarda como JSON). */
const reducirImagen = (f: File, lado: number) => new Promise<string>((ok, mal) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    const k = Math.min(1, lado / Math.max(img.width, img.height));
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    ok(c.toDataURL('image/png'));
    URL.revokeObjectURL(img.src);
  };
  img.onerror = mal;
  img.src = URL.createObjectURL(f);
});

/** Imágenes y geometrías que el mapa necesita listas antes de pintar. */
const asegurarRecursos = async () => {
  await Promise.all([precargarImagenes(p), precargarGeometrias(), precargarModelos()]);
  aplicar(false);
};

function renderInspector() {
  const ins = $('inspector');
  ins.innerHTML = '';
  if (!sel) {
    $('insp-titulo').textContent = 'Inspector';
    ins.append(el('p', {className: 'ayuda', innerHTML:
      '<b>Cómo se trabaja</b><br>1. Busca un lugar o navega el mapa (arrastrar = mover, clic derecho + arrastrar = girar e inclinar).<br>' +
      '2. Pulsa <b>K</b> para guardar la vista como keyframe. Mueve el cabezal y repite: la cámara viaja entre keyframes.<br>' +
      '3. Añade países, rutas, pines, zonas, textos y títulos con las herramientas. Cada uno tiene su barra en la línea de tiempo.<br>' +
      '4. <b>Exportar vídeo</b> renderiza fotograma a fotograma, sin saltos, a la resolución elegida.'}));
    return;
  }
  if (sel.tipo === 'kf') {
    const k = p.camara.find((x) => x.id === sel!.id);
    if (!k) return;
    $('insp-titulo').textContent = 'Keyframe de cámara';
    ins.append(
      cNum('Tiempo (s)', k.t, (n) => (k.t = Math.max(0, Math.min(p.duracion, n))), {paso: 1 / p.fps}),
      fila(cNum('Zoom', k.zoom, (n) => (k.zoom = n), {paso: 0.1}), cNum('Inclinación', k.inclinacion, (n) => (k.inclinacion = n), {min: 0, max: 80, paso: 1})),
      fila(cNum('Rumbo', k.rumbo, (n) => (k.rumbo = n), {paso: 1}), cSelect('Curva hacia aquí', k.curva, [['suave', 'Suave'], ['lineal', 'Lineal'], ['entrada', 'Acelera'], ['salida', 'Frena']], (v) => (k.curva = v))),
      cCheck('Vuelo: alejar a mitad de trayecto', k.vuelo, (b) => (k.vuelo = b)),
      el('p', {className: 'ayuda', textContent: `Centro: ${k.centro[0].toFixed(4)}, ${k.centro[1].toFixed(4)}`}),
    );
    const bs = el('div', {className: 'botones'});
    bs.append(
      boton('Usar vista actual', () => cambio(() => Object.assign(k, vistaActual()), true), 'primario'),
      boton('Ir a la vista', () => irA(k.t)),
      boton('Borrar', () => cambio(() => {
        p.camara = p.camara.filter((x) => x.id !== k.id);
        sel = null;
      }, true), 'peligro'),
    );
    ins.append(bs);
    return;
  }
  const e = p.elementos.find((x) => x.id === sel!.id);
  if (!e) return;
  $('insp-titulo').textContent = NOMBRE_TIPO[e.tipo];
  ins.append(cTexto('Nombre', e.nombre, (s) => (e.nombre = s), true));

  switch (e.tipo) {
    case 'pais':
      ins.append(
        cColor('Color', e.color, (s) => (e.color = s)),
        cRango('Opacidad', e.opacidad, (n) => (e.opacidad = n), 0, 1, 0.05),
        fila(cCheck('Borde', e.borde, (b) => (e.borde = b)), cCheck('Latido', e.pulso, (b) => (e.pulso = b))),
        el('p', {className: 'ayuda', textContent: `Código ISO: ${e.iso}`}),
      );
      break;
    case 'ruta':
      ins.append(
        cColor('Color', e.color, (s) => (e.color = s)),
        fila(cNum('Grosor', e.grosor, (n) => (e.grosor = n), {min: 1, max: 30, paso: 0.5}), cNum('Tiempo de trazo (s)', e.trazo, (n) => (e.trazo = Math.max(0, n)), {min: 0, paso: 0.1})),
        cSelect('Forma', e.forma, [['recta', 'Recta (sigue los puntos)'], ['arco', 'Arco (curva de flecha)'], ['geodesica', 'Geodésica (gran círculo)']], (v) => (e.forma = v)),
        fila(cCheck('Discontinua', e.discontinua, (b) => (e.discontinua = b)), cCheck('Flecha', e.flecha, (b) => (e.flecha = b))),
        el('p', {className: 'ayuda', textContent: `${e.puntos.length} puntos.`}),
      );
      break;
    case 'pin':
      ins.append(
        cTexto('Etiqueta', e.texto, (s) => (e.texto = s)),
        cColor('Color', e.color, (s) => (e.color = s)),
        fila(
          cSelect('Marcador', e.estilo, [['ficha', 'Ficha de pie'], ['punto', 'Punto'], ['pulso', 'Pulso'], ['capital', 'Capital']], (v) => {
            e.estilo = v;
            queueMicrotask(renderInspector);
          }),
          cSelect('Etiqueta', e.etiqueta, [['ninguna', 'Ninguna'], ['papel', 'Papel'], ['halo', 'Halo']], (v) => (e.etiqueta = v)),
        ),
      );
      if (e.estilo === 'ficha') ins.append(...controlesFicha(e));
      break;
    case 'territorio':
      ins.append(
        cColor('Color', e.color, (s) => (e.color = s)),
        cRango('Opacidad', e.opacidad, (n) => (e.opacidad = n), 0, 1, 0.05),
        cRango(`Dirección del avance (${Math.round(e.direccion)}°)`, e.direccion, (n) => (e.direccion = n), 0, 359, 1),
        botonesDireccion(e),
        fila(
          cNum('Tarda (s)', e.avance, (n) => (e.avance = Math.max(0, n)), {min: 0, paso: 0.1}),
          cNum('Cubre (%)', Math.round(e.hasta_fraccion * 100), (n) => (e.hasta_fraccion = Math.min(1, Math.max(0, n / 100))), {min: 0, max: 100, paso: 5}),
        ),
        el('p', {className: 'ayuda', textContent: `El color avanza sobre ${e.iso} como un frente. Úsalo para mostrar quién gana terreno.`}),
      );
      break;
    case 'texto':
      ins.append(
        cTexto('Texto', e.texto, (s) => (e.texto = s)),
        cColor('Color', e.color, (s) => (e.color = s)),
        fila(cNum('Tamaño', e.tamano, (n) => (e.tamano = n), {min: 6, max: 120, paso: 1}), cNum('Espaciado', e.espaciado, (n) => (e.espaciado = n), {min: 0, max: 2, paso: 0.05})),
        fila(cCheck('Mayúsculas', e.mayusculas, (b) => (e.mayusculas = b)), cCheck('Cursiva', e.cursiva, (b) => (e.cursiva = b))),
      );
      break;
    case 'zona':
      ins.append(
        cSelect('Tipo', e.estilo ?? 'area', [['area', 'Área'], ['objetivo', 'Objetivo (anillos)'], ['radar', 'Radar / alcance']], (v) => (e.estilo = v)),
        cColor('Color', e.color, (s) => (e.color = s)),
        cNum('Radio (km)', e.radioKm, (n) => (e.radioKm = Math.max(1, n)), {min: 1, paso: 5}),
        cCheck('Borde discontinuo', e.discontinua, (b) => (e.discontinua = b)),
      );
      break;
    case 'columna':
      ins.append(
        cTexto('Rótulo encima', e.texto, (s) => (e.texto = s)),
        cColor('Color', e.color, (s) => (e.color = s)),
        fila(cNum('Altura (km)', e.alturaKm, (n) => (e.alturaKm = Math.max(1, n)), {min: 1, paso: 50}),
          cNum('Radio (km)', e.radioKm, (n) => (e.radioKm = Math.max(1, n)), {min: 1, paso: 5})),
        fila(cSelect('Forma', e.forma, [['hexagono', 'Hexágono'], ['cilindro', 'Cilindro'], ['prisma', 'Prisma']], (v) => (e.forma = v)),
          cNum('Crece en (s)', e.crece, (n) => (e.crece = Math.max(0, n)), {min: 0, paso: 0.1})),
      );
      break;
    case 'recorte':
      ins.append(
        cTexto('Pie de foto', e.pie, (s) => (e.pie = s)),
        fila(cSelect('Marco', e.marco, [['crt', 'Televisor (CRT)'], ['papel', 'Papel'], ['limpio', 'Limpio']], (v) => (e.marco = v)),
          cSelect('Posición', e.posicion, [['izquierda', 'Izquierda'], ['derecha', 'Derecha'], ['centro', 'Centro']], (v) => (e.posicion = v))),
        cNum('Ancho (0–1)', e.ancho, (n) => (e.ancho = Math.min(0.9, Math.max(0.15, n))), {min: 0.15, paso: 0.05}),
      );
      break;
    case 'grafico':
      ins.append(
        cTexto('Título', e.titulo, (s) => (e.titulo = s)),
        cTexto('Barras (etiqueta: valor; …)', e.barras.map((b) => `${b.etiqueta}: ${b.valor}`).join('; '), (s) => {
          e.barras = s.split(';').map((x) => x.split(':')).filter((x) => x.length === 2 && x[0].trim())
            .map(([a, b]) => ({etiqueta: a.trim(), valor: Number(b.replace(',', '.')) || 0}));
        }),
        fila(cTexto('Unidad', e.unidad, (s) => (e.unidad = s)),
          cSelect('Posición', e.posicion, [['izquierda', 'Izquierda'], ['derecha', 'Derecha'], ['centro', 'Centro']], (v) => (e.posicion = v))),
      );
      break;
    case 'titulo':
      ins.append(
        cTexto('Título', e.texto, (s) => (e.texto = s)),
        cTexto('Subtítulo', e.subtitulo, (s) => (e.subtitulo = s)),
        cSelect('Posición', e.posicion, [['arriba', 'Arriba'], ['centro', 'Centro'], ['abajo', 'Abajo']], (v) => (e.posicion = v)),
      );
      break;
  }

  ins.append(
    fila(
      cNum('Aparece (s)', e.desde, (n) => (e.desde = Math.max(0, n)), {min: 0, paso: 1 / p.fps}),
      cNum('Desaparece (s)', e.hasta ?? p.duracion, (n) => (e.hasta = n >= p.duracion ? null : Math.max(e.desde + 0.05, n)), {min: 0, paso: 1 / p.fps}),
    ),
    cNum('Fundido (s)', e.fundido, (n) => (e.fundido = Math.max(0, n)), {min: 0, paso: 0.1}),
  );
  const bs = el('div', {className: 'botones'});
  bs.append(
    boton('Empezar aquí', () => cambio(() => (e.desde = ajustarFps(t)), true)),
    boton('Terminar aquí', () => cambio(() => (e.hasta = Math.max(e.desde + 0.05, ajustarFps(t))), true)),
    boton(e.oculto ? 'Mostrar' : 'Ocultar', () => cambio(() => (e.oculto = !e.oculto), true)),
    boton('Duplicar', () => cambio(() => {
      const c = {...structuredClone(e), id: uid(), nombre: e.nombre + ' (copia)'};
      p.elementos.push(c);
      sel = {tipo: 'el', id: c.id};
    }, true)),
    boton('Borrar', () => borrarSeleccion(), 'peligro'),
  );
  ins.append(bs);
}

const borrarSeleccion = () => {
  if (!sel) return;
  const s = sel;
  cambio(() => {
    if (s.tipo === 'kf') p.camara = p.camara.filter((x) => x.id !== s.id);
    else p.elementos = p.elementos.filter((x) => x.id !== s.id);
    sel = null;
  }, true);
  renderInspector();
};

// ── Estilos y opciones ────────────────────────────────────────────────────────────
function renderEstilos() {
  const c = $('estilos');
  c.innerHTML = '';
  for (const id of Object.keys(NOMBRES_ESTILO) as EstiloId[]) {
    const pal = PALETAS[id];
    const b = el('button', {className: 'estilo' + (p.estilo === id ? ' activo' : '')});
    const m = el('div', {className: 'muestra'});
    for (const col of [pal.oceano, pal.tierra, pal.frontera, pal.acento]) {
      const i = el('i');
      i.style.background = col;
      m.append(i);
    }
    b.append(m, el('span', {textContent: NOMBRES_ESTILO[id]}));
    b.addEventListener('click', () => {
      p.estilo = id;
      Object.assign(p.opciones, OPCIONES_DE_ESTILO[id] ?? {});
      confirmar();
      renderEstilos();
      renderOpciones();
      recargarEstilo();
    });
    c.append(b);
  }
  // Estilo a medida (preset JSON, p. ej. sacado de analizar un vídeo de referencia).
  const fila = el('div', {className: 'preset'});
  if (p.preset) {
    fila.append(el('span', {textContent: `★ ${p.preset.nombre}`, title: p.preset.referencia ?? ''}),
      boton('Quitar', () => {
        cambio(() => (p.preset = null));
        renderEstilos();
        recargarEstilo();
      }));
  }
  fila.append(boton('Importar estilo…', () => $('f-preset').click()));
  c.append(fila);
}

$<HTMLInputElement>('f-preset').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!f) return;
  try {
    const pr = JSON.parse(await f.text()) as PresetEstilo;
    if (!pr.nombre || !pr.base || !(pr.base in NOMBRES_ESTILO)) throw new Error();
    cambio(() => {
      p.preset = pr;
      p.estilo = pr.base;
      Object.assign(p.opciones, pr.opciones ?? {});
    });
    renderEstilos();
    renderOpciones();
    recargarEstilo();
    avisar(`Estilo aplicado: ${pr.nombre}`);
  } catch {
    avisar('Ese archivo no es un estilo válido (necesita "nombre" y "base").');
  }
});

function renderOpciones() {
  const c = $('opciones');
  c.innerHTML = '';
  const o = p.opciones;
  const chk = (etq: string, k: keyof OpcionesEstilo, recarga = true) => {
    const l = el('label');
    const i = el('input', {type: 'checkbox', checked: k === 'modelos3d' ? o[k] !== false : Boolean(o[k])});
    i.addEventListener('change', () => {
      (o as Record<string, unknown>)[k] = i.checked;
      confirmar();
      if (recarga) recargarEstilo();
      else aplicar(false);
    });
    l.append(i, etq);
    return l;
  };
  const rango = (etq: string, k: 'grano' | 'vineta' | 'exageracion' | 'desenfoque' | 'etalonaje', min: number, max: number, paso: number, recarga = false) => {
    const l = el('label', {className: 'ancho'});
    const i = el('input', {type: 'range', min: String(min), max: String(max), step: String(paso), value: String(o[k])});
    i.addEventListener('input', () => {
      o[k] = Number(i.value);
      if (!recarga) aplicar(false);
    });
    i.addEventListener('change', () => {
      confirmar();
      if (recarga) {
        if (map.getTerrain()) map.setTerrain({source: 'dem-3d', exaggeration: o.exageracion});
      }
    });
    l.append(etq, i);
    return l;
  };
  c.append(
    chk('Globo 3D', 'globo'),
    chk('Relieve', 'relieve'),
    chk('Terreno 3D', 'terreno3d'),
    chk('Colorear países', 'colorearPaises'),
    chk('Nombres de países', 'etiquetasPaises'),
    chk('Solo rótulos de la historia', 'soloHistoria'),
    chk('Desenfoque de movimiento (render ×3)', 'desenfoqueMovimiento'),
    chk('Piezas en 3D (unidades, fichas, peanas)', 'modelos3d', false),
    chk('Ciudades', 'ciudades'),
    chk('Ríos', 'rios'),
    chk('Mares', 'mares'),
    chk('Provincias', 'provincias'),
  );
  const idioma = el('label');
  const s = el('select');
  s.append(el('option', {value: 'es', textContent: 'Español', selected: o.idioma === 'es'}), el('option', {value: 'en', textContent: 'English', selected: o.idioma === 'en'}));
  s.addEventListener('change', () => {
    o.idioma = s.value as 'es' | 'en';
    confirmar();
    recargarEstilo();
  });
  idioma.append(s);
  c.append(idioma, rango('Grano', 'grano', 0, 1, 0.05), rango('Viñeta', 'vineta', 0, 1, 0.05), rango('Profundidad', 'desenfoque', 0, 1, 0.05), rango('Etalonaje', 'etalonaje', 0, 1, 0.05), rango('Altura 3D', 'exageracion', 0.5, 4, 0.1, true));
}

// ── Herramientas ──────────────────────────────────────────────────────────────────
const HERRAMIENTAS: [Herramienta, string, string, string][] = [
  ['navegar', '✋', 'Navegar', 'Arrastra para mover. Clic derecho + arrastrar (o Ctrl + arrastrar) para girar e inclinar. Rueda para zoom.'],
  ['pais', '▦', 'País', 'Haz clic en un país para resaltarlo desde el tiempo actual.'],
  ['territorio', '◧', 'Frente', 'Haz clic en un país: el color avanzará sobre él como un frente (control territorial).'],
  ['ficha', '⬢', 'Ficha', 'Haz clic para plantar una ficha hexagonal de pie (soldado, avión, barco, retrato…).'],
  ['columna', '▮', '3D', 'Haz clic para levantar una columna 3D (cifras, presencia, producción). Inclina la cámara para verla.'],
  ['ruta', '➝', 'Ruta', 'Haz clic para añadir puntos. Doble clic o Intro para terminar. Esc para cancelar.'],
  ['pin', '◉', 'Pin', 'Haz clic donde quieras el pin. Toma el nombre de la ciudad más cercana.'],
  ['texto', 'T', 'Texto', 'Haz clic para colocar un texto sobre el mapa (mares, regiones, cifras).'],
  ['zona', '◌', 'Zona', 'Haz clic para marcar un área circular (radio en km).'],
  ['titulo', '▭', 'Título', 'Añade un rótulo en pantalla (no se mueve con el mapa).'],
];

function renderHerramientas() {
  const c = $('herramientas');
  c.innerHTML = '';
  for (const [id, ico, nombre, ayuda] of HERRAMIENTAS) {
    const b = el('button', {className: herramienta === id ? 'activo' : '', title: ayuda});
    b.append(el('b', {textContent: ico}), nombre);
    b.addEventListener('click', () => usarHerramienta(id));
    c.append(b);
  }
  $('ayuda-herramienta').textContent = HERRAMIENTAS.find((h) => h[0] === herramienta)![3];
}

function usarHerramienta(h: Herramienta) {
  if (h === 'titulo') {
    nuevo({tipo: 'titulo', nombre: 'Título', texto: 'Título', subtitulo: '', posicion: 'arriba', desde: ajustarFps(t), hasta: Math.min(p.duracion, ajustarFps(t + 3)), fundido: 0.4});
    return;
  }
  herramienta = h;
  puntosRuta = [];
  borrador(map, []);
  marco.classList.toggle('cursor-cruz', h !== 'navegar');
  if (h === 'ruta') map.doubleClickZoom.disable();
  else map.doubleClickZoom.enable();
  renderHerramientas();
}

const acento = () => paletaDe(p.estilo, p.preset).acento;

type SinId<T> = T extends unknown ? Omit<T, 'id'> : never;
function nuevo(e: SinId<Elemento>) {
  const c = {...e, id: uid()} as Elemento;
  cambio(() => {
    p.elementos.push(c);
    sel = {tipo: 'el', id: c.id};
  }, true);
  renderInspector();
}

map.on('click', async (ev) => {
  const en: LonLat = [+ev.lngLat.lng.toFixed(5), +ev.lngLat.lat.toFixed(5)];
  const t0 = ajustarFps(t);
  switch (herramienta) {
    case 'pais': {
      const f = map.queryRenderedFeatures(ev.point, {layers: ['mm-pais-relleno']})[0];
      const iso = f?.properties?.iso as string | undefined;
      if (!iso) return avisar('Ahí no hay ningún país.');
      const ya = p.elementos.find((x) => x.tipo === 'pais' && x.iso === iso);
      if (ya) return seleccionar({tipo: 'el', id: ya.id});
      const nombre = (p.opciones.idioma === 'es' ? f.properties.nombre : f.properties.nombre_en) ?? iso;
      nuevo({tipo: 'pais', nombre, iso, color: acento(), opacidad: 0.55, borde: true, pulso: false, desde: t0, hasta: null, fundido: 0.6});
      break;
    }
    case 'ruta':
      puntosRuta.push(en);
      borrador(map, puntosRuta);
      break;
    case 'pin': {
      const ciudad = await ciudadCercana(en);
      nuevo({tipo: 'pin', nombre: ciudad ?? 'Pin', en, texto: (ciudad ?? 'Lugar').toUpperCase(), color: acento(), estilo: 'pulso', etiqueta: 'papel', desde: t0, hasta: null, fundido: 0.3});
      break;
    }
    case 'texto':
      nuevo({tipo: 'texto', nombre: 'Texto', en, texto: 'Texto', tamano: 26, color: paletaDe(p.estilo, p.preset).etiquetaPais, mayusculas: true, cursiva: false, espaciado: 0.2, desde: t0, hasta: null, fundido: 0.4});
      break;
    case 'zona':
      nuevo({tipo: 'zona', nombre: 'Zona', en, radioKm: 150, color: acento(), discontinua: true, estilo: 'area', desde: t0, hasta: null, fundido: 0.5});
      break;
    case 'territorio': {
      const f = map.queryRenderedFeatures(ev.point, {layers: ['mm-pais-relleno']})[0];
      const iso = f?.properties?.iso as string | undefined;
      if (!iso) return avisar('Ahí no hay ningún país.');
      const nombre = (p.opciones.idioma === 'es' ? f.properties.nombre : f.properties.nombre_en) ?? iso;
      nuevo({tipo: 'territorio', nombre: `Avance en ${nombre}`, iso, color: BANDOS.aliado, opacidad: 0.92, direccion: 0, avance: 3,
        hasta_fraccion: 1, desde: t0, hasta: null, fundido: 0.3});
      await asegurarRecursos();
      break;
    }
    case 'columna':
      nuevo({tipo: 'columna', nombre: 'Columna', en, alturaKm: 120, radioKm: 25, color: acento(), forma: 'hexagono', texto: '',
        crece: 1.2, desde: t0, hasta: null, fundido: 0.2});
      break;
    case 'ficha':
      nuevo({tipo: 'pin', nombre: 'Ficha', en, texto: '', color: BANDOS.aliado, estilo: 'ficha', etiqueta: 'ninguna', icono: '🪖',
        fondo: 'color', tamano: 1, desde: t0, hasta: null, fundido: 0.2});
      break;
  }
});
map.on('dblclick', () => {
  if (herramienta === 'ruta') terminarRuta();
});
map.on('mousemove', (ev) => {
  if (herramienta === 'ruta' && puntosRuta.length) borrador(map, [...puntosRuta, [ev.lngLat.lng, ev.lngLat.lat]]);
});

function terminarRuta() {
  // El doble clic añade dos puntos casi iguales al final: se descartan.
  const pts = puntosRuta.filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 1e-4);
  puntosRuta = [];
  borrador(map, []);
  if (pts.length < 2) return avisar('Una ruta necesita al menos dos puntos.');
  nuevo({tipo: 'ruta', nombre: `Ruta ${p.elementos.filter((x) => x.tipo === 'ruta').length + 1}`, puntos: pts, color: acento(), grosor: 5, discontinua: false, flecha: true, forma: pts.length === 2 ? 'arco' : 'recta', trazo: 2, desde: ajustarFps(t), hasta: null, fundido: 0.2});
}

// ── Keyframes ─────────────────────────────────────────────────────────────────────
const vistaActualCamara = () => {
  const v = vistaActual();
  return {centro: v.centro, zoom: v.zoom, rumbo: v.rumbo, inclinacion: v.inclinacion};
};
const vistaActual = () => {
  const c = map.getCenter();
  return {centro: [+c.lng.toFixed(5), +c.lat.toFixed(5)] as LonLat, zoom: +(map.getZoom() - desfase()).toFixed(3), rumbo: +map.getBearing().toFixed(2), inclinacion: +map.getPitch().toFixed(2)};
};
function añadirKeyframe() {
  const tk = ajustarFps(t);
  const existente = p.camara.find((k) => Math.abs(k.t - tk) < 0.5 / p.fps);
  const k: Keyframe = existente ?? {id: uid(), t: tk, curva: 'suave', vuelo: false, ...vistaActual()};
  cambio(() => {
    if (existente) Object.assign(existente, vistaActual());
    else p.camara.push(k);
    sel = {tipo: 'kf', id: k.id};
  }, true);
  renderInspector();
  avisar(existente ? 'Keyframe actualizado' : `Keyframe en ${fmt(tk)}`);
}

// ── Búsqueda ──────────────────────────────────────────────────────────────────────
const inpBuscar = $<HTMLInputElement>('buscar');
let busquedaN = 0;
inpBuscar.addEventListener('input', async () => {
  const n = ++busquedaN;
  const res = await buscar(inpBuscar.value);
  if (n !== busquedaN) return;
  const ul = $('resultados');
  ul.innerHTML = '';
  for (const r of res) {
    const li = el('li');
    li.append(el('span', {textContent: r.nombre}), el('small', {textContent: r.detalle}));
    li.addEventListener('click', () => {
      map.flyTo({center: r.en, zoom: r.zoom + desfase(), speed: 1.6, essential: true});
      ul.innerHTML = '';
      inpBuscar.value = r.nombre;
    });
    ul.append(li);
  }
});
inpBuscar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ($('resultados').firstElementChild as HTMLElement | null)?.click();
});

// ── Proyecto: nuevo, abrir, guardar, formato ──────────────────────────────────────
function cargarProyecto(np: Proyecto, registrar = true) {
  const estiloCambia = np.estilo !== p.estilo || JSON.stringify(np.opciones) !== JSON.stringify(p.opciones);
  p = np;
  sel = null;
  t = Math.min(t, p.duracion);
  sincronizarCabecera();
  renderEstilos();
  renderOpciones();
  renderLista();
  renderInspector();
  ajustarMarco();
  renderLinea();
  if (estiloCambia || !map.getSource('mm-rutas')) recargarEstilo();
  else aplicar(true);
  if (registrar) confirmar();
}

function sincronizarCabecera() {
  $<HTMLInputElement>('nombre').value = p.nombre;
  $<HTMLInputElement>('duracion').value = String(p.duracion);
  $<HTMLInputElement>('fuente').value = p.fuente;
  $<HTMLSelectElement>('fps').value = String(p.fps);
  const fs = $<HTMLSelectElement>('formato');
  const v = `${p.ancho}x${p.alto}`;
  if (![...fs.options].some((o) => o.value === v)) fs.append(el('option', {value: v, textContent: v}));
  fs.value = v;
  $('b-horizontal').classList.toggle('activo', p.ancho > p.alto);
  $('b-reel').classList.toggle('activo', p.alto > p.ancho);
  marco.classList.toggle('vertical', p.alto > p.ancho);
}

$('nombre').addEventListener('change', () => cambio(() => (p.nombre = $<HTMLInputElement>('nombre').value)));
$('fuente').addEventListener('input', () => {
  p.fuente = $<HTMLInputElement>('fuente').value;
  pintarPrevia();
});
$('fuente').addEventListener('change', () => confirmar());
$<HTMLInputElement>('f-logo').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!f) return;
  const url = await reducirImagen(f, 400);
  cambio(() => (p.marca = {imagen: url, opacidad: Number($<HTMLInputElement>('logo-op').value), tamano: 1}));
  await asegurarRecursos();
});
$<HTMLInputElement>('logo-op').addEventListener('input', () => {
  if (!p.marca) return;
  p.marca.opacidad = Number($<HTMLInputElement>('logo-op').value);
  pintarPrevia();
});
$('logo-op').addEventListener('change', () => confirmar());
$('b-quitar-logo').addEventListener('click', () => cambio(() => (p.marca = null)));
$('duracion').addEventListener('change', () => cambio(() => {
  p.duracion = Math.max(1, Number($<HTMLInputElement>('duracion').value) || 10);
  t = Math.min(t, p.duracion);
}, true));
$('fps').addEventListener('change', () => cambio(() => (p.fps = Number($<HTMLSelectElement>('fps').value))));
const aplicarFormato = (w: number, h: number) => {
  let d = 0;
  cambio(() => (d = cambiarFormato(p, w, h)));
  sincronizarCabecera();
  ajustarMarco();
  if (h > w) marco.classList.add('con-guias');
  aplicar(true);
  renderLinea();
  renderInspector();
  if (d) avisar(`Formato ${w}×${h} · cámara adaptada (zoom ${d > 0 ? '+' : ''}${d})`);
};
$('formato').addEventListener('change', () => {
  const [w, h] = $<HTMLSelectElement>('formato').value.split('x').map(Number);
  aplicarFormato(w, h);
});
$('b-horizontal').addEventListener('click', () => aplicarFormato(1920, 1080));
$('b-reel').addEventListener('click', () => aplicarFormato(1080, 1920));
$('b-nuevo').addEventListener('click', () => {
  if (confirm('¿Empezar un proyecto nuevo? El actual se puede recuperar con Ctrl+Z.')) cargarProyecto(proyectoNuevo());
});
$('b-demo').addEventListener('click', () => cargarProyecto(proyectoDemo()));
$('b-guardar').addEventListener('click', () => descargar(new Blob([JSON.stringify(p, null, 2)], {type: 'application/json'}), `${slug(p.nombre)}.mapa.json`));
$('b-abrir').addEventListener('click', () => $('f-abrir').click());
$<HTMLInputElement>('f-abrir').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    cargarProyecto(normalizar(JSON.parse(await f.text())));
    avisar(`Abierto: ${f.name}`);
  } catch {
    avisar('Ese archivo no es un proyecto válido.');
  }
  (e.target as HTMLInputElement).value = '';
});

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mapa';
function descargar(blob: Blob, nombre: string) {
  const a = el('a', {href: URL.createObjectURL(blob), download: nombre});
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2000);
}

// ── Exportación ───────────────────────────────────────────────────────────────────
let cancelar = false;
const modal = $('modal');
const progreso = (hecho: number, total: number, fase: string) => {
  $('modal-prog').style.width = `${(hecho / total) * 100}%`;
  $('modal-texto').textContent = `${fase} · ${hecho}/${total} fotogramas`;
};
$('modal-cancelar').addEventListener('click', () => (cancelar = true));

$('b-exportar').addEventListener('click', async () => {
  if (reproduciendo) alternarPlay();
  await estiloCargando;
  // Lo normal: render en segundo plano (navegador oculto). Se puede seguir trabajando o cerrar la pestaña.
  try {
    const job = await encargarVideo(structuredClone(p), anchoMarco(), vistaActualCamara());
    seguirVideo(job.id, avisar);
    avisar('Render encargado: se hace en segundo plano y se guarda solo en la carpeta de salidas.');
    return;
  } catch {
    /* servidor antiguo o sin navegador: se exporta aquí, como antes */
  }
  cancelar = false;
  modal.hidden = false;
  $('modal-titulo').textContent = `Exportando ${p.ancho}×${p.alto} · ${p.fps} fps`;
  const inicio = performance.now();
  try {
    const r = await exportarVideo(structuredClone(p), anchoMarco(), progreso, () => cancelar, vistaActualCamara());
    descargar(r.blob, `${slug(p.nombre)}.${r.extension.replace(/^\./, '')}`);
    avisar(`Vídeo listo (${r.codec.toUpperCase()}, ${(r.blob.size / 1e6).toFixed(1)} MB, ${((performance.now() - inicio) / 1000).toFixed(0)} s)`);
  } catch (e) {
    avisar((e as Error).message);
  } finally {
    modal.hidden = true;
  }
});

$('b-png').addEventListener('click', async () => {
  await estiloCargando;
  avisar('Capturando…');
  try {
    const b = await capturarPNG(structuredClone(p), t, anchoMarco(), vistaActualCamara());
    descargar(b, `${slug(p.nombre)}-${t.toFixed(2)}s.png`);
    avisar(`PNG ${p.ancho}×${p.alto} listo`);
  } catch (e) {
    avisar((e as Error).message);
  }
});

// ── Teclado ───────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  const enCampo = (e.target as HTMLElement).closest('input, select, textarea');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !enCampo) {
    e.preventDefault();
    if (e.shiftKey) rehacer();
    else deshacer();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !enCampo) {
    e.preventDefault();
    rehacer();
    return;
  }
  if (enCampo) return;
  if (e.key === ' ') {
    e.preventDefault();
    alternarPlay();
  } else if (e.key.toLowerCase() === 'k') añadirKeyframe();
  else if (e.key === 'Home') irA(0);
  else if (e.key === 'Enter' && herramienta === 'ruta') terminarRuta();
  else if (e.key === 'Escape') {
    if (puntosRuta.length) {
      puntosRuta = [];
      borrador(map, []);
    } else usarHerramienta('navegar');
  } else if (e.key === 'Delete' || e.key === 'Backspace') borrarSeleccion();
  else if (e.key === 'ArrowRight') irA(ajustarFps(t + (e.shiftKey ? 1 : 1 / p.fps)));
  else if (e.key === 'ArrowLeft') irA(ajustarFps(t - (e.shiftKey ? 1 : 1 / p.fps)));
  else if (e.key.toLowerCase() === 'g') marco.classList.toggle('con-guias');
});

// Tema de la interfaz: claro por defecto, oscuro opcional (se recuerda en este navegador).
const aplicarTema = (tema: string) => {
  if (tema === 'oscuro') document.documentElement.dataset.tema = 'oscuro';
  else delete document.documentElement.dataset.tema;
};
try {
  aplicarTema(localStorage.getItem('mapas-multimedia:tema') ?? 'claro');
} catch {
  /* sin almacenamiento: tema claro */
}
$('b-tema').addEventListener('click', () => {
  const nuevoTema = document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro';
  aplicarTema(nuevoTema);
  try {
    localStorage.setItem('mapas-multimedia:tema', nuevoTema);
  } catch {
    /* sin almacenamiento */
  }
});

$('b-play').addEventListener('click', alternarPlay);
$('b-inicio').addEventListener('click', () => irA(0));
$('b-kf').addEventListener('click', añadirKeyframe);

let avisoT = 0;
function avisar(msg: string) {
  const a = $('aviso');
  a.textContent = msg;
  a.classList.add('ver');
  clearTimeout(avisoT);
  avisoT = window.setTimeout(() => a.classList.remove('ver'), 2600);
}

// ── Arranque ──────────────────────────────────────────────────────────────────────
sincronizarCabecera();
renderEstilos();
renderOpciones();
renderHerramientas();
renderLista();
renderInspector();
ajustarMarco();
renderLinea();
recargarEstilo();
estiloCargando.then(() => irA(0));
void asegurarRecursos();
confirmar();

// ── Conexión con el chat de Claude (servidor local + conector MCP) ────────────────
const reducirPNG = async (b: Blob, maxAncho: number) => {
  const bmp = await createImageBitmap(b);
  const k = Math.min(1, maxAncho / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
};

const trabajo: {fase: string; hecho: number; total: number; ruta: string | null; error: string | null; inicio: number;
  codec?: string; mb?: number; segundos?: number} = {fase: 'sin trabajo', hecho: 0, total: 0, ruta: null, error: null, inicio: 0};

iniciarChat();
void cargarFuentes().then(() => pintarPrevia());
// Si al abrir (o recargar) el editor hay un render en marcha, se sigue mostrando su avance.
void estadoVideo().then((t) => {
  if (t && faseSimple(t.fase) === 'renderizando') seguirVideo(t.id, avisar);
}).catch(() => undefined);
vigilarVersion(() => trabajo.fase === 'renderizando' || !$('modal').hidden || Boolean(document.body.dataset.chatOcupado));
iniciarPuente(async (accion, d) => {
  switch (accion) {
    case 'estado':
      return {proyecto: p, t, vista: vistaActual(), anchoMarco: anchoMarco(), estilos: Object.keys(NOMBRES_ESTILO)};
    case 'cargar': {
      const np = normalizar(d.proyecto as Partial<Proyecto>);
      // Proyecto nuevo o estilo nuevo: primero los ajustes propios del estilo, luego los pedidos.
      if (d.estiloNuevo || !(d.proyecto as Partial<Proyecto>).opciones) {
        Object.assign(np.opciones, OPCIONES_DE_ESTILO[np.estilo] ?? {}, (d.opciones as object) ?? {});
      }
      cargarProyecto(np);
      await estiloCargando;
      await asegurarRecursos();
      return {elementos: p.elementos.length, keyframes: p.camara.length};
    }
    case 'ir_a':
      irA(Number(d.t ?? 0));
      return {t};
    case 'mirar':
      map.jumpTo({center: d.centro as LonLat, zoom: Number(d.zoom) + desfase(), bearing: Number(d.rumbo ?? 0), pitch: Number(d.inclinacion ?? 0)});
      return vistaActual();
    case 'capturar': {
      await estiloCargando;
      const tt = d.t == null ? t : Number(d.t);
      const b = await capturarPNG(structuredClone(p), tt, anchoMarco(), vistaActualCamara());
      const vista = await reducirPNG(b, Number(d.maxAncho ?? 1280));
      const ruta = d.guardar ? await subirArchivo(b, `${slug(p.nombre)}-${tt.toFixed(2)}s.png`) : null;
      return {imagen: vista, ruta, t: tt};
    }
    case 'exportar_video': {
      // Render en segundo plano (navegador oculto): no depende de que esta pestaña esté visible.
      await estiloCargando;
      try {
        const actual = await estadoVideo();
        if (actual && faseSimple(actual.fase) === 'renderizando') return {...actual, fase: 'renderizando'};
        const job = await encargarVideo(structuredClone(p), anchoMarco(), vistaActualCamara());
        seguirVideo(job.id, avisar);
        return {...job, fase: 'renderizando', nota: 'Render en segundo plano: el usuario puede cerrar o cambiar de pestaña.'};
      } catch {
        /* sin render en segundo plano: se exporta en esta pestaña */
      }
      // Se lanza y se responde en el acto: el chat consulta luego con 'estado_exportacion'.
      if (trabajo.fase === 'renderizando') return trabajo;
      if (reproduciendo) alternarPlay();
      await estiloCargando;
      cancelar = false;
      Object.assign(trabajo, {fase: 'renderizando', hecho: 0, total: Math.round(p.duracion * p.fps), ruta: null, error: null, inicio: Date.now()});
      modal.hidden = false;
      $('modal-titulo').textContent = `Claude está exportando ${p.ancho}×${p.alto} · ${p.fps} fps`;
      // El chat cuenta el tiempo de render con estos avisos.
      const avisarChat = () => window.dispatchEvent(new CustomEvent('ee-exportacion', {detail: {...trabajo}}));
      avisarChat();
      void (async () => {
        try {
          const r = await exportarVideo(structuredClone(p), anchoMarco(), (h, tot, fase) => {
            trabajo.hecho = h;
            trabajo.total = tot;
            progreso(h, tot, fase);
          }, () => cancelar, vistaActualCamara());
          trabajo.ruta = await subirArchivo(r.blob, `${slug(p.nombre)}.${r.extension.replace(/^\./, '')}`);
          trabajo.codec = r.codec;
          trabajo.mb = +(r.blob.size / 1e6).toFixed(1);
          trabajo.fase = 'listo';
        } catch (e) {
          trabajo.fase = 'error';
          trabajo.error = (e as Error).message;
        } finally {
          trabajo.segundos = Math.round((Date.now() - trabajo.inicio) / 1000);
          modal.hidden = true;
          avisarChat();
        }
      })();
      return trabajo;
    }
    case 'estado_exportacion': {
      if (trabajo.fase === 'renderizando') return trabajo; // exportación en esta pestaña (modo antiguo)
      const t = await estadoVideo().catch(() => null);
      return t ? {...t, fase: faseSimple(t.fase)} : trabajo;
    }
    default:
      throw new Error(`Acción desconocida: ${accion}`);
  }
}, (on) => {
  const e = $('estado-claude');
  e.classList.toggle('on', on);
  e.title = on ? 'Conectado: el chat de Claude puede dirigir este editor' : 'Sin conexión con el servidor local (npm run iniciar)';
});

// Acceso para pruebas automatizadas y depuración desde la consola.
Object.assign(window, {mm: {map, get p() { return p; }, get t() { return t; }, irA, cargarProyecto, anchoMarco,
  diagnosticar: () => diagnosticar(structuredClone(p), t, anchoMarco())}});
