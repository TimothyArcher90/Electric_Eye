#!/usr/bin/env node
// Conector MCP de Electric Eye: le da a Claude (app de escritorio o Claude Code) las
// herramientas para dirigir el editor. Habla con la pestaña abierta a través del puente
// local (puente.mjs). Si el puente no está en marcha, lo arranca aquí mismo.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {iniciarPuente, puenteActivo, PUERTO} from './puente.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GUIA = readFileSync(join(RAIZ, 'servidor', 'guia-de-direccion.md'), 'utf8');

// ── Puente ───────────────────────────────────────────────────────────────────────
if (!(await puenteActivo())) {
  try {
    await iniciarPuente();
  } catch {
    /* otro proceso lo abrió a la vez: se usa ese */
  }
}

const salidasActuales = async () => (await (await fetch(`http://127.0.0.1:${PUERTO}/salud`)).json()).salidas;

// Si el puente se cayó (por ejemplo, se reinició el editor), este conector lo vuelve a levantar.
const asegurarPuente = async () => {
  if (await puenteActivo()) return;
  try {
    await iniciarPuente();
  } catch {
    /* otro proceso lo abrió a la vez */
  }
};

const orden = async (accion, datos = {}, limiteMs = 120000) => {
  await asegurarPuente();
  const r = await fetch(`http://127.0.0.1:${PUERTO}/rpc`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({accion, datos, limiteMs}),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error ?? 'Error del editor');
  return j.resultado;
};

// ── Índice de lugares (Natural Earth, sin conexión) ─────────────────────────────────
const leer = (f) => JSON.parse(readFileSync(join(RAIZ, 'public', 'data', f), 'utf8'));
const limpiar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const LUGARES = [];
for (const f of leer('paises-etiquetas.geojson').features) {
  const p = f.properties;
  for (const n of new Set([p.nombre, p.nombre_en].filter(Boolean))) {
    LUGARES.push({clave: limpiar(n), nombre: p.nombre, tipo: 'pais', iso: p.iso, centro: f.geometry.coordinates,
      zoom: p.rank <= 2 ? 3.6 : p.rank <= 4 ? 4.6 : 5.6, peso: 0});
  }
}
for (const f of leer('ciudades.geojson').features) {
  const p = f.properties;
  for (const n of new Set([p.nombre, p.nombre_en, p.nombre_local].filter(Boolean))) {
    LUGARES.push({clave: limpiar(n), nombre: p.nombre ?? p.nombre_en, tipo: 'ciudad', pais: p.pais, centro: f.geometry.coordinates,
      zoom: 7, capital: Boolean(p.capital), peso: 1 + (p.rank ?? 10) / 20});
  }
}
for (const f of leer('mares-etiquetas.geojson').features) {
  const p = f.properties;
  for (const n of new Set([p.nombre, p.nombre_en].filter(Boolean))) {
    LUGARES.push({clave: limpiar(n), nombre: p.nombre ?? p.nombre_en, tipo: 'mar', centro: f.geometry.coordinates, zoom: 5, peso: 1.2});
  }
}
// Estrechos, regiones y zonas en disputa que Natural Earth no trae como punto (Ormuz, Donbás, Gaza…).
for (const f of leer('lugares-extra.geojson').features) {
  const p = f.properties;
  for (const n of new Set([p.nombre, p.nombre_en].filter(Boolean))) {
    LUGARES.push({clave: limpiar(n), nombre: p.nombre, tipo: 'region', centro: f.geometry.coordinates, zoom: p.zoom ?? 6, peso: 0.5});
  }
}
// Sin artículo ni "estrecho de": "Ormuz" encuentra "Estrecho de Ormuz".
const buscar = (q, max = 6) => {
  const c = limpiar(q);
  return LUGARES
    .map((l) => ({l, s: l.clave === c ? 0 : l.clave.startsWith(c) ? 1 : l.clave.includes(c) ? 2 : 99}))
    .filter((x) => x.s < 99)
    .sort((a, b) => a.s + a.l.peso - (b.s + b.l.peso))
    .slice(0, max)
    .map(({l}) => ({nombre: l.nombre, tipo: l.tipo, iso: l.iso, pais: l.pais, centro: l.centro, zoom: l.zoom}));
};
const resolverLugar = (lugar) => {
  const r = buscar(lugar, 1)[0];
  if (!r) throw new Error(`No encuentro el lugar "${lugar}". Usa buscar_lugar o pasa coordenadas [lon, lat].`);
  return r;
};
const resolverIso = (pais) => {
  if (/^[A-Z]{3}$/.test(pais)) return {iso: pais, nombre: pais};
  const r = buscar(pais, 8).find((x) => x.tipo === 'pais');
  if (!r) throw new Error(`No encuentro el país "${pais}".`);
  return r;
};
const coords = (e, campo = 'en') => {
  if (Array.isArray(e[campo])) return e[campo];
  if (e.lugar) return resolverLugar(e.lugar).centro;
  throw new Error(`Falta "${campo}" ([lon, lat]) o "lugar" en ${e.tipo}.`);
};

// ── Elementos: valores por defecto del estilo Atlas ────────────────────────────────
const BANDOS = {adversario: '#CB8C5B', aliado: '#5C844E', bloque: '#C74227', neutro: '#9C8F84'};
const color = (c, porDefecto) => BANDOS[c] ?? c ?? porDefecto;

/** Imagen para un recorte: ruta local, URL o data URL → data URL (el lienzo del vídeo no admite imágenes de otro origen). */
const TIPOS_IMG = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif'};
const imagenComoDataUrl = async (e) => {
  const fuente = e.imagen ?? e.ruta ?? e.url;
  if (!fuente) throw new Error('Un recorte necesita "ruta" (archivo de imagen) o "url".');
  if (String(fuente).startsWith('data:')) return fuente;
  if (/^https?:\/\//.test(fuente)) {
    const r = await fetch(fuente);
    if (!r.ok) throw new Error(`No pude descargar la imagen (${r.status}).`);
    const tipo = r.headers.get('content-type') ?? 'image/jpeg';
    return `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
  }
  const ext = String(fuente).split('.').pop().toLowerCase();
  return `data:${TIPOS_IMG[ext] ?? 'image/jpeg'};base64,${readFileSync(fuente).toString('base64')}`;
};

const completar = async (e) => {
  const base = {id: randomUUID().slice(0, 8), desde: e.desde ?? 0, hasta: e.hasta ?? null, oculto: false};
  switch (e.tipo) {
    case 'pais': {
      const r = resolverIso(e.pais ?? e.iso ?? e.nombre);
      return {...base, tipo: 'pais', nombre: e.nombre ?? r.nombre, iso: r.iso, color: color(e.color, BANDOS.adversario),
        opacidad: e.opacidad ?? 0.94, borde: e.borde ?? true, pulso: e.pulso ?? false, fundido: e.fundido ?? 0.6};
    }
    case 'territorio': case 'frente': {
      const r = resolverIso(e.pais ?? e.iso);
      return {...base, tipo: 'territorio', nombre: e.nombre ?? `Avance en ${r.nombre}`, iso: r.iso, color: color(e.color, BANDOS.aliado),
        opacidad: e.opacidad ?? 0.94, direccion: e.direccion ?? 0, avance: e.avance ?? 3, hasta_fraccion: e.hasta_fraccion ?? 1,
        fundido: e.fundido ?? 0.3, ...(e.trama ? {trama: true, ...(e.color2 ? {color2: color(e.color2, BANDOS.adversario)} : {})} : {})};
    }
    case 'ficha':
      return {...base, tipo: 'pin', nombre: e.nombre ?? 'Ficha', en: coords(e), texto: e.texto ?? '', color: color(e.color, BANDOS.aliado),
        estilo: 'ficha', etiqueta: e.etiqueta ?? (e.texto ? 'papel' : 'ninguna'), icono: e.icono ?? '🪖', fondo: e.fondo ?? 'color',
        tamano: e.tamano ?? 1, fundido: e.fundido ?? 0.2,
        forma: ['peana', 'unidad'].includes(e.forma) ? e.forma : 'hexagono', ...(e.rumbo != null ? {rumbo: Number(e.rumbo)} : {})};
    case 'pin':
      return {...base, tipo: 'pin', nombre: e.nombre ?? e.texto ?? e.lugar ?? 'Pin', en: coords(e), texto: e.texto ?? String(e.lugar ?? '').toUpperCase(),
        color: color(e.color, BANDOS.bloque), estilo: e.estilo ?? 'pulso', etiqueta: e.etiqueta ?? 'papel', fundido: e.fundido ?? 0.3,
        icono: e.icono, fondo: e.fondo, tamano: e.tamano};
    case 'ruta': {
      const puntos = (e.puntos ?? e.lugares ?? []).map((q) => (Array.isArray(q) ? q : resolverLugar(q).centro));
      if (puntos.length < 2) throw new Error('Una ruta necesita al menos dos puntos o lugares.');
      return {...base, tipo: 'ruta', nombre: e.nombre ?? 'Ruta', puntos, color: color(e.color, BANDOS.bloque), grosor: e.grosor ?? 4,
        discontinua: e.discontinua ?? true, flecha: e.flecha ?? true, forma: e.forma ?? (puntos.length === 2 ? 'arco' : 'recta'),
        trazo: e.trazo ?? 2, fundido: e.fundido ?? 0.2, estilo: e.estilo === 'ataque' ? 'ataque' : 'linea',
        ...(e.estilo === 'ataque' ? {anchoKm: e.anchoKm ?? 60} : {}),
        ...(e.movil ? {movil: String(e.movil), tamanoMovil: e.tamanoMovil ?? 1} : {})};
    }
    case 'texto':
      return {...base, tipo: 'texto', nombre: e.nombre ?? 'Texto', en: coords(e), texto: e.texto ?? '', tamano: e.tamano ?? 26,
        color: e.color ?? '#3E362F', mayusculas: e.mayusculas ?? true, cursiva: e.cursiva ?? false, espaciado: e.espaciado ?? 0.2,
        fundido: e.fundido ?? 0.4};
    case 'zona':
      return {...base, tipo: 'zona', nombre: e.nombre ?? 'Zona', en: coords(e), radioKm: e.radioKm ?? 150,
        color: color(e.color, e.estilo === 'radar' ? '#3FD06A' : BANDOS.bloque), discontinua: e.discontinua ?? false,
        estilo: e.estilo ?? 'area', fundido: e.fundido ?? 0.5,
        ...(e.trama ? {trama: true, ...(e.color2 ? {color2: color(e.color2, BANDOS.adversario)} : {})} : {})};
    case 'foco':
      return {...base, tipo: 'foco', nombre: e.nombre ?? 'Foco', paises: (e.paises ?? [e.pais ?? e.iso]).filter(Boolean).map((q) => resolverIso(q).iso),
        opacidad: e.opacidad ?? 0.45, fundido: e.fundido ?? 0.8};
    case 'trafico': {
      const puntos = (e.puntos ?? e.lugares ?? []).map((q) => (Array.isArray(q) ? q : resolverLugar(q).centro));
      if (puntos.length < 2) throw new Error('El tráfico necesita al menos dos puntos o lugares (el corredor).');
      return {...base, tipo: 'trafico', nombre: e.nombre ?? 'Tráfico', puntos, barcos: e.barcos ?? 18, vuelta: e.vuelta ?? 20,
        sentido: e.sentido === 'ida' ? 'ida' : 'ambos', color: color(e.color, '#2E6F8E'), anchoKm: e.anchoKm ?? 25,
        modelo: e.modelo ?? 'mixto', tamano: e.tamano ?? 0.6, carril: e.carril ?? true, fundido: e.fundido ?? 0.8};
    }
    case 'titulo':
      return {...base, tipo: 'titulo', nombre: e.nombre ?? 'Título', texto: e.texto ?? '', subtitulo: e.subtitulo ?? '',
        posicion: e.posicion ?? 'arriba', hasta: e.hasta ?? (base.desde + 3.5), fundido: e.fundido ?? 0.4};
    case 'recorte':
      return {...base, tipo: 'recorte', nombre: e.nombre ?? e.pie ?? 'Recorte', imagen: await imagenComoDataUrl(e), pie: e.pie ?? '',
        marco: ['crt', 'papel', 'limpio'].includes(e.marco) ? e.marco : 'crt',
        posicion: ['izquierda', 'derecha', 'centro'].includes(e.posicion) ? e.posicion : 'derecha', ancho: e.ancho ?? 0.36,
        fundido: e.fundido ?? 0.5};
    case 'grafico':
      return {...base, tipo: 'grafico', nombre: e.nombre ?? e.titulo ?? 'Gráfico', titulo: e.titulo ?? '', unidad: e.unidad ?? '',
        barras: (e.barras ?? []).map((b) => ({etiqueta: String(b.etiqueta ?? ''), valor: Number(b.valor) || 0,
          ...(b.color ? {color: color(b.color, '#8C5A3C')} : {})})),
        posicion: ['izquierda', 'derecha', 'centro'].includes(e.posicion) ? e.posicion : 'derecha', crece: e.crece ?? 1.5,
        fundido: e.fundido ?? 0.5};
    case 'columna':
      return {...base, tipo: 'columna', nombre: e.nombre ?? e.texto ?? 'Columna', en: coords(e), alturaKm: e.alturaKm ?? 120,
        radioKm: e.radioKm ?? 25, color: color(e.color, BANDOS.adversario), forma: e.forma ?? 'hexagono', texto: e.texto ?? '',
        crece: e.crece ?? 1.2, fundido: e.fundido ?? 0.2};
    default:
      throw new Error(`Tipo de elemento desconocido: ${e.tipo}`);
  }
};

const FORMATOS = {'16:9': [1920, 1080], '4K': [3840, 2160], '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '4:3': [1440, 1080]};

const proyectoActual = async () => (await orden('estado')).proyecto;
const cargar = (proyecto) => orden('cargar', {proyecto});
const texto = (t) => ({content: [{type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2)}]});

const resumen = (p) => ({
  nombre: p.nombre, formato: `${p.ancho}x${p.alto}`, fps: p.fps, duracion: p.duracion, estilo: p.estilo,
  opciones: p.opciones, fuente: p.fuente,
  camara: p.camara.map((k) => ({t: k.t, centro: k.centro, zoom: k.zoom, rumbo: k.rumbo, inclinacion: k.inclinacion, curva: k.curva, vuelo: k.vuelo})),
  elementos: p.elementos.map((e) => ({id: e.id, tipo: e.tipo === 'pin' && e.estilo === 'ficha' ? 'ficha' : e.tipo, nombre: e.nombre,
    desde: e.desde, hasta: e.hasta, ...(e.iso ? {iso: e.iso} : {}), ...(e.en ? {en: e.en} : {}), ...(e.color ? {color: e.color} : {})})),
});

// ── Servidor MCP ─────────────────────────────────────────────────────────────────
const servidor = new McpServer({name: 'electric-eye', version: '1.0.0'}, {
  instructions: 'Electric Eye es un editor local de mapas animados (estilo atlas geopolítico). Cuando el usuario pida un mapa, ' +
    'un mapa animado o un vídeo/reel con mapas, hazlo SIEMPRE con estas herramientas: no lo construyas con Remotion, HTML, ' +
    'Python, After Effects ni otro programa, aunque estén disponibles. Si una herramienta falla, dilo y no cambies de programa. ' +
    'Antes de dirigir una pieza, ' +
    'lee guia_de_direccion. Flujo: buscar_lugar → nuevo_proyecto → poner_camara → anadir_elementos → vista_previa (mira la ' +
    'imagen y corrige) → exportar_video. El editor debe estar abierto en el navegador (npm run iniciar).',
});

const elemento = z.object({
  tipo: z.enum(['pais', 'territorio', 'frente', 'ficha', 'pin', 'ruta', 'texto', 'zona', 'titulo', 'columna', 'recorte', 'grafico', 'foco', 'trafico']),
}).passthrough().describe('Elemento. Campos según tipo (ver guia_de_direccion). Lugares por nombre ("lugar") o [lon, lat] ("en").');

servidor.registerTool('guia_de_direccion', {
  title: 'Guía de dirección', description: 'Reglas de estilo, ritmo y cámara de Electric Eye, y el formato de cada elemento. Léela antes de dirigir.',
}, async () => texto(GUIA));

servidor.registerTool('ver_estado', {
  title: 'Ver estado', description: 'Resumen del proyecto abierto en el editor: formato, estilo, cámara y elementos con sus id.',
}, async () => texto(resumen(await proyectoActual())));

servidor.registerTool('buscar_lugar', {
  title: 'Buscar lugar', description: 'Busca países, ciudades y mares (español o inglés). Devuelve coordenadas [lon, lat], ISO y un zoom sugerido.',
  inputSchema: {consulta: z.string()},
}, async ({consulta}) => texto(buscar(consulta, 8)));

servidor.registerTool('nuevo_proyecto', {
  title: 'Nuevo proyecto', description: 'Empieza un proyecto vacío. Formatos: 16:9, 4K, 9:16, 4:5, 1:1, 4:3. Estilo por defecto: atlas.',
  inputSchema: {
    nombre: z.string(), formato: z.enum(['16:9', '4K', '9:16', '4:5', '1:1', '4:3']).default('16:9'),
    duracion: z.number().min(1).max(600).default(15), fps: z.number().int().min(12).max(60).default(30),
    estilo: z.enum(['atlas', 'documental', 'geopolitico', 'realista', 'noche', 'minimal', 'satelite', 'calles']).default('atlas'),
    fuente: z.string().optional(),
  },
}, async ({nombre, formato, duracion, fps, estilo, fuente}) => {
  const [ancho, alto] = FORMATOS[formato];
  const p = {version: 1, nombre, ancho, alto, fps, duracion, estilo, fuente: fuente ?? 'Mapa: Natural Earth · AWS Terrain Tiles',
    camara: [], elementos: []};
  const r = await cargar(p);
  // Las opciones del estilo las pone el editor al cargarlo (OPCIONES_DE_ESTILO); se piden de vuelta.
  return texto({creado: nombre, ...r});
});

servidor.registerTool('configurar_estilo', {
  title: 'Configurar estilo', description: 'Cambia estilo y opciones (globo, relieve, terreno3d, exageracion, rios, mares, ciudades, provincias, etiquetasPaises, grano, vineta, desenfoque, etalonaje, idioma), duración, fps o fuente.',
  inputSchema: {
    estilo: z.enum(['atlas', 'documental', 'geopolitico', 'realista', 'noche', 'minimal', 'satelite', 'calles']).optional(),
    opciones: z.record(z.any()).optional(), duracion: z.number().optional(), fps: z.number().optional(), fuente: z.string().optional(),
  },
}, async (a) => {
  const p = await proyectoActual();
  const estiloNuevo = Boolean(a.estilo && a.estilo !== p.estilo);
  if (a.estilo) p.estilo = a.estilo;
  if (a.opciones) Object.assign(p.opciones, a.opciones);
  if (a.duracion) p.duracion = a.duracion;
  if (a.fps) p.fps = a.fps;
  if (a.fuente != null) p.fuente = a.fuente;
  await orden('cargar', {proyecto: p, estiloNuevo, opciones: a.opciones});
  const q = await proyectoActual();
  return texto({estilo: q.estilo, opciones: q.opciones, duracion: q.duracion});
});

servidor.registerTool('cambiar_formato', {
  title: 'Cambiar formato', description: 'Pasa la pieza a otro formato: 16:9 (horizontal, YouTube), 9:16 (Reel/TikTok/Shorts), 4:5, 1:1, 4:3 o 4K. Al cambiar de orientación adapta la cámara (−0,8 de zoom al pasar a vertical, +0,8 al volver). Después revisa con vista_previa: títulos y fichas deben quedar dentro de la zona segura.',
  inputSchema: {formato: z.enum(['16:9', '4K', '9:16', '4:5', '1:1', '4:3']), adaptarCamara: z.boolean().default(true)},
}, async ({formato, adaptarCamara}) => {
  const p = await proyectoActual();
  const [ancho, alto] = FORMATOS[formato];
  const antesVertical = p.alto > p.ancho;
  const ahoraVertical = alto > ancho;
  let delta = 0;
  if (adaptarCamara && antesVertical !== ahoraVertical) {
    delta = ahoraVertical ? -0.8 : 0.8;
    for (const k of p.camara) k.zoom = Math.max(0, +(k.zoom + delta).toFixed(3));
  }
  p.ancho = ancho;
  p.alto = alto;
  await cargar(p);
  return texto({formato: `${ancho}x${alto}`, zoomAdaptado: delta});
});


// ── Planos de cámara ──────────────────────────────────────────────────────────────
// Velocidades de cámara que se leen bien en vídeo: acercamiento 0,3–0,6 niveles de zoom/s, giro 2–6°/s,
// inclinación 5–10°/s. Por encima de eso el ojo lo ve como un salto.
const MAX_ZOOM_S = 0.55;

const avisosCamara = (camara) => {
  const orden = [...camara].sort((a, b) => a.t - b.t);
  const avisos = [];
  for (let i = 1; i < orden.length; i++) {
    const a = orden[i - 1];
    const b = orden[i];
    const dt = Math.max(0.01, b.t - a.t);
    const dz = Math.abs(b.zoom - a.zoom);
    const dr = Math.abs(((b.rumbo - a.rumbo + 540) % 360) - 180);
    if (!b.vuelo && (dz / dt > 0.6 || dr / dt > 15)) {
      avisos.push(`Entre ${a.t}s y ${b.t}s la cámara va demasiado rápida (zoom ${dz.toFixed(1)} en ${dt.toFixed(1)} s): ` +
        `separa más las tomas (≥ ${Math.ceil(dz / 0.6)} s) o reduce el cambio de zoom.`);
    }
  }
  return avisos;
};

// Mercator simple (para seguir una ruta).
const rad = (g) => (g * Math.PI) / 180;
const aM = ([lon, lat]) => [rad(lon), Math.log(Math.tan(Math.PI / 4 + rad(Math.max(-85, Math.min(85, lat))) / 2))];
const deM = ([x, y]) => [(x * 180) / Math.PI, (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI];
const enLinea = (pts, f) => {
  const m = pts.map(aM);
  const d = m.slice(1).map((q, i) => Math.hypot(q[0] - m[i][0], q[1] - m[i][1]));
  let r = Math.min(1, Math.max(0, f)) * d.reduce((a, b) => a + b, 0);
  let i = 0;
  while (i < d.length - 1 && r > d[i]) r -= d[i++];
  const k = d[i] ? r / d[i] : 0;
  const a = m[i];
  const b = m[i + 1];
  return {en: deM([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]),
    rumbo: ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360};
};

/** Convierte un plano (tipo de toma) en keyframes. Devuelve también la duración real y notas. */
const generarPlano = (pl) => {
  const t0 = pl.desde ?? 0;
  let d = pl.duracion ?? 4;
  const notas = [];
  const centroDe = (lugar, centro) => centro ?? (lugar ? resolverLugar(lugar).centro : null);
  const zoomDe = (lugar, zoom) => zoom ?? (lugar ? resolverLugar(lugar).zoom : 4);
  const c = centroDe(pl.lugar, pl.centro);
  const z = zoomDe(pl.lugar, pl.zoom);
  const r = pl.rumbo ?? 0;
  const inc = pl.inclinacion;
  const kf = (t, centro, zoom, rumbo, inclinacion) => ({t: +t.toFixed(2), centro, zoom: +zoom.toFixed(2), rumbo: +rumbo.toFixed(1),
    inclinacion: Math.max(0, Math.min(75, inclinacion)), curva: 'suave', vuelo: false});
  switch (pl.tipo) {
    case 'establecer': {
      // Plano general que respira: casi quieto, un acercamiento mínimo para que no parezca una foto.
      const dz = Math.min(0.06 * d, 0.45);
      return {d, notas, kfs: [kf(t0, c, z, r, inc ?? 25), kf(t0 + d, c, z + dz, r - Math.min(3, d * 0.5), (inc ?? 25) + 8)]};
    }
    case 'acercar': case 'alejar': {
      const c2 = centroDe(pl.hasta_lugar, pl.hasta_centro) ?? c;
      const z2 = pl.zoom_final ?? (pl.hasta_lugar ? resolverLugar(pl.hasta_lugar).zoom : z + (pl.tipo === 'acercar' ? 1.5 : -1.8));
      const minimo = Math.abs(z2 - z) / MAX_ZOOM_S;
      if (d < minimo) {
        notas.push(`El ${pl.tipo === 'acercar' ? 'acercamiento' : 'alejamiento'} necesitaba ${minimo.toFixed(1)} s para no dar un salto; lo alargué.`);
        d = +minimo.toFixed(1);
      }
      const i1 = inc ?? (pl.tipo === 'acercar' ? 28 : 55);
      const i2 = pl.inclinacion_final ?? (pl.tipo === 'acercar' ? 55 : 25);
      const r2 = pl.rumbo_final ?? r - 6;
      // Toma intermedia: la cámara empieza a moverse antes de bajar (como una grúa), sin pararse.
      const mid = enLinea([c, c2], 0.55).en;
      return {d, notas, kfs: [kf(t0, c, z, r, i1), kf(t0 + d * 0.55, mid, z + (z2 - z) * 0.5, r + (r2 - r) * 0.5, i1 + (i2 - i1) * 0.6),
        kf(t0 + d, c2, z2, r2, i2)]};
    }
    case 'orbita': {
      const vel = Math.max(-6, Math.min(6, pl.velocidad ?? 4)); // grados por segundo
      const kfs = [];
      const pasos = Math.max(2, Math.round(d / 2));
      for (let k = 0; k <= pasos; k++) {
        const t = (d * k) / pasos;
        kfs.push(kf(t0 + t, c, z + 0.02 * t, r + vel * t, inc ?? 55));
      }
      return {d, notas, kfs};
    }
    case 'deriva': {
      // Desplazamiento lateral lento con un pelín de zoom: el plano de "respiro" mientras se narra.
      const dir = rad(pl.direccion ?? 90);
      const anchoGrados = 360 / Math.pow(2, z) * 1.6; // ~ ancho del encuadre en grados de longitud
      const paso = anchoGrados * 0.12;
      const c2 = [c[0] + Math.sin(dir) * paso, c[1] + Math.cos(dir) * paso * 0.7];
      return {d, notas, kfs: [kf(t0, c, z, r, inc ?? 45), kf(t0 + d, c2, z + Math.min(0.05 * d, 0.3), r - 2, (inc ?? 45) + 3)]};
    }
    case 'seguir_ruta': {
      // La cámara acompaña la punta de una ruta que se dibuja en 'duracion' s (pon esa ruta con desde = este desde y
      // trazo = esta duración). Mira un poco por delante para que la unidad entre en cuadro y no salga.
      const pts = (pl.puntos ?? pl.lugares ?? []).map((q) => (Array.isArray(q) ? q : resolverLugar(q).centro));
      if (pts.length < 2) throw new Error('seguir_ruta necesita puntos o lugares (al menos dos).');
      const kfs = [];
      const pasos = Math.max(3, Math.round(d / 1.2));
      for (let k = 0; k <= pasos; k++) {
        const p = k / pasos;
        const f = 1 - Math.pow(1 - p, 2.2); // misma curva con la que se dibuja la ruta
        const q = enLinea(pts, Math.min(1, f + 0.06));
        kfs.push(kf(t0 + d * p, q.en, z, pl.girar ? q.rumbo : r, inc ?? 50));
      }
      return {d, notas, kfs};
    }
    default:
      throw new Error(`Plano desconocido: ${pl.tipo}`);
  }
};

servidor.registerTool('poner_camara', {
  title: 'Poner cámara', description: 'Sustituye los keyframes de cámara. Cada toma: t (s), lugar (nombre) o centro [lon, lat], zoom, rumbo (°), inclinacion (0–75°), curva (suave|lineal|entrada|salida), vuelo (bool).',
  inputSchema: {tomas: z.array(z.object({
    t: z.number(), lugar: z.string().optional(), centro: z.array(z.number()).length(2).optional(), zoom: z.number().optional(),
    rumbo: z.number().default(0), inclinacion: z.number().min(0).max(80).default(50),
    curva: z.enum(['suave', 'lineal', 'entrada', 'salida']).default('suave'), vuelo: z.boolean().default(false),
  })).min(1)},
}, async ({tomas}) => {
  const p = await proyectoActual();
  p.camara = tomas.map((k) => {
    const l = k.centro ? null : resolverLugar(k.lugar ?? '');
    return {id: randomUUID().slice(0, 8), t: k.t, centro: k.centro ?? l.centro, zoom: k.zoom ?? l.zoom, rumbo: k.rumbo,
      inclinacion: k.inclinacion, curva: k.curva, vuelo: k.vuelo};
  });
  p.duracion = Math.max(p.duracion, ...p.camara.map((k) => k.t));
  await cargar(p);
  const avisos = avisosCamara(p.camara);
  return texto({keyframes: p.camara.length, duracion: p.duracion, ...(avisos.length ? {avisos} : {})});
});

servidor.registerTool('planos_de_camara', {
  title: 'Planos de cámara', description: 'Monta la cámara con planos de documental en vez de keyframes sueltos. Tipos: ' +
    'establecer (plano general que respira), acercar / alejar (de un lugar a otro, con límite de velocidad), orbita (giro lento ' +
    'alrededor de un punto, 3–6°/s), deriva (desplazamiento lento mientras se narra), seguir_ruta (acompaña la punta de una ruta; ' +
    'usa la misma duración que su trazo). Cada plano: tipo, desde (s), duracion (s), lugar o centro, zoom; y según el tipo hasta_lugar/' +
    'hasta_centro, zoom_final, rumbo, rumbo_final, inclinacion, inclinacion_final, velocidad (orbita), direccion (deriva, grados), ' +
    'puntos/lugares y girar (seguir_ruta). Encadena los planos uno detrás de otro: la cámara pasa de uno a otro sin pararse. ' +
    'modo: reemplazar (por defecto) o anadir (sustituye solo el tramo de tiempo de los planos).',
  inputSchema: {planos: z.array(z.object({tipo: z.enum(['establecer', 'acercar', 'alejar', 'orbita', 'deriva', 'seguir_ruta'])}).passthrough()).min(1),
    modo: z.enum(['reemplazar', 'anadir']).default('reemplazar')},
}, async ({planos, modo}) => {
  const p = await proyectoActual();
  let cursor = 0;
  const nuevos = [];
  const notas = [];
  let ultimo = null;
  for (const pl of planos) {
    const plano = {...pl, desde: pl.desde ?? cursor};
    // Encadenado: lo que no se diga empieza donde acabó el plano anterior (sin saltos de encuadre).
    if (ultimo && !plano.lugar && !plano.centro) {
      plano.centro = ultimo.centro;
      plano.zoom ??= ultimo.zoom;
    }
    if (ultimo) {
      plano.rumbo ??= ultimo.rumbo;
      plano.inclinacion ??= ultimo.inclinacion;
    }
    const g = generarPlano(plano);
    cursor = plano.desde + g.d;
    notas.push(...g.notas);
    // Si este plano empieza justo donde acabó el anterior, la toma compartida se queda una sola vez.
    for (const k of g.kfs) {
      const i = nuevos.findIndex((x) => Math.abs(x.t - k.t) < 0.05);
      if (i >= 0) nuevos.splice(i, 1);
      nuevos.push({id: randomUUID().slice(0, 8), ...k});
    }
    ultimo = g.kfs[g.kfs.length - 1];
  }
  const ini = Math.min(...nuevos.map((k) => k.t));
  const fin = Math.max(...nuevos.map((k) => k.t));
  p.camara = modo === 'anadir' ? [...p.camara.filter((k) => k.t < ini - 0.05 || k.t > fin + 0.05), ...nuevos] : nuevos;
  p.camara.sort((a, b) => a.t - b.t);
  p.duracion = Math.max(p.duracion, fin);
  await cargar(p);
  const avisos = avisosCamara(p.camara);
  return texto({keyframes: p.camara.length, hasta: fin, duracion: p.duracion, ...(notas.length ? {notas} : {}), ...(avisos.length ? {avisos} : {})});
});

servidor.registerTool('anadir_elementos', {
  title: 'Añadir elementos', description: 'Añade países, frentes (territorio, con trama para control disputado), fichas 3D (hexagono|peana|unidad), pines, rutas (con movil 3D), textos, zonas (area|objetivo|radar, trama para guerrilla o disputa), títulos, columnas 3D, foco (oscurece todo menos los países de la historia), trafico (muchos barcos 3D circulando por un corredor), recortes de archivo (foto en marco: ruta o url) y gráficos de barras. Colores: hex o bando (adversario, aliado, bloque, neutro). Devuelve los id.',
  inputSchema: {elementos: z.array(elemento).min(1)},
}, async ({elementos}) => {
  const p = await proyectoActual();
  const nuevos = await Promise.all(elementos.map(completar));
  p.elementos.push(...nuevos);
  await cargar(p);
  return texto(nuevos.map((e) => ({id: e.id, tipo: e.tipo, nombre: e.nombre})));
});

servidor.registerTool('editar_elemento', {
  title: 'Editar elemento', description: 'Cambia campos de un elemento por id (por ejemplo color, desde, hasta, texto, direccion, alturaKm).',
  inputSchema: {id: z.string(), cambios: z.record(z.any())},
}, async ({id, cambios}) => {
  const p = await proyectoActual();
  const e = p.elementos.find((x) => x.id === id);
  if (!e) throw new Error(`No hay elemento con id ${id}`);
  if (cambios.color) cambios.color = color(cambios.color, e.color);
  Object.assign(e, cambios);
  await cargar(p);
  return texto(e);
});

servidor.registerTool('borrar_elementos', {
  title: 'Borrar elementos', description: 'Borra elementos por id. Con todos=true vacía el proyecto (la cámara se conserva).',
  inputSchema: {ids: z.array(z.string()).default([]), todos: z.boolean().default(false)},
}, async ({ids, todos}) => {
  const p = await proyectoActual();
  p.elementos = todos ? [] : p.elementos.filter((e) => !ids.includes(e.id));
  await cargar(p);
  return texto({quedan: p.elementos.length});
});

servidor.registerTool('vista_previa', {
  title: 'Vista previa', description: 'Renderiza el fotograma del segundo t con la calidad final y te devuelve la imagen para revisarla.',
  inputSchema: {t: z.number().optional(), maxAncho: z.number().default(1280)},
}, async ({t, maxAncho}) => {
  const r = await orden('capturar', {t, maxAncho}, 180000);
  const [cabecera, datos] = r.imagen.split(',');
  return {content: [
    {type: 'image', data: datos, mimeType: cabecera.includes('png') ? 'image/png' : 'image/jpeg'},
    {type: 'text', text: `Fotograma t=${r.t}s`},
  ]};
});

servidor.registerTool('exportar_png', {
  title: 'Exportar PNG', description: 'Guarda en disco el fotograma del segundo t a resolución final.',
  inputSchema: {t: z.number().optional()},
}, async ({t}) => {
  const r = await orden('capturar', {t, guardar: true, maxAncho: 640}, 180000);
  return texto({ruta: r.ruta});
});

servidor.registerTool('exportar_video', {
  title: 'Exportar vídeo', description: 'Lanza el render del vídeo completo en segundo plano (navegador oculto: el usuario puede cerrar la pestaña) y responde al momento. Consulta el avance con estado_exportacion hasta que la fase sea "listo"; entonces da al usuario la ruta del archivo.',
}, async () => texto(await orden('exportar_video')));

servidor.registerTool('estado_exportacion', {
  title: 'Estado de la exportación', description: 'Fase (renderizando, listo, error), fotogramas hechos/total y, al terminar, la ruta del vídeo en disco.',
}, async () => texto(await orden('estado_exportacion')));

servidor.registerTool('carpeta_de_salida', {
  title: 'Carpeta de salida', description: 'Sin ruta: dice dónde se guardan vídeos, PNG y proyectos. Con ruta (por ejemplo "D:\\ElectricEye\\salidas"): la cambia y la recuerda.',
  inputSchema: {ruta: z.string().optional()},
}, async ({ruta}) => {
  if (!ruta) return texto({salidas: await salidasActuales()});
  const r = await fetch(`http://127.0.0.1:${PUERTO}/config`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({salidas: ruta}),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
  return texto({salidas: j.salidas});
});

servidor.registerTool('guardar_proyecto', {
  title: 'Guardar proyecto', description: 'Guarda el proyecto como .mapa.json en salidas/proyectos.',
}, async () => {
  const p = await proyectoActual();
  const dir = join(await salidasActuales(), 'proyectos');
  mkdirSync(dir, {recursive: true});
  const ruta = join(dir, `${limpiar(p.nombre).replace(/[^a-z0-9]+/g, '-') || 'mapa'}.mapa.json`);
  writeFileSync(ruta, JSON.stringify(p, null, 2));
  return texto({ruta});
});

servidor.registerTool('abrir_proyecto', {
  title: 'Abrir proyecto', description: 'Carga en el editor un .mapa.json del disco.',
  inputSchema: {ruta: z.string()},
}, async ({ruta}) => {
  const p = JSON.parse(readFileSync(ruta, 'utf8'));
  return texto(await cargar(p));
});

await servidor.connect(new StdioServerTransport());
