// Genera public/data/oceano.geojson: el mar como "mundo menos tierra", con las mismas costas que paises.geojson.
// Se pinta encima del relieve para que el fondo marino quede liso (sin la textura de surcos que, con la cámara
// en movimiento, parecía agua hirviendo). Uso: node scripts/generar-oceano.mjs
import {readFileSync, writeFileSync} from 'node:fs';
import pc from 'polygon-clipping';

const paises = JSON.parse(readFileSync('public/data/paises.geojson', 'utf8'));
const tierra = [];
for (const f of paises.features) {
  const g = f.geometry;
  if (!g) continue;
  const polis = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const p of polis) tierra.push([p[0]]); // solo el contorno exterior: lagos interiores siguen siendo tierra aquí
}
// Por franjas de 30° de longitud: más rápido y robusto que una sola resta gigante.
const features = [];
for (let lon = -180; lon < 180; lon += 30) {
  const caja = [[[lon, -85.1], [lon + 30, -85.1], [lon + 30, 85.1], [lon, 85.1], [lon, -85.1]]];
  const dentro = tierra.filter(([anillo]) => anillo.some(([x]) => x >= lon - 1 && x <= lon + 31));
  const mar = pc.difference(caja, ...dentro);
  features.push({type: 'Feature', properties: {}, geometry: {type: 'MultiPolygon',
    coordinates: mar.map((p) => p.map((a) => a.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000])))}});
  console.log('franja', lon, mar.length, 'polígonos');
}
writeFileSync('public/data/oceano.geojson', JSON.stringify({type: 'FeatureCollection', features}));
