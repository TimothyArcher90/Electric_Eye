import type {LonLat} from './proyecto';

const R = 6371; // km
const rad = (g: number) => (g * Math.PI) / 180;
const grad = (r: number) => (r * 180) / Math.PI;

/** Distancia angular (radianes) por círculo máximo. */
export const distanciaAng = (a: LonLat, b: LonLat) => {
  const [l1, f1] = [rad(a[0]), rad(a[1])];
  const [l2, f2] = [rad(b[0]), rad(b[1])];
  const h = Math.sin((f2 - f1) / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin((l2 - l1) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Punto intermedio por círculo máximo, f ∈ [0,1]. */
export const interpolarGeo = (a: LonLat, b: LonLat, f: number): LonLat => {
  const d = distanciaAng(a, b);
  if (d < 1e-9) return a;
  const [l1, f1] = [rad(a[0]), rad(a[1])];
  const [l2, f2] = [rad(b[0]), rad(b[1])];
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(f1) * Math.cos(l1) + B * Math.cos(f2) * Math.cos(l2);
  const y = A * Math.cos(f1) * Math.sin(l1) + B * Math.cos(f2) * Math.sin(l2);
  const z = A * Math.sin(f1) + B * Math.sin(f2);
  return [grad(Math.atan2(y, x)), grad(Math.atan2(z, Math.hypot(x, y)))];
};

// Mercator simple para trabajar arcos en "espacio de pantalla".
const aMerc = ([lon, lat]: LonLat): [number, number] => [
  rad(lon),
  Math.log(Math.tan(Math.PI / 4 + rad(Math.max(-85, Math.min(85, lat))) / 2)),
];
const deMerc = ([x, y]: [number, number]): LonLat => [grad(x), grad(2 * Math.atan(Math.exp(y)) - Math.PI / 2)];

/** Densifica la línea según la forma pedida. Devuelve muchos puntos para dibujar suave. */
export const densificar = (puntos: LonLat[], forma: 'geodesica' | 'arco' | 'recta'): LonLat[] => {
  if (puntos.length < 2) return puntos;
  const out: LonLat[] = [puntos[0]];
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i];
    let b = puntos[i + 1];
    // Desenrolla longitudes para no cruzar el mundo por el lado largo.
    if (b[0] - a[0] > 180) b = [b[0] - 360, b[1]];
    if (b[0] - a[0] < -180) b = [b[0] + 360, b[1]];
    const n = 48;
    if (forma === 'geodesica') {
      for (let k = 1; k <= n; k++) out.push(interpolarGeo(a, b, k / n));
    } else if (forma === 'arco') {
      // Curva cuadrática en Mercator, con el control desplazado a la izquierda del trayecto.
      const ma = aMerc(a);
      const mb = aMerc(b);
      const mx = (ma[0] + mb[0]) / 2;
      const my = (ma[1] + mb[1]) / 2;
      const dx = mb[0] - ma[0];
      const dy = mb[1] - ma[1];
      const c: [number, number] = [mx - dy * 0.28, my + dx * 0.28];
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const x = (1 - t) ** 2 * ma[0] + 2 * (1 - t) * t * c[0] + t * t * mb[0];
        const y = (1 - t) ** 2 * ma[1] + 2 * (1 - t) * t * c[1] + t * t * mb[1];
        out.push(deMerc([x, y]));
      }
    } else {
      for (let k = 1; k <= 8; k++) {
        const t = k / 8;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
  }
  return out;
};

/** Recorta una polilínea densa a la fracción p de su longitud. */
export const recortar = (linea: LonLat[], p: number): LonLat[] => {
  if (p >= 1) return linea;
  if (p <= 0 || linea.length < 2) return [];
  const tramos: number[] = [];
  let total = 0;
  for (let i = 0; i < linea.length - 1; i++) {
    const d = Math.hypot(linea[i + 1][0] - linea[i][0], linea[i + 1][1] - linea[i][1]);
    tramos.push(d);
    total += d;
  }
  let resto = total * p;
  const out: LonLat[] = [linea[0]];
  for (let i = 0; i < tramos.length; i++) {
    if (resto >= tramos[i]) {
      out.push(linea[i + 1]);
      resto -= tramos[i];
    } else {
      const f = resto / tramos[i];
      out.push([linea[i][0] + (linea[i + 1][0] - linea[i][0]) * f, linea[i][1] + (linea[i + 1][1] - linea[i][1]) * f]);
      break;
    }
  }
  return out;
};

/** Rumbo geográfico (grados desde el norte) del último tramo, para orientar la flecha. */
export const rumboFinal = (linea: LonLat[]): number => {
  const n = linea.length;
  if (n < 2) return 0;
  const a = aMerc(linea[Math.max(0, n - 3)]);
  const b = aMerc(linea[n - 1]);
  return grad(Math.atan2(b[0] - a[0], b[1] - a[1]));
};

/** Círculo geodésico de radio km, como polígono. */
export const circulo = (c: LonLat, km: number, n = 96): LonLat[] => {
  const d = km / R;
  const [l1, f1] = [rad(c[0]), rad(c[1])];
  const out: LonLat[] = [];
  for (let i = 0; i <= n; i++) {
    const brg = (2 * Math.PI * i) / n;
    const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(brg));
    const l2 = l1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
    out.push([grad(l2), grad(f2)]);
  }
  return out;
};

/** Visibilidad 0–1 de un elemento en el segundo t, con fundidos. */
export const visibilidad = (t: number, desde: number, hasta: number | null, fundido: number) => {
  const f = Math.max(0.0001, fundido);
  const entra = Math.min(1, Math.max(0, (t - desde) / f));
  const sale = hasta == null ? 1 : Math.min(1, Math.max(0, (hasta + f - t) / f));
  return t < desde ? 0 : Math.min(entra, sale);
};
