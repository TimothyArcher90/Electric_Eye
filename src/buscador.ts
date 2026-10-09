import type {LonLat} from './proyecto';

export type Lugar = {nombre: string; detalle: string; en: LonLat; zoom: number; iso?: string; tipo: 'pais' | 'ciudad' | 'mar'};

const limpiar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

let indice: (Lugar & {clave: string; peso: number})[] | null = null;

// Búsqueda sin conexión sobre Natural Earth: países (nombre en español e inglés), ciudades y mares.
export const cargarIndice = async () => {
  if (indice) return indice;
  const [paises, ciudades, mares, extra] = await Promise.all(
    ['data/paises-etiquetas.geojson', 'data/ciudades.geojson', 'data/mares.geojson', 'data/lugares-extra.geojson']
      .map((u) => fetch(u).then((r) => r.json())),
  );
  const out: (Lugar & {clave: string; peso: number})[] = [];
  for (const f of paises.features) {
    const pr = f.properties;
    const zoom = pr.rank <= 2 ? 3 : pr.rank <= 4 ? 4.2 : 5.5;
    for (const n of new Set([pr.nombre, pr.nombre_en].filter(Boolean))) {
      out.push({nombre: pr.nombre, detalle: 'País', en: f.geometry.coordinates, zoom, iso: pr.iso, tipo: 'pais',
        clave: limpiar(n as string), peso: 0});
    }
  }
  for (const f of ciudades.features) {
    const pr = f.properties;
    const nom = pr.nombre ?? pr.nombre_en ?? pr.nombre_local;
    for (const n of new Set([pr.nombre, pr.nombre_en, pr.nombre_local].filter(Boolean))) {
      out.push({nombre: nom, detalle: pr.pais ?? 'Ciudad', en: f.geometry.coordinates, zoom: 8, tipo: 'ciudad',
        clave: limpiar(n as string), peso: 1 + (pr.rank ?? 10) / 20});
    }
  }
  for (const f of mares.features) {
    const pr = f.properties;
    const n = pr.nombre ?? pr.nombre_en;
    if (!n) continue;
    // Centro aproximado: media de la caja del primer anillo.
    const anillo = (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]) as LonLat[];
    const xs = anillo.map((c) => c[0]);
    const ys = anillo.map((c) => c[1]);
    out.push({nombre: n, detalle: 'Mar / golfo / estrecho', en: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2],
      zoom: 5, tipo: 'mar', clave: limpiar(n), peso: 1.2});
  }
  // Estrechos, regiones y zonas en disputa que Natural Earth no trae como punto.
  for (const f of extra.features) {
    const pr = f.properties;
    for (const n of new Set([pr.nombre, pr.nombre_en].filter(Boolean))) {
      out.push({nombre: pr.nombre, detalle: 'Región / estrecho', en: f.geometry.coordinates, zoom: pr.zoom ?? 6, tipo: 'mar',
        clave: limpiar(n as string), peso: 0.5});
    }
  }
  indice = out;
  return out;
};

export const buscar = async (q: string, max = 8): Promise<Lugar[]> => {
  const c = limpiar(q);
  if (c.length < 2) return [];
  const idx = await cargarIndice();
  const vistos = new Set<string>();
  return idx
    .map((l) => ({l, s: l.clave === c ? 0 : l.clave.startsWith(c) ? 1 : l.clave.includes(c) ? 2 : 99}))
    .filter((x) => x.s < 99)
    .sort((a, b) => a.s + a.l.peso - (b.s + b.l.peso))
    .filter((x) => {
      const k = `${x.l.tipo}:${x.l.nombre}:${x.l.detalle}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, max)
    .map((x) => x.l);
};

/** Ciudad conocida más cercana (para poner nombre por defecto a un pin). */
export const ciudadCercana = async (en: LonLat, maxKm = 40): Promise<string | null> => {
  const idx = await cargarIndice();
  let mejor: string | null = null;
  let d0 = Infinity;
  for (const l of idx) {
    if (l.tipo !== 'ciudad') continue;
    const dx = (l.en[0] - en[0]) * Math.cos((en[1] * Math.PI) / 180) * 111;
    const dy = (l.en[1] - en[1]) * 111;
    const d = Math.hypot(dx, dy);
    if (d < d0) {
      d0 = d;
      mejor = l.nombre;
    }
  }
  return d0 <= maxKm ? mejor : null;
};
