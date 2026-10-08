import type {GeoJSONSource, Map as MapLibre} from 'maplibre-gl';
import {circulo, densificar, recortar, rumboFinal, visibilidad} from './geo';
import type {Elemento, Proyecto} from './proyecto';

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

export const aplicarElementos = (map: MapLibre, p: Proyecto, t: number, opts: {seleccion?: string | null} = {}) => {
  if (!map.isStyleLoaded() && !map.getSource('mm-rutas')) return;
  const zonas: GeoJSON.Feature[] = [];
  const rutas: GeoJSON.Feature[] = [];
  const flechas: GeoJSON.Feature[] = [];
  const pins: GeoJSON.Feature[] = [];
  const textos: GeoJSON.Feature[] = [];
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
        const props = {color: e.color, grosor: e.grosor, op, disc: e.discontinua ? 1 : 0};
        rutas.push({type: 'Feature', properties: props, geometry: {type: 'LineString', coordinates: linea}});
        if (e.flecha) {
          flechas.push({type: 'Feature', properties: {...props, rumbo: rumboFinal(linea)},
            geometry: {type: 'Point', coordinates: linea[linea.length - 1]}});
        }
        break;
      }
      case 'pin': {
        const edad = t - e.desde;
        // Rebote al aparecer.
        const escala = edad < 0 ? 1 : Math.min(1.15, 1 - Math.exp(-edad * 9) * Math.cos(edad * 16));
        const ciclo = ((edad % 1.6) + 1.6) % 1.6 / 1.6;
        pins.push({type: 'Feature', geometry: {type: 'Point', coordinates: e.en}, properties: {
          texto: e.texto, color: e.color, estilo: e.estilo, etiqueta: e.etiqueta, op,
          escala: Math.max(0, escala), radioPulso: 8 + ciclo * 28, opPulso: op * 0.55 * (1 - ciclo),
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
        zonas.push({type: 'Feature', properties: {color: e.color, op, disc: e.discontinua ? 1 : 0},
          geometry: {type: 'Polygon', coordinates: [circulo(e.en, r)]}});
        break;
      }
    }
  }

  fijar(map, 'mm-zonas', fc(zonas));
  fijar(map, 'mm-rutas', fc(rutas));
  fijar(map, 'mm-flechas', fc(flechas));
  fijar(map, 'mm-pins', fc(pins));
  fijar(map, 'mm-textos', fc(textos));

  // Países: feature-state, sin reescribir la geometría (que pesa varios MB).
  const previos = paisesActivos.get(map) ?? new Set<string>();
  for (const iso of previos) {
    if (!estadoPaises.has(iso)) map.setFeatureState({source: 'ne-paises', id: iso}, {op: 0, opBorde: 0});
  }
  for (const [iso, s] of estadoPaises) {
    map.setFeatureState({source: 'ne-paises', id: iso}, {color: s.color, op: s.op, borde: s.color, opBorde: s.opBorde});
  }
  paisesActivos.set(map, new Set(estadoPaises.keys()));
};

export const olvidarEstado = (map: MapLibre) => paisesActivos.delete(map);

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
