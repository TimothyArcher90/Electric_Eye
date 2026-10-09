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

const orden = async (accion, datos = {}, limiteMs = 120000) => {
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

const completar = (e) => {
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
        fundido: e.fundido ?? 0.3};
    }
    case 'ficha':
      return {...base, tipo: 'pin', nombre: e.nombre ?? 'Ficha', en: coords(e), texto: e.texto ?? '', color: color(e.color, BANDOS.aliado),
        estilo: 'ficha', etiqueta: e.etiqueta ?? (e.texto ? 'papel' : 'ninguna'), icono: e.icono ?? '🪖', fondo: e.fondo ?? 'color',
        tamano: e.tamano ?? 1, fundido: e.fundido ?? 0.2};
    case 'pin':
      return {...base, tipo: 'pin', nombre: e.nombre ?? e.texto ?? e.lugar ?? 'Pin', en: coords(e), texto: e.texto ?? String(e.lugar ?? '').toUpperCase(),
        color: color(e.color, BANDOS.bloque), estilo: e.estilo ?? 'pulso', etiqueta: e.etiqueta ?? 'papel', fundido: e.fundido ?? 0.3,
        icono: e.icono, fondo: e.fondo, tamano: e.tamano};
    case 'ruta': {
      const puntos = (e.puntos ?? e.lugares ?? []).map((q) => (Array.isArray(q) ? q : resolverLugar(q).centro));
      if (puntos.length < 2) throw new Error('Una ruta necesita al menos dos puntos o lugares.');
      return {...base, tipo: 'ruta', nombre: e.nombre ?? 'Ruta', puntos, color: color(e.color, BANDOS.bloque), grosor: e.grosor ?? 4,
        discontinua: e.discontinua ?? true, flecha: e.flecha ?? true, forma: e.forma ?? (puntos.length === 2 ? 'arco' : 'recta'),
        trazo: e.trazo ?? 2, fundido: e.fundido ?? 0.2};
    }
    case 'texto':
      return {...base, tipo: 'texto', nombre: e.nombre ?? 'Texto', en: coords(e), texto: e.texto ?? '', tamano: e.tamano ?? 26,
        color: e.color ?? '#3E362F', mayusculas: e.mayusculas ?? true, cursiva: e.cursiva ?? false, espaciado: e.espaciado ?? 0.2,
        fundido: e.fundido ?? 0.4};
    case 'zona':
      return {...base, tipo: 'zona', nombre: e.nombre ?? 'Zona', en: coords(e), radioKm: e.radioKm ?? 150,
        color: color(e.color, e.estilo === 'radar' ? '#3FD06A' : BANDOS.bloque), discontinua: e.discontinua ?? false,
        estilo: e.estilo ?? 'area', fundido: e.fundido ?? 0.5};
    case 'titulo':
      return {...base, tipo: 'titulo', nombre: e.nombre ?? 'Título', texto: e.texto ?? '', subtitulo: e.subtitulo ?? '',
        posicion: e.posicion ?? 'arriba', hasta: e.hasta ?? (base.desde + 3.5), fundido: e.fundido ?? 0.4};
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
  instructions: 'Electric Eye es un editor local de mapas animados (estilo atlas geopolítico). Antes de dirigir una pieza, ' +
    'lee guia_de_direccion. Flujo: buscar_lugar → nuevo_proyecto → poner_camara → anadir_elementos → vista_previa (mira la ' +
    'imagen y corrige) → exportar_video. El editor debe estar abierto en el navegador (npm run iniciar).',
});

const elemento = z.object({
  tipo: z.enum(['pais', 'territorio', 'frente', 'ficha', 'pin', 'ruta', 'texto', 'zona', 'titulo', 'columna']),
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
  return texto({keyframes: p.camara.length, duracion: p.duracion});
});

servidor.registerTool('anadir_elementos', {
  title: 'Añadir elementos', description: 'Añade países, frentes (territorio), fichas, pines, rutas, textos, zonas (area|objetivo|radar), títulos y columnas 3D. Colores: hex o bando (adversario, aliado, bloque, neutro). Devuelve los id.',
  inputSchema: {elementos: z.array(elemento).min(1)},
}, async ({elementos}) => {
  const p = await proyectoActual();
  const nuevos = elementos.map(completar);
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
  title: 'Exportar vídeo', description: 'Lanza el render del vídeo completo (fotograma a fotograma) y responde al momento. Consulta el avance con estado_exportacion hasta que la fase sea "listo"; entonces da al usuario la ruta del archivo.',
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
