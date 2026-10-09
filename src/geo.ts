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

/**
 * Flecha de ataque gruesa (como en los documentales): cuerpo que se ensancha desde la cola y punta afilada.
 * Devuelve el contorno del polígono. anchoKm es el ancho del cuerpo; la punta mide 2,2 veces el ancho.
 */
export const flechaGruesa = (linea: LonLat[], anchoKm: number): LonLat[] => {
  if (linea.length < 2) return [];
  const m = linea.map(aMerc);
  const latMedia = rad(linea.reduce((s, p) => s + p[1], 0) / linea.length);
  const W = anchoKm / 6371 / Math.cos(latMedia); // ancho en unidades Mercator
  const acum = [0];
  for (let i = 1; i < m.length; i++) acum.push(acum[i - 1] + Math.hypot(m[i][0] - m[i - 1][0], m[i][1] - m[i - 1][1]));
  const total = acum[acum.length - 1];
  if (total <= 0) return [];
  const largoPunta = Math.min(W * 2.4, total * 0.45);
  const finCuerpo = total - largoPunta;
  // Punto y dirección a una distancia s del inicio.
  const en = (s: number): {p: [number, number]; d: [number, number]} => {
    let i = 1;
    while (i < m.length - 1 && acum[i] < s) i++;
    const a = m[i - 1];
    const b = m[i];
    const l = Math.max(1e-12, acum[i] - acum[i - 1]);
    const f = Math.min(1, Math.max(0, (s - acum[i - 1]) / l));
    return {p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], d: [(b[0] - a[0]) / l, (b[1] - a[1]) / l]};
  };
  const izq: [number, number][] = [];
  const der: [number, number][] = [];
  const pasos = 40;
  for (let k = 0; k <= pasos; k++) {
    const s = (finCuerpo * k) / pasos;
    const {p, d} = en(s);
    const w = (W / 2) * (0.45 + 0.55 * Math.min(1, s / Math.max(1e-9, finCuerpo) * 1.4)); // cola fina que se abre
    izq.push([p[0] - d[1] * w, p[1] + d[0] * w]);
    der.push([p[0] + d[1] * w, p[1] - d[0] * w]);
  }
  const base = en(finCuerpo);
  const punta = m[m.length - 1];
  const hw = W * 1.1;
  const anillo: [number, number][] = [
    ...izq,
    [base.p[0] - base.d[1] * hw, base.p[1] + base.d[0] * hw],
    punta,
    [base.p[0] + base.d[1] * hw, base.p[1] - base.d[0] * hw],
    ...der.reverse(),
  ];
  anillo.push(anillo[0]);
  return anillo.map(deMerc);
};
