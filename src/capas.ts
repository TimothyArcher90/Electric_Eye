import type {FilterSpecification, GeoJSONSource, Map as MapLibre} from 'maplibre-gl';
import polygonClipping, {type MultiPolygon, type Polygon as PolyClip} from 'polygon-clipping';
import {circulo, densificar, flechaGruesa, puntoEnLinea, recortar, rumboFinal, visibilidad} from './geo';
import {silueta} from './iconos';
import {fijarModelos, modeloPara, type Modelo3d} from './modelos3d';
import type {ElemPin, Elemento, Proyecto} from './proyecto';

// ── Imágenes subidas (retratos de fichas, logo) ────────────────────────────────────
// Se decodifican una vez antes de pintar: MapLibre necesita la imagen ya lista.

const imagenes = new Map<string, HTMLImageElement>();
export const claveImagen = (dataUrl: string) => {
  let h = 0;
  for (let i = 0; i < dataUrl.length; i += 7) h = (h * 31 + dataUrl.charCodeAt(i)) | 0;
  return `${dataUrl.length.toString(36)}${(h >>> 0).toString(36)}`;
};
export const imagenCargada = (dataUrl: string) => imagenes.get(claveImagen(dataUrl));
export const precargarImagenes = async (p: Proyecto) => {
  const urls = [
    ...p.elementos.flatMap((e) => (e.tipo === 'pin' && e.imagen ? [e.imagen] : e.tipo === 'recorte' && e.imagen ? [e.imagen] : [])),
    ...(p.marca?.imagen ? [p.marca.imagen] : []),
  ];
  await Promise.all(urls.map(async (u) => {
    const k = claveImagen(u);
    if (imagenes.has(k)) return;
    const img = new Image();
    img.src = u;
    try {
      await img.decode();
      imagenes.set(k, img);
    } catch {
      /* imagen rota: la ficha sale sin ella */
    }
  }));
};

// ── Geometrías de país para el barrido territorial (1:50m, más ligeras) ──────────────

const geometrias = new Map<string, MultiPolygon>();
let cargaGeometrias: Promise<void> | null = null;
export const precargarGeometrias = () => {
  cargaGeometrias ??= fetch(new URL('data/paises-50m.geojson', document.baseURI).href)
    .then((r) => r.json())
    .then((d: GeoJSON.FeatureCollection) => {
      for (const f of d.features) {
        const iso = f.properties?.iso as string | undefined;
        const g = f.geometry;
        if (!iso || !g) continue;
        if (g.type === 'Polygon') geometrias.set(iso, [g.coordinates as PolyClip]);
        if (g.type === 'MultiPolygon') geometrias.set(iso, g.coordinates as MultiPolygon);
      }
    })
    .catch(() => undefined);
  return cargaGeometrias;
};

/** Parte del país ya "conquistada": todo lo que queda detrás de un frente recto que avanza. */
const barrido = (iso: string, direccion: number, f: number): MultiPolygon | null => {
  const geo = geometrias.get(iso);
  if (!geo || f <= 0) return null;
  const pts = geo.flatMap((pol) => pol[0]);
  const lon0 = (Math.min(...pts.map((q) => q[0])) + Math.max(...pts.map((q) => q[0]))) / 2;
  const lat0 = (Math.min(...pts.map((q) => q[1])) + Math.max(...pts.map((q) => q[1]))) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const ux = Math.sin((direccion * Math.PI) / 180);
  const uy = Math.cos((direccion * Math.PI) / 180);
  const proy = pts.map((q) => (q[0] - lon0) * k * ux + (q[1] - lat0) * uy);
  const min = Math.min(...proy);
  const max = Math.max(...proy);
  const s = min + (max - min) * Math.min(1, f) + (f >= 1 ? 1 : 0);
  const L = (max - min) * 3 + 10;
  const aLonLat = (x: number, y: number): [number, number] => [x / k + lon0, y + lat0];
  // Rectángulo detrás del frente: de s hacia atrás, con anchura de sobra a los lados.
  const vx = uy;
  const vy = -ux;
  const esquinas = [
    aLonLat(s * ux + L * vx, s * uy + L * vy),
    aLonLat(s * ux - L * vx, s * uy - L * vy),
    aLonLat((s - L) * ux - L * vx, (s - L) * uy - L * vy),
    aLonLat((s - L) * ux + L * vx, (s - L) * uy + L * vy),
  ];
  const rect: PolyClip = [[...esquinas, esquinas[0]]];
  try {
    return polygonClipping.intersection(geo, rect);
  } catch {
    return null;
  }
};

const suave = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// ── Fichas hexagonales de pie ──────────────────────────────────────────────────────

const idFicha = (e: ElemPin) =>
  ['ficha', e.color, e.fondo ?? 'color', e.icono ?? '', e.imagen ? claveImagen(e.imagen) : '', e.forma ?? 'hexagono']
    .map(encodeURIComponent).join('|');

/** Hexágono aplastado (visto en perspectiva) para las peanas. */
const hexPlano = (c: CanvasRenderingContext2D, cx: number, cy: number, r: number, k: number) => {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    c[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a) * k);
  }
  c.closePath();
};

/** Silueta de pie sobre una base hexagonal de color (los frentes de la referencia). */
const dibujarPeana = (color: string, icono: string) => lienzo(168, 200, (c) => {
  const cx = 84;
  const by = 168;
  c.shadowColor = 'rgba(0,0,0,0.35)';
  c.shadowBlur = 10;
  c.shadowOffsetY = 5;
  // Peana en 3D: cara superior y canto (dos hexágonos desplazados y el lateral entre ambos).
  hexPlano(c, cx, by + 6, 62, 0.42);
  c.fillStyle = oscurecer(color, 0.45);
  c.fill();
  c.shadowColor = 'transparent';
  c.fillRect(cx - 62, by, 124, 6);
  hexPlano(c, cx, by, 62, 0.42);
  c.fillStyle = '#FFFFFF';
  c.fill();
  hexPlano(c, cx, by - 2, 55, 0.42);
  const cara = c.createLinearGradient(cx - 55, by - 25, cx + 55, by + 25);
  cara.addColorStop(0, color);
  cara.addColorStop(1, oscurecer(color, 0.18));
  c.fillStyle = cara;
  c.fill();
  const forma = silueta(icono === '🪖' || icono === 'soldado' || !icono ? 'infante' : icono) ?? silueta('infante')!;
  c.save();
  c.translate(cx - 60, by - 128);
  c.scale(1.2, 1.2);
  c.shadowColor = 'rgba(0,0,0,0.3)';
  c.shadowBlur = 4;
  // Figura con luz desde arriba a la izquierda: volumen sin dejar de ser silueta.
  const luz = c.createLinearGradient(20, 0, 80, 100);
  luz.addColorStop(0, '#4A4036');
  luz.addColorStop(0.55, '#1B1712');
  luz.addColorStop(1, '#0C0A08');
  c.fillStyle = luz;
  c.fill(forma);
  c.restore();
});

/** Unidad que viaja por una ruta, vista desde arriba (morro hacia arriba): blanca, con contorno y sombra. */
const dibujarMovil = (icono: string) => lienzo(128, 128, (c) => {
  const forma = silueta(icono) ?? silueta('avion')!;
  c.save();
  c.translate(14, 14);
  c.save();
  c.translate(7, 11);
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = 9;
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fill(forma);
  c.restore();
  const blanco = c.createLinearGradient(0, 0, 100, 100);
  blanco.addColorStop(0, '#FFFFFF');
  blanco.addColorStop(1, '#C3CAD2');
  c.fillStyle = blanco;
  c.strokeStyle = 'rgba(25,20,15,0.85)';
  c.lineWidth = 3;
  c.stroke(forma);
  c.fill(forma);
  c.restore();
});

/** Barco o avión pequeño y blanco, con sombra y banderita del color del bando. */
const dibujarUnidad = (color: string, icono: string) => lienzo(150, 130, (c) => {
  const forma = silueta(icono || 'barco') ?? silueta('barco')!;
  c.save();
  c.translate(25, 22);
  c.save();
  c.translate(6, 10);
  c.shadowColor = 'rgba(0,0,0,0.45)';
  c.shadowBlur = 8;
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fill(forma);
  c.restore();
  const blanco = c.createLinearGradient(0, 0, 100, 100);
  blanco.addColorStop(0, '#FFFFFF');
  blanco.addColorStop(1, '#C9CFD6');
  c.fillStyle = blanco;
  c.strokeStyle = 'rgba(30,24,18,0.75)';
  c.lineWidth = 2.5;
  c.stroke(forma);
  c.fill(forma);
  c.restore();
  // Banderita: mástil fino y paño del color del bando.
  c.fillStyle = '#2A2219';
  c.fillRect(71, 4, 2.5, 34);
  c.fillStyle = color;
  c.strokeStyle = '#FFFFFF';
  c.lineWidth = 2;
  c.beginPath();
  c.rect(73.5, 5, 26, 16);
  c.fill();
  c.stroke();
});

const hexagono = (c: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2; // vértice arriba
    c[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  c.closePath();
};

const dibujarFicha = (id: string, soloCara = false) => {
  const [, color, fondo, icono, clave, forma] = id.split('|').map(decodeURIComponent);
  if (forma === 'peana' && !soloCara) return dibujarPeana(color, icono);
  if (forma === 'unidad') return dibujarUnidad(color, icono);
  const W = 168;
  const H = soloCara ? 168 : 176;
  return lienzo(W, H, (c) => {
    const cx = W / 2;
    const cy = 84;
    if (!soloCara) {
      c.shadowColor = 'rgba(0,0,0,0.35)';
      c.shadowBlur = 8;
      c.shadowOffsetY = 4;
      // Canto de la ficha (grosor): da volumen, como una pieza de juego de mesa.
      hexagono(c, cx, cy + 9, 76);
      c.fillStyle = '#B9B2A6';
      c.fill();
      c.shadowColor = 'transparent';
    }
    hexagono(c, cx, cy, 76);
    c.fillStyle = '#FFFFFF';
    c.fill();
    hexagono(c, cx, cy, 66);
    c.fillStyle = fondo === 'blanco' ? '#FFFFFF' : color;
    c.fill();
    const img = clave ? imagenes.get(clave) : undefined;
    if (img) {
      c.save();
      hexagono(c, cx, cy, 66);
      c.clip();
      const k = Math.max(132 / img.width, 132 / img.height);
      c.drawImage(img, cx - (img.width * k) / 2, cy - (img.height * k) / 2, img.width * k, img.height * k);
      c.restore();
    } else if (icono && silueta(icono)) {
      // Silueta propia (src/iconos.ts), en tinta oscura como las fichas de la referencia.
      c.save();
      c.translate(cx - 50, cy - 50 + 2);
      c.translate(50, 50);
      c.scale(1.02, 1.02);
      c.translate(-50, -50);
      const tinta = c.createLinearGradient(0, 0, 100, 100);
      tinta.addColorStop(0, fondo === 'blanco' ? '#3A5280' : '#3A332B');
      tinta.addColorStop(1, fondo === 'blanco' ? '#121D33' : '#0B0A08');
      c.fillStyle = tinta;
      c.fill(silueta(icono)!);
      c.restore();
    } else if (icono) {
      // Emoji o texto sin silueta propia: se pinta como silueta (tinta oscura).
      const t = document.createElement('canvas');
      t.width = W;
      t.height = H;
      const g = t.getContext('2d')!;
      const corto = [...icono].length <= 2;
      g.font = corto ? '76px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif' : 'bold 46px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#000';
      g.fillText(icono, cx, cy + 4, 120);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = fondo === 'blanco' ? '#1C2B45' : '#121212';
      g.fillRect(0, 0, W, H);
      c.drawImage(t, 0, 0);
    }
  });
};

// ── Caras de las piezas 3D (fichas y peanas) ─────────────────────────────────────────

const caras = new Map<string, HTMLCanvasElement>();
const aCanvas = (img: ImageData) => {
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  cv.getContext('2d')!.putImageData(img, 0, 0);
  return cv;
};
/** Cara impresa de una ficha 3D (hexágono con icono o retrato) o figura de pie de una peana 3D. */
const caraDe = (e: ElemPin) => {
  const id = idFicha(e);
  let cv = caras.get(id);
  if (!cv) {
    cv = e.forma === 'peana' ? aCanvas(lienzo(128, 128, (c) => {
      const forma = silueta(!e.icono || e.icono === '🪖' || e.icono === 'soldado' ? 'infante' : e.icono) ?? silueta('infante')!;
      c.translate(14, 14);
      const luz = c.createLinearGradient(20, 0, 80, 100);
      luz.addColorStop(0, '#4A4036');
      luz.addColorStop(0.55, '#1B1712');
      luz.addColorStop(1, '#0C0A08');
      c.fillStyle = luz;
      c.fill(forma);
    })) : aCanvas(dibujarFicha(id, true));
    caras.set(id, cv);
  }
  return {cara: cv, clave: id};
};

// ── Imágenes generadas en tiempo de ejecución ──────────────────────────────────────

const lienzo = (w: number, h: number, dibujar: (c: CanvasRenderingContext2D) => void) => {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  dibujar(ctx);
  return ctx.getImageData(0, 0, w, h);
};

export const registrarImagenes = (map: MapLibre) => {
  const añadir = (id: string) => {
    if (map.hasImage(id)) return;
    if (id === 'mm-flecha') {
      // Triángulo SDF: se colorea con icon-color.
      map.addImage(id, lienzo(64, 64, (c) => {
        c.fillStyle = '#fff';
        c.beginPath();
        c.moveTo(32, 4);
        c.lineTo(58, 56);
        c.lineTo(32, 44);
        c.lineTo(6, 56);
        c.closePath();
        c.fill();
      }), {sdf: true, pixelRatio: 2});
    }
    if (id === 'mm-papel') {
      // Etiqueta de papel estirable (9-slice): fondo crema con sombra suave.
      map.addImage(id, lienzo(48, 48, (c) => {
        c.shadowColor = 'rgba(0,0,0,0.35)';
        c.shadowBlur = 6;
        c.shadowOffsetY = 3;
        c.fillStyle = '#FFFDF6';
        c.fillRect(8, 6, 32, 32);
      }), {pixelRatio: 2, stretchX: [[16, 32]], stretchY: [[14, 30]], content: [12, 10, 36, 34]});
    }
    if (id.startsWith('ficha|')) map.addImage(id, dibujarFicha(id), {pixelRatio: 2});
  };
  ['mm-flecha', 'mm-papel'].forEach(añadir);
  map.on('styleimagemissing', (e) => añadir(e.id));
};

// ── Sincronización proyecto → mapa en el segundo t ─────────────────────────────────

type FC = GeoJSON.FeatureCollection;
const fc = (features: GeoJSON.Feature[]): FC => ({type: 'FeatureCollection', features});

const paisesActivos = new WeakMap<MapLibre, Set<string>>();

const fijar = (map: MapLibre, fuente: string, datos: FC) => {
  const s = map.getSource(fuente) as GeoJSONSource | undefined;
  s?.setData(datos);
};

// ── Foco, tramas y tráfico ──────────────────────────────────────────────────────────

/** Máscara del foco: el mundo menos los países de la historia (se calcula una vez por combinación). */
const mascaras = new Map<string, MultiPolygon | null>();
const mascaraFoco = (isos: string[]) => {
  const clave = [...isos].sort().join(',');
  if (mascaras.has(clave)) return mascaras.get(clave)!;
  const geos = isos.map((i) => geometrias.get(i)).filter(Boolean) as MultiPolygon[];
  if (!geos.length) return null; // las geometrías aún no han llegado: se reintenta en el siguiente fotograma
  const mundo: PolyClip = [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]];
  let r: MultiPolygon | null = null;
  try {
    r = polygonClipping.difference(mundo, ...geos);
  } catch {
    r = null;
  }
  mascaras.set(clave, r);
  return r;
};

/** Rayado diagonal a 45° (zonas en disputa, guerrilla): una o dos tintas sobre transparente. */
const idTrama = (c1: string, c2?: string) => `trama|${c1}|${c2 ?? ''}`;
const dibujarTrama = (c1: string, c2?: string) => lienzo(32, 32, (c) => {
  c.lineWidth = 5;
  c.lineCap = 'square';
  const raya = (o: number, color: string) => {
    c.strokeStyle = color;
    for (const d of [-32, 0, 32]) {
      c.beginPath();
      c.moveTo(o + d, 32);
      c.lineTo(o + d + 32, 0);
      c.stroke();
    }
  };
  raya(0, c1);
  if (c2) raya(16, c2);
});

/** Modelos de mercante para el tráfico mixto, repartidos de forma fija (siempre los mismos en cada fotograma). */
const MERCANTES = ['portacontenedores', 'petrolero', 'portacontenedores', 'barco', 'petrolero'];
const azar = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ── Solo los rótulos de la historia ────────────────────────────────────────────────
// Un mapa limpio, como en los documentales: el nombre de los países que intervienen y nada más. Las ciudades y
// mares del mapa base se ocultan; los lugares que importan los nombra la pieza (pins, textos, zonas).
const filtroOriginal = new WeakMap<object, {orig: unknown; clave: string}>();
const rotulosDeLaHistoria = (map: MapLibre, p: Proyecto, t: number) => {
  const activo = p.opciones.soloHistoria !== false;
  // El nombre entra cuando el país entra en la historia (su 'desde'), no desde el primer fotograma.
  const isos = [...new Set(p.elementos
    .filter((e) => !e.oculto && (e.tipo === 'pais' || e.tipo === 'territorio') && t >= e.desde && (e.hasta == null || t < e.hasta))
    .map((e) => (e as {iso: string}).iso))].sort();
  const capa = map.getLayer('paises-etiquetas');
  if (capa) {
    let reg = filtroOriginal.get(capa);
    if (!reg) {
      reg = {orig: map.getFilter('paises-etiquetas'), clave: ''};
      filtroOriginal.set(capa, reg);
    }
    const clave = activo ? isos.join(',') : '*';
    if (reg.clave !== clave) {
      reg.clave = clave;
      map.setFilter('paises-etiquetas', (activo
        ? ['all', reg.orig ?? true, ['in', ['get', 'iso'], ['literal', isos]]]
        : reg.orig) as FilterSpecification);
    }
  }
  for (const l of map.getStyle().layers) {
    if (!/^(ciudades-|mares$)/.test(l.id)) continue;
    const vis = activo ? 'none' : 'visible';
    if (map.getLayoutProperty(l.id, 'visibility') !== vis) map.setLayoutProperty(l.id, 'visibility', vis);
  }
};

export const aplicarElementos = (map: MapLibre, p: Proyecto, t: number, opts: {seleccion?: string | null} = {}) => {
  if (!map.isStyleLoaded() && !map.getSource('mm-rutas')) return;
  const zonas: GeoJSON.Feature[] = [];
  const rutas: GeoJSON.Feature[] = [];
  const flechas: GeoJSON.Feature[] = [];
  const pins: GeoJSON.Feature[] = [];
  const textos: GeoJSON.Feature[] = [];
  const territorios: GeoJSON.Feature[] = [];
  const columnas: GeoJSON.Feature[] = [];
  const ataques: GeoJSON.Feature[] = [];
  const moviles: GeoJSON.Feature[] = [];
  const modelos: Modelo3d[] = [];
  const focos: GeoJSON.Feature[] = [];
  const tramas: GeoJSON.Feature[] = [];
  const carriles: GeoJSON.Feature[] = [];
  // Piezas en 3D de verdad (Three.js): unidades, fichas y peanas. Se puede apagar en Opciones.
  const usa3d = p.opciones.modelos3d !== false;
  const estadoPaises = new Map<string, {color: string; op: number; opBorde: number}>();

  for (const e of p.elementos as Elemento[]) {
    if (e.oculto || e.tipo === 'titulo') continue;
    let op = visibilidad(t, e.desde, e.hasta, e.fundido);
    if (opts.seleccion === e.id && op === 0) op = 0.25; // fantasma del elemento seleccionado fuera de su tiempo
    if (op <= 0) continue;

    switch (e.tipo) {
      case 'pais': {
        let o = e.opacidad * op;
        if (e.pulso) o *= 0.75 + 0.25 * Math.sin((t - e.desde) * Math.PI * 1.5);
        estadoPaises.set(e.iso, {color: e.color, op: o, opBorde: e.borde ? op : 0});
        break;
      }
      case 'ruta': {
        if (e.puntos.length < 2) break;
        const densa = densificar(e.puntos, e.forma);
        const prog = e.trazo > 0 ? Math.min(1, Math.max(0, (t - e.desde) / e.trazo)) : 1;
        // Curva de dibujo: arranca rápido y frena al llegar, como un trazo a mano.
        const linea = recortar(densa, 1 - Math.pow(1 - prog, 2.2));
        if (linea.length < 2) break;
        if (e.estilo === 'ataque') {
          const anillo = flechaGruesa(linea, e.anchoKm ?? 60);
          // Algo más oscura que el color del bando: la flecha debe leerse encima de su propio país.
          // Grosor de la placa: un cuarto del ancho (crece al aparecer y baja al desvanecerse).
          if (anillo.length > 3) ataques.push({type: 'Feature', properties: {color: oscurecer(e.color, 0.22), op,
            altura: (e.anchoKm ?? 60) * 250 * Math.min(1, op)},
            geometry: {type: 'Polygon', coordinates: [anillo]}});
          break;
        }
        const modeloMovil = e.movil && usa3d ? modeloPara(e.movil) : null;
        if (modeloMovil) {
          modelos.push({modelo: modeloMovil, en: linea[linea.length - 1] as [number, number], rumbo: rumboFinal(linea),
            color: e.color, op, tam: e.tamanoMovil ?? 1});
        } else if (e.movil) {
          // La unidad va en la cabeza de la ruta, orientada hacia donde avanza (los barcos no giran: se ven de lado).
          const id = `movil|${encodeURIComponent(e.movil)}`;
          if (!map.hasImage(id)) map.addImage(id, dibujarMovil(e.movil), {pixelRatio: 2});
          const lateral = /barco|submarino|🚢|⛴|🛳/.test(e.movil);
          moviles.push({type: 'Feature', properties: {img: id, rumbo: lateral ? 0 : rumboFinal(linea), op, tam: e.tamanoMovil ?? 1},
            geometry: {type: 'Point', coordinates: linea[linea.length - 1]}});
        }
        const props = {color: e.color, grosor: e.grosor, op, disc: e.discontinua ? 1 : 0};
        rutas.push({type: 'Feature', properties: props, geometry: {type: 'LineString', coordinates: linea}});
        if (e.flecha) {
          flechas.push({type: 'Feature', properties: {...props, rumbo: rumboFinal(linea)},
            geometry: {type: 'Point', coordinates: linea[linea.length - 1]}});
        }
        break;
      }
      case 'pin': {
        // La imagen de la ficha se crea aquí y no al pedirla el mapa: el render de exportación
        // pinta un solo fotograma y no espera a 'styleimagemissing', así que la ficha no salía.
        const edad = t - e.desde;
        // Rebote al aparecer.
        const escala = edad < 0 ? 1 : Math.min(1.15, 1 - Math.exp(-edad * 9) * Math.cos(edad * 16));
        if (e.estilo === 'ficha' && usa3d) {
          // Pieza 3D: unidad (modelo del icono), peana o ficha hexagonal, siempre de cara a la cámara salvo las unidades.
          const forma = e.forma ?? 'hexagono';
          const modeloUnidad = forma === 'unidad' ? modeloPara(e.icono || 'barco') : null;
          if (forma !== 'unidad' || modeloUnidad) {
            const base = {en: e.en as [number, number], color: e.color, op, tam: (e.tamano ?? 1) * Math.max(0, escala)};
            if (modeloUnidad) modelos.push({...base, modelo: modeloUnidad, rumbo: e.rumbo ?? 0});
            else modelos.push({...base, modelo: forma === 'peana' ? 'peana' : 'ficha', rumbo: map.getBearing(),
              tam: base.tam * (forma === 'peana' ? 1.05 : 1.1), ...caraDe(e)});
            pins.push({type: 'Feature', geometry: {type: 'Point', coordinates: e.en}, properties: {
              texto: e.texto, color: e.color, estilo: 'modelo', etiqueta: e.etiqueta, op, escala: 1, radioPulso: 0, opPulso: 0,
              ficha: '', tam: e.tamano ?? 1}});
            break;
          }
        }
        if (e.estilo === 'ficha' && !map.hasImage(idFicha(e))) map.addImage(idFicha(e), dibujarFicha(idFicha(e)), {pixelRatio: 2});
        const ciclo = ((edad % 1.6) + 1.6) % 1.6 / 1.6;
        pins.push({type: 'Feature', geometry: {type: 'Point', coordinates: e.en}, properties: {
          texto: e.texto, color: e.color, estilo: e.estilo, etiqueta: e.etiqueta, op,
          escala: Math.max(0, escala), radioPulso: 8 + ciclo * 28, opPulso: op * 0.55 * (1 - ciclo),
          ficha: e.estilo === 'ficha' ? idFicha(e) : '', tam: e.tamano ?? 1,
        }});
        break;
      }
      case 'texto': {
        textos.push({type: 'Feature', geometry: {type: 'Point', coordinates: e.en}, properties: {
          texto: e.mayusculas ? e.texto.toUpperCase() : e.texto, tamano: e.tamano, color: e.color, op,
          cursiva: e.cursiva ? 1 : 0, espaciado: e.espaciado, halo: haloPara(e.color),
        }});
        break;
      }
      case 'zona': {
        const crece = Math.min(1, Math.max(0, (t - e.desde) / Math.max(0.3, e.fundido * 2)));
        const r = e.radioKm * (0.6 + 0.4 * (1 - Math.pow(1 - crece, 3)));
        const disc = e.discontinua ? 1 : 0;
        const estilo = e.estilo ?? 'area';
        const anillo = (radio: number, props: Record<string, number | string>) =>
          zonas.push({type: 'Feature', properties: {color: e.color, op, disc, relleno: 0.18, ...props},
            geometry: {type: 'Polygon', coordinates: [circulo(e.en, radio)]}});
        if (estilo === 'objetivo') {
          // Doble anillo que late, sin relleno.
          const lat = 1 + 0.08 * Math.sin((t - e.desde) * Math.PI * 2.2);
          anillo(r * lat, {relleno: 0, disc: 0});
          anillo(r * 0.55 * lat, {relleno: 0, disc: 0});
        } else if (estilo === 'radar') {
          // Alcance translúcido y una onda que sale del centro cada 1,8 s.
          anillo(r, {relleno: 0.32, disc: 0});
          const ciclo = (((t - e.desde) % 1.8) + 1.8) % 1.8 / 1.8;
          anillo(r * ciclo, {relleno: 0.12 * (1 - ciclo), disc: 0, op: op * (1 - ciclo)});
        } else if (e.trama) {
          // Zona en disputa o con presencia de guerrilla: rayado y borde discontinuo, relleno muy suave.
          anillo(r, {relleno: 0.08, disc: 1});
          const img = idTrama(e.color, e.color2);
          if (!map.hasImage(img)) map.addImage(img, dibujarTrama(e.color, e.color2), {pixelRatio: 2});
          tramas.push({type: 'Feature', properties: {img, op: op * 0.85}, geometry: {type: 'Polygon', coordinates: [circulo(e.en, r)]}});
        } else {
          anillo(r, {});
        }
        break;
      }
      case 'foco': {
        const m = mascaraFoco(e.paises);
        if (m) focos.push({type: 'Feature', properties: {op: op * e.opacidad}, geometry: {type: 'MultiPolygon', coordinates: m}});
        break;
      }
      case 'trafico': {
        if (e.puntos.length < 2) break;
        const linea = densificar(e.puntos, 'recta');
        if (e.carril) {
          carriles.push({type: 'Feature', properties: {color: e.color, op}, geometry: {type: 'LineString', coordinates: linea}});
        }
        const n = Math.max(1, Math.min(80, Math.round(e.barcos)));
        const edad = t - e.desde;
        for (let k = 0; k < n; k++) {
          const vuelta = e.sentido === 'ambos' && k % 2 === 1;
          // Cada unidad con su propio ritmo (±15 %) y su sitio a lo ancho del corredor; se reparten a lo largo.
          const ritmo = 1 + (azar(k) - 0.5) * 0.3;
          const fBase = (k / n + azar(k + 50) * 0.5 / n + (edad / Math.max(1, e.vuelta)) * ritmo) % 1;
          const f = vuelta ? 1 - fBase : fBase;
          // Los de vuelta van por su lado del corredor (separación de tráfico, como en un estrecho real).
          const lado = e.sentido === 'ambos' ? (vuelta ? -1 : 1) * (0.25 + azar(k + 9) * 0.25) : (azar(k + 9) - 0.5);
          // lado > 0: a la derecha de la línea; los de vuelta (lado < 0) quedan a la derecha de su propio rumbo.
          const pos = puntoEnLinea(linea, f, lado * e.anchoKm);
          // Entran y salen del corredor con fundido.
          const borde = Math.min(1, Math.min(fBase, 1 - fBase) / 0.06);
          const modelo = e.modelo === 'mixto' ? MERCANTES[k % MERCANTES.length] : (modeloPara(e.modelo) ?? 'barco');
          modelos.push({modelo, en: pos.en, rumbo: (pos.rumbo + (vuelta ? 180 : 0)) % 360, color: e.color,
            op: op * borde, tam: e.tamano * (0.85 + azar(k + 3) * 0.3)});
        }
        break;
      }
      case 'columna': {
        const k = e.crece > 0 ? suave(Math.min(1, Math.max(0, (t - e.desde) / e.crece))) : 1;
        const lados = e.forma === 'cilindro' ? 48 : e.forma === 'hexagono' ? 6 : 4;
        const altura = e.alturaKm * 1000 * k;
        columnas.push({type: 'Feature', properties: {color: e.color, op, altura, base: 0},
          geometry: {type: 'Polygon', coordinates: [circulo(e.en, e.radioKm, lados)]}});
        if (e.texto && k > 0.98) {
          textos.push({type: 'Feature', geometry: {type: 'Point', coordinates: e.en}, properties: {
            texto: e.texto, tamano: 22, color: '#1E1A16', op, cursiva: 0, espaciado: 0.05, halo: 'rgba(255,255,255,0.9)',
          }});
        }
        break;
      }
      case 'territorio': {
        const f = e.avance > 0 ? suave(Math.min(1, Math.max(0, (t - e.desde) / e.avance))) : 1;
        const mp = barrido(e.iso, e.direccion, f * e.hasta_fraccion);
        if (mp && mp.length) {
          territorios.push({type: 'Feature', properties: {color: e.color, op: op * e.opacidad * (e.trama ? 0.25 : 1),
            borde: oscurecer(e.color, 0.55)}, geometry: {type: 'MultiPolygon', coordinates: mp}});
          if (e.trama) {
            const img = idTrama(e.color, e.color2);
            if (!map.hasImage(img)) map.addImage(img, dibujarTrama(e.color, e.color2), {pixelRatio: 2});
            tramas.push({type: 'Feature', properties: {img, op}, geometry: {type: 'MultiPolygon', coordinates: mp}});
          }
        }
        break;
      }
    }
  }

  fijar(map, 'mm-zonas', fc(zonas));
  fijar(map, 'mm-rutas', fc(rutas));
  fijar(map, 'mm-flechas', fc(flechas));
  fijar(map, 'mm-pins', fc(pins));
  fijar(map, 'mm-textos', fc(textos));
  if (map.getSource('mm-ataques')) fijar(map, 'mm-ataques', fc(ataques));
  if (map.getSource('mm-moviles')) fijar(map, 'mm-moviles', fc(moviles));
  if (map.getSource('mm-pins')) fijarModelos(map, modelos);
  if (map.getSource('mm-foco')) fijar(map, 'mm-foco', fc(focos));
  if (map.getSource('mm-tramas')) fijar(map, 'mm-tramas', fc(tramas));
  if (map.getSource('mm-carriles')) fijar(map, 'mm-carriles', fc(carriles));
  rotulosDeLaHistoria(map, p, t);
  fijar(map, 'mm-territorios', fc(territorios));
  fijar(map, 'mm-columnas', fc(columnas));

  // Países: feature-state, sin reescribir la geometría (que pesa varios MB).
  const previos = paisesActivos.get(map) ?? new Set<string>();
  for (const iso of previos) {
    if (!estadoPaises.has(iso)) map.setFeatureState({source: 'ne-paises', id: iso}, {op: 0, opBorde: 0});
  }
  for (const [iso, s] of estadoPaises) {
    map.setFeatureState({source: 'ne-paises', id: iso}, {color: s.color, op: s.op, borde: oscurecer(s.color, 0.55), opBorde: s.opBorde});
  }
  paisesActivos.set(map, new Set(estadoPaises.keys()));
};

export const olvidarEstado = (map: MapLibre) => paisesActivos.delete(map);

/** Mezcla el color con negro: borde del país resaltado, como la tinta del canto. */
export const oscurecer = (hex: string, k: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - k)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

const haloPara = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 'rgba(0,0,0,0.6)';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)';
};

export const borrador = (map: MapLibre, puntos: [number, number][]) => {
  const feats: GeoJSON.Feature[] = puntos.map((pt) => ({type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: pt}}));
  if (puntos.length > 1) feats.push({type: 'Feature', properties: {}, geometry: {type: 'LineString', coordinates: puntos}});
  fijar(map, 'mm-borrador', fc(feats));
};
