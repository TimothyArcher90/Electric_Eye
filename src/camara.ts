import {MercatorCoordinate} from 'maplibre-gl';
import type {Curva, Keyframe, LonLat} from './proyecto';

export type Vista = {centro: LonLat; zoom: number; rumbo: number; inclinacion: number};

/**
 * Los zooms del proyecto son "de referencia": los de un encuadre de 540 px CSS de alto.
 * Al pintar en un encuadre de otra altura (otra pantalla, vista previa, exportación) se
 * corrige con este desfase, así el proyecto se ve igual en cualquier ordenador y formato.
 */
export const ALTO_REFERENCIA = 540;
export const desfaseZoom = (altoCss: number) => Math.log2(Math.max(1, altoCss) / ALTO_REFERENCIA);

const CURVAS: Record<Curva, (x: number) => number> = {
  lineal: (x) => x,
  suave: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  entrada: (x) => x * x * x,
  salida: (x) => 1 - Math.pow(1 - x, 3),
};

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

const lerpAngulo = (a: number, b: number, p: number) => {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * p;
};

export const ordenar = (kfs: Keyframe[]) => [...kfs].sort((a, b) => a.t - b.t);

/**
 * Vista de la cámara en el segundo `t`. El centro se interpola en Mercator (lo que
 * el ojo percibe como línea recta en el mapa) y el zoom de forma lineal, que ya es
 * logarítmico respecto a la escala. Con `vuelo`, el zoom baja a mitad de trayecto
 * lo justo para que origen y destino quepan en pantalla.
 */
export const vistaEn = (kfsDesordenados: Keyframe[], t: number, anchoPx: number): Vista | null => {
  const kfs = ordenar(kfsDesordenados);
  if (kfs.length === 0) return null;
  const a0 = kfs[0];
  if (t <= a0.t || kfs.length === 1) return vistaDe(a0);
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t > b.t) continue;
    const p = CURVAS[b.curva]((t - a.t) / Math.max(1e-6, b.t - a.t));

    // Longitud por el camino corto (cruzando el antimeridiano si hace falta).
    let lonB = b.centro[0];
    if (lonB - a.centro[0] > 180) lonB -= 360;
    if (lonB - a.centro[0] < -180) lonB += 360;
    const ma = MercatorCoordinate.fromLngLat(a.centro);
    const mb = MercatorCoordinate.fromLngLat([lonB, b.centro[1]]);
    const m = new MercatorCoordinate(lerp(ma.x, mb.x, p), lerp(ma.y, mb.y, p));
    const ll = m.toLngLat();
    let lon = ll.lng;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;

    let zoom = lerp(a.zoom, b.zoom, p);
    if (b.vuelo) {
      const dist = Math.hypot(mb.x - ma.x, mb.y - ma.y); // en unidades de mundo (0–1)
      const zMin = Math.min(a.zoom, b.zoom);
      // Zoom al que la distancia ocupa ~60 % del ancho del encuadre.
      const zCabe = Math.log2((0.6 * anchoPx) / Math.max(1e-9, dist * 512));
      const bajada = Math.max(0, zMin - zCabe) + 0.25;
      zoom -= bajada * Math.sin(Math.PI * p);
    }
    return {
      centro: [lon, ll.lat],
      zoom: Math.max(0, zoom),
      rumbo: lerpAngulo(a.rumbo, b.rumbo, p),
      inclinacion: lerp(a.inclinacion, b.inclinacion, p),
    };
  }
  return vistaDe(kfs[kfs.length - 1]);
};

const vistaDe = (k: Keyframe): Vista => ({
  centro: k.centro,
  zoom: k.zoom,
  rumbo: k.rumbo,
  inclinacion: k.inclinacion,
});
