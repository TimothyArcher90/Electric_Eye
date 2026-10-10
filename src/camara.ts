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
  if (t <= a0.t) return vistaDe(a0);
  // Después de la última toma la cámara no se queda muerta: sigue con una deriva mínima (acercamiento de 0,03
  // niveles de zoom/s y medio grado por segundo de giro), como un operador que mantiene el plano vivo.
  const ultima = kfs[kfs.length - 1];
  if (t > ultima.t) {
    const dt = t - ultima.t;
    const v = vistaDe(ultima);
    return {...v, zoom: v.zoom + 0.03 * dt, rumbo: v.rumbo - 0.5 * dt};
  }
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t > b.t) continue;
    // Tramos 'suave': trayectoria continua por todas las tomas (como una grúa de cine). La cámara no se para en
    // cada keyframe; solo arranca y frena al principio y al final de la pieza.
    if (b.curva === 'suave' && !b.vuelo) return vistaContinua(kfs, i, t);
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

/**
 * Interpolación de Hermite monótona (sin pasarse de las tomas) por todos los keyframes. La velocidad en cada
 * toma intermedia es la media de los tramos vecinos; en la primera, en la última y junto a un vuelo, cero.
 */
const vistaContinua = (kfs: Keyframe[], i: number, t: number): Vista => {
  // Canales: x e y en Mercator, zoom, rumbo (desenrollado) e inclinación.
  let lonPrevia = kfs[0].centro[0];
  let rumboPrevio = kfs[0].rumbo;
  const canales = kfs.map((k) => {
    let lon = k.centro[0];
    while (lon - lonPrevia > 180) lon -= 360;
    while (lon - lonPrevia < -180) lon += 360;
    lonPrevia = lon;
    const rumbo = rumboPrevio + (((k.rumbo - rumboPrevio + 540) % 360) - 180);
    rumboPrevio = rumbo;
    const m = MercatorCoordinate.fromLngLat([lon, k.centro[1]]);
    return [m.x, m.y, k.zoom, rumbo, k.inclinacion];
  });
  const quieta = (k: number) => k <= 0 || k >= kfs.length - 1 || kfs[k].vuelo || kfs[k + 1].vuelo
    || kfs[k].curva !== 'suave' || kfs[k + 1].curva !== 'suave';
  const tangente = (k: number, c: number) => quieta(k) ? 0
    : (canales[k + 1][c] - canales[k - 1][c]) / Math.max(1e-6, kfs[k + 1].t - kfs[k - 1].t);
  const a = kfs[i];
  const b = kfs[i + 1];
  const dt = Math.max(1e-6, b.t - a.t);
  const s = Math.min(1, Math.max(0, (t - a.t) / dt));
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
  const h10 = s ** 3 - 2 * s ** 2 + s;
  const h01 = -2 * s ** 3 + 3 * s ** 2;
  const h11 = s ** 3 - s ** 2;
  const v = canales[0].map((_, c) => {
    const p1 = canales[i][c];
    const p2 = canales[i + 1][c];
    const d = (p2 - p1) / dt;
    let m1 = tangente(i, c);
    let m2 = tangente(i + 1, c);
    // Fritsch–Carlson: sin rebotes ni pasarse del valor de la toma.
    if (Math.abs(d) < 1e-12) m1 = m2 = 0;
    else {
      if (m1 / d < 0) m1 = 0;
      if (m2 / d < 0) m2 = 0;
      const al = m1 / d;
      const be = m2 / d;
      const r = al * al + be * be;
      if (r > 9) {
        const tau = 3 / Math.sqrt(r);
        m1 = tau * al * d;
        m2 = tau * be * d;
      }
    }
    return h00 * p1 + h10 * dt * m1 + h01 * p2 + h11 * dt * m2;
  });
  const ll = new MercatorCoordinate(v[0], v[1]).toLngLat();
  let lon = ll.lng;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return {centro: [lon, ll.lat], zoom: Math.max(0, v[2]), rumbo: ((v[3] % 360) + 540) % 360 - 180, inclinacion: v[4]};
};

const vistaDe = (k: Keyframe): Vista => ({
  centro: k.centro,
  zoom: k.zoom,
  rumbo: k.rumbo,
  inclinacion: k.inclinacion,
});
