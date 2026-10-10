import type {FilterSpecification, GeoJSONSource, Map as MapLibre} from 'maplibre-gl';
import polygonClipping, {type MultiPolygon, type Polygon as PolyClip} from 'polygon-clipping';
import {circulo, densificar, flechaGruesa, recortar, rumboFinal, visibilidad} from './geo';
import {silueta} from './iconos';
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
    ...p.elementos.flatMap((e) => (e.tipo === 'pin' && e.imagen ? [e.imagen] : [])),
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
  hexPlano(c, cx, by, 62, 0.42);
  c.fillStyle = '#FFFFFF';
  c.fill();
  c.shadowColor = 'transparent';
  hexPlano(c, cx, by - 3, 54, 0.42);
  c.fillStyle = color;
  c.fill();
  const forma = silueta(icono === '🪖' || icono === 'soldado' || !icono ? 'infante' : icono) ?? silueta('infante')!;
  c.save();
  c.translate(cx - 60, by - 128);
  c.scale(1.2, 1.2);
  c.shadowColor = 'rgba(0,0,0,0.25)';
  c.shadowBlur = 4;
  c.fillStyle = '#1B1712';
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
  c.fillStyle = '#FFFFFF';
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

const dibujarFicha = (id: string) => {
  const [, color, fondo, icono, clave, forma] = id.split('|').map(decodeURIComponent);
  if (forma === 'peana') return dibujarPeana(color, icono);
  if (forma === 'unidad') return dibujarUnidad(color, icono);
  const W = 168;
  const H = 176;
  return lienzo(W, H, (c) => {
    const cx = W / 2;
    const cy = 84;
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = 8;
    c.shadowOffsetY = 4;
    hexagono(c, cx, cy, 76);
    c.fillStyle = '#FFFFFF';
    c.fill();
    c.shadowColor = 'transparent';
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
      c.fillStyle = fondo === 'blanco' ? '#1C2B45' : '#121212';
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
          if (anillo.length > 3) ataques.push({type: 'Feature', properties: {color: oscurecer(e.color, 0.22), op},
            geometry: {type: 'Polygon', coordinates: [anillo]}});
          break;
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
        if (e.estilo === 'ficha' && !map.hasImage(idFicha(e))) map.addImage(idFicha(e), dibujarFicha(idFicha(e)), {pixelRatio: 2});
        const edad = t - e.desde;
        // Rebote al aparecer.
        const escala = edad < 0 ? 1 : Math.min(1.15, 1 - Math.exp(-edad * 9) * Math.cos(edad * 16));
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
        } else {
          anillo(r, {});
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
          territorios.push({type: 'Feature', properties: {color: e.color, op: op * e.opacidad, borde: oscurecer(e.color, 0.55)},
            geometry: {type: 'MultiPolygon', coordinates: mp}});
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
