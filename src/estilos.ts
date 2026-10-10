import type {
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import type {EstiloId, OpcionesEstilo, PresetEstilo} from './proyecto';

// ── Fuentes externas (gratuitas, sin clave). Cada una con su atribución. ──────────
export const FUENTES = {
  // Elevación Terrarium (Mapzen/Joerd) en AWS Open Data. Sin clave.
  terreno: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  // Sentinel-2 cloudless 2016 de EOX: CC BY 4.0 (uso comercial permitido con atribución).
  satelite: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
  // OpenFreeMap: teselas vectoriales de OpenStreetMap, gratis y sin clave.
  calles: 'https://tiles.openfreemap.org/styles/liberty',
};

export const ATRIBUCION = {
  ne: 'Natural Earth',
  terreno: 'Relieve: Mapzen/Joerd, AWS Terrain Tiles',
  satelite: 'Sentinel-2 cloudless 2016 by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)',
  calles: '© OpenMapTiles © OpenStreetMap contributors · OpenFreeMap',
};

export type Paleta = {
  espacio: string;
  oceano: string;
  tierra: string;
  frontera: string;
  costa: string;
  provincia: string;
  rio: string;
  lago: string;
  etiquetaPais: string;
  haloPais: string;
  ciudad: string;
  ciudadTexto: string;
  haloCiudad: string;
  mar: string;
  sombra: string;
  luz: string;
  intensidadRelieve: number;
  politico: string[];
  acento: string;
};

export const PALETAS: Record<EstiloId, Paleta> = {
  // Atlas 3D: colores medidos en la referencia (referencias/caspian-report-ficha.md).
  atlas: {
    espacio: '#E8DCCB', oceano: '#C4CEC8', tierra: '#F2DFCF', frontera: 'rgba(120,104,90,0.75)', costa: 'rgba(0,0,0,0)',
    provincia: 'rgba(120,104,90,0.35)', rio: '#A9C3C4', lago: '#BACCC9',
    etiquetaPais: '#3E362F', haloPais: 'rgba(242,223,207,0.55)', ciudad: '#F2E21E', ciudadTexto: '#1E1A16',
    haloCiudad: 'rgba(242,223,207,0.75)', mar: '#4F7F88', sombra: '#6A5A4C', luz: '#FFFDF8', intensidadRelieve: 0.55,
    politico: ['#F2DFCF'],
    acento: '#CB8C5B',
  },
  // Papel de escritorio: crema, azul grisáceo, tinta marrón. El registro documental.
  documental: {
    espacio: '#E8DFCB', oceano: '#AFC3C3', tierra: '#EFE6D1', frontera: '#5E5242', costa: '#6E6250',
    provincia: 'rgba(94,82,66,0.35)', rio: '#8EA9AC', lago: '#AFC3C3',
    etiquetaPais: '#3B3226', haloPais: 'rgba(239,230,209,0.85)', ciudad: '#2B241B', ciudadTexto: '#2B241B',
    haloCiudad: 'rgba(239,230,209,0.9)', mar: '#5F7C80', sombra: '#5A4B36', luz: '#FFFFFF', intensidadRelieve: 0.35,
    politico: ['#E9D9B6', '#DCCBA6', '#E6D3C0', '#D8D2B0', '#E3DCC2', '#D9C9B0', '#E8DCC8'],
    acento: '#B3261E',
  },
  // Geopolítico: mar azul profundo, tierra con relieve marcado, etiquetas blancas.
  geopolitico: {
    espacio: '#0B121B', oceano: '#1E3248', tierra: '#B3AB8C', frontera: '#F4EFE3', costa: '#132235',
    provincia: 'rgba(244,239,227,0.35)', rio: '#4D6E8C', lago: '#1E3248',
    etiquetaPais: '#FFFFFF', haloPais: 'rgba(15,22,32,0.75)', ciudad: '#F2C230', ciudadTexto: '#FFFFFF',
    haloCiudad: 'rgba(15,22,32,0.8)', mar: '#8FB0CF', sombra: '#2B2416', luz: '#FFF8E8', intensidadRelieve: 0.6,
    politico: ['#B9A97F', '#A9AE86', '#BFA58D', '#9FA78D', '#B4B08A', '#AE9D7E', '#C1B193'],
    acento: '#E0402B',
  },
  // Realista: color por altitud (verde → ocre → roca → nieve) y batimetría, sobre relieve fuerte.
  realista: {
    espacio: '#070B12', oceano: '#2C5A7C', tierra: '#6E8A55', frontera: 'rgba(255,250,235,0.9)', costa: 'rgba(0,0,0,0)',
    provincia: 'rgba(255,250,235,0.4)', rio: '#4F87AE', lago: '#3E7398',
    etiquetaPais: '#FFFFFF', haloPais: 'rgba(10,16,24,0.75)', ciudad: '#F2C230', ciudadTexto: '#FFFFFF',
    haloCiudad: 'rgba(10,16,24,0.8)', mar: '#CFE3F2', sombra: '#1E1A14', luz: '#FFFDF5', intensidadRelieve: 0.75,
    politico: ['rgba(0,0,0,0)'],
    acento: '#E0402B',
  },
  // Noche: Warm Black de MacroWise, acentos en oro.
  noche: {
    espacio: '#0F0F0D', oceano: '#161614', tierra: '#2A2924', frontera: '#5A574D', costa: '#3A3832',
    provincia: 'rgba(255,255,255,0.08)', rio: '#2F3A3E', lago: '#161614',
    etiquetaPais: '#D8D3C4', haloPais: 'rgba(15,15,13,0.8)', ciudad: '#C9A84C', ciudadTexto: '#E9E4D6',
    haloCiudad: 'rgba(15,15,13,0.85)', mar: '#5E5B52', sombra: '#000000', luz: '#6B675C', intensidadRelieve: 0.4,
    politico: ['#34332C', '#2F2E28', '#3A382F', '#2C2B26', '#36342D', '#31302A', '#3B3931'],
    acento: '#C9A84C',
  },
  // Minimal: limpio, tipo explicador.
  minimal: {
    espacio: '#F4F2EE', oceano: '#DDE3E8', tierra: '#FFFFFF', frontera: '#B8BCC2', costa: '#C9CED4',
    provincia: 'rgba(0,0,0,0.08)', rio: '#C9D3DC', lago: '#DDE3E8',
    etiquetaPais: '#4A4F57', haloPais: 'rgba(255,255,255,0.9)', ciudad: '#2E3238', ciudadTexto: '#2E3238',
    haloCiudad: 'rgba(255,255,255,0.9)', mar: '#8A99A8', sombra: '#5A6470', luz: '#FFFFFF', intensidadRelieve: 0.2,
    politico: ['#F3F0E8', '#EEF1F4', '#F1EEF3', '#EEF3EF', '#F4F1EC', '#EFEFF1', '#F2EFEA'],
    acento: '#E0402B',
  },
  satelite: {
    espacio: '#05070A', oceano: '#0B1A2A', tierra: '#3A4A35', frontera: 'rgba(255,255,255,0.85)', costa: 'rgba(255,255,255,0)',
    provincia: 'rgba(255,255,255,0.35)', rio: 'rgba(0,0,0,0)', lago: 'rgba(0,0,0,0)',
    etiquetaPais: '#FFFFFF', haloPais: 'rgba(0,0,0,0.7)', ciudad: '#FFFFFF', ciudadTexto: '#FFFFFF',
    haloCiudad: 'rgba(0,0,0,0.75)', mar: '#BFD6EA', sombra: '#000000', luz: '#FFFFFF', intensidadRelieve: 0.25,
    politico: ['rgba(0,0,0,0)'],
    acento: '#FF4A2E',
  },
  calles: {
    espacio: '#E9E6DF', oceano: '#A0C8F0', tierra: '#F8F4F0', frontera: '#8C7FA6', costa: 'rgba(0,0,0,0)',
    provincia: 'rgba(140,127,166,0.4)', rio: 'rgba(0,0,0,0)', lago: 'rgba(0,0,0,0)',
    etiquetaPais: '#334', haloPais: 'rgba(255,255,255,0.9)', ciudad: '#333', ciudadTexto: '#333',
    haloCiudad: 'rgba(255,255,255,0.9)', mar: '#5D80A6', sombra: '#473B24', luz: '#FFFFFF', intensidadRelieve: 0.25,
    politico: ['rgba(0,0,0,0)'],
    acento: '#E0402B',
  },
};

export const NOMBRES_ESTILO: Record<EstiloId, string> = {
  atlas: 'Atlas 3D (geopolítico)',
  documental: 'Documental (papel)',
  geopolitico: 'Geopolítico (relieve)',
  realista: 'Realista (montañas)',
  noche: 'Noche',
  minimal: 'Minimal',
  satelite: 'Satélite',
  calles: 'Calles (OSM)',
};

/** Paleta efectiva: la del estilo base con lo que sobrescriba el preset. */
export const paletaDe = (id: EstiloId, preset?: PresetEstilo | null): Paleta =>
  preset && preset.base === id ? ({...PALETAS[id], ...(preset.paleta ?? {})} as Paleta) : PALETAS[id];

const abs = (ruta: string) => new URL(ruta, document.baseURI).href;

export const FUENTE_MEDIA = ['Noto Sans Medium'];
export const FUENTE_REGULAR = ['Noto Sans Regular'];
export const FUENTE_CURSIVA = ['Noto Sans Italic'];
// Serifas generadas con scripts/generar-glifos.py (Cinzel y EB Garamond, OFL).
export const FUENTE_ROMANA = ['Cinzel Bold'];
export const FUENTE_SERIFA = ['EB Garamond Medium'];
export const FUENTE_SERIFA_CURSIVA = ['EB Garamond Italic'];

/** Colores que da la elección de estilo a los elementos nuevos (bandos). */
export const BANDOS: Record<string, string> = {adversario: '#CB8C5B', aliado: '#5C844E', bloque: '#C74227'};

const nombre = (o: OpcionesEstilo): ExpressionSpecification =>
  o.idioma === 'es'
    ? ['coalesce', ['get', 'nombre'], ['get', 'nombre_en'], '']
    : ['coalesce', ['get', 'nombre_en'], ['get', 'nombre'], ''];

/** Fuentes de datos propias del portal (Natural Earth local + capas del proyecto). */
const fuentesBase = (): Record<string, SourceSpecification> => ({
  'ne-paises': {type: 'geojson', data: abs('data/paises.geojson'), promoteId: 'iso', tolerance: 0.3},
  // Mar en terrazas por profundidad (scripts/preparar-batimetria.py) y fronteras solo en tierra (sin costa).
  'ne-batimetria': {type: 'geojson', data: abs('data/batimetria.geojson'), tolerance: 0.4},
  'ne-fronteras': {type: 'geojson', data: abs('data/fronteras-tierra.geojson'), tolerance: 0.3},
  // Relieve fijo (scripts/generar-relieve.py): una imagen de atlas que solo se escala. El sombreado en vivo cambiaba
  // de nivel de detalle al acercar la cámara y la tierra "hervía".
  'relieve-fijo': {type: 'raster', tiles: [abs('relieve/') + '{z}/{x}/{y}.webp'], tileSize: 256, minzoom: 0, maxzoom: 6,
    attribution: ATRIBUCION.terreno},
  'ne-etiquetas': {type: 'geojson', data: abs('data/paises-etiquetas.geojson')},
  'ne-ciudades': {type: 'geojson', data: abs('data/ciudades.geojson')},
  'ne-rios': {type: 'geojson', data: abs('data/rios.geojson'), tolerance: 0.5},
  'ne-lagos': {type: 'geojson', data: abs('data/lagos.geojson')},
  'ne-mares': {type: 'geojson', data: abs('data/mares-etiquetas.geojson')},
  'ne-provincias': {type: 'geojson', data: abs('data/provincias-lineas.geojson'), tolerance: 0.5},
  'mm-zonas': {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
  'mm-rutas': {type: 'geojson', data: {type: 'FeatureCollection', features: []}, lineMetrics: true},
  'mm-flechas': {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
  'mm-ataques': {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
  'mm-moviles': {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
  'mm-foco': {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
  'mm-tramas': {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
  'mm-carriles': {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
  'mm-pins': {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
  'mm-textos': {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
  'mm-borrador': {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
  'mm-territorios': {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
  'mm-columnas': {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
});

const fuentesRelieve = (): Record<string, SourceSpecification> => ({
  // Relieve suave y estable: con más detalle, al acercar la cámara el sombreado cambia de nivel cada pocos
  // fotogramas y la tierra parece que "hierve". Con nivel 6 el dibujo es el mismo de principio a fin.
  'dem-sombra': {type: 'raster-dem', tiles: [FUENTES.terreno], encoding: 'terrarium', tileSize: 256, maxzoom: 5,
    attribution: ATRIBUCION.terreno},
  'dem-3d': {type: 'raster-dem', tiles: [FUENTES.terreno], encoding: 'terrarium', tileSize: 256, maxzoom: 13},
});

// Rampa hipsométrica (m): fondo marino, costa, llanura, meseta, montaña, nieve.
const RAMPA_ALTITUD: [number, string][] = [
  [-8000, '#0A2238'], [-4000, '#123A5C'], [-1000, '#1F5680'], [-150, '#2F6E98'], [-1, '#4B8DB5'],
  [0, '#5E7F4C'], [150, '#6E8A55'], [500, '#8E9A62'], [1000, '#B3A673'], [1800, '#A88C66'],
  [2600, '#8B7460'], [3500, '#9C8F84'], [4600, '#ADA398'], [5300, '#D6D1CA'], [6200, '#FFFFFF'],
];

// Terrazas del atlas (colores medidos en la referencia): plataforma gris verdosa, talud verde agua, fondo petróleo.
const TERRAZAS_ATLAS = ['#C4CEC8', 200, '#B6CAC7', 1000, '#A0C3C6', 2000, '#8DBBC0', 3000, '#79AEB8', 4000, '#6AA2AF',
  5000, '#5B95A3', 6000, '#4E8796'];

// Batimetría del atlas (medida): plataforma gris verdosa, talud verde agua, fondo azul petróleo.
const RAMPA_BATIMETRIA: [number, string][] = [
  [-7000, '#4E8E9C'], [-4500, '#5E9FAD'], [-3000, '#72AAB5'], [-1800, '#8AB7BF'],
  [-800, '#A0C3C6'], [-150, '#B4CBC8'], [-1, '#C4CEC8'], [0, '#F2DFCF'], [9000, '#F2DFCF'],
];

/** Capas cartográficas del mapa base (debajo de las anotaciones). */
const capasBase = (id: EstiloId, c: Paleta, o: OpcionesEstilo, rampa: [number, string][]): LayerSpecification[] => {
  const capas: LayerSpecification[] = [];
  const esVectorPropio = id !== 'calles';

  if (esVectorPropio) {
    capas.push({id: 'oceano', type: 'background', paint: {'background-color': c.oceano}});
    if (id === 'satelite') {
      capas.push({id: 'satelite', type: 'raster', source: 'sat', paint: {'raster-saturation': -0.1, 'raster-contrast': 0.08}});
    } else if (id === 'atlas') {
      // Mar en terrazas escalonadas por profundidad, con los colores medidos en la referencia.
      capas.push({id: 'batimetria', type: 'fill', source: 'ne-batimetria', paint: {
        'fill-color': ['step', ['get', 'prof'], ...TERRAZAS_ATLAS] as unknown as ExpressionSpecification,
        'fill-antialias': false}});
      capas.push({id: 'tierra', type: 'fill', source: 'ne-paises', paint: {'fill-color': c.tierra}});
    } else if (id === 'realista') {
      // Sin red, al menos se ve la tierra; con red, la altitud colorea mar y montaña.
      capas.push({id: 'tierra', type: 'fill', source: 'ne-paises', paint: {'fill-color': c.tierra}});
      capas.push({id: 'altitud', type: 'color-relief', source: 'dem-sombra', paint: {
        'color-relief-color': ['interpolate', ['linear'], ['elevation'],
          ...rampa.flatMap(([m, col]) => [m, col])] as unknown as ExpressionSpecification,
        'color-relief-opacity': 1,
      }} as LayerSpecification);
    } else {
      // Terrazas sutiles: cada escalón de profundidad oscurece un poco el color del mar del estilo.
      capas.push({id: 'batimetria', type: 'fill', source: 'ne-batimetria', paint: {
        'fill-color': '#000000', 'fill-antialias': false,
        'fill-opacity': ['step', ['get', 'prof'], 0, 200, 0.04, 1000, 0.07, 2000, 0.1, 3000, 0.13, 4000, 0.16, 5000, 0.19, 6000, 0.22]}});
      capas.push({id: 'tierra', type: 'fill', source: 'ne-paises', paint: {'fill-color': c.tierra, 'fill-antialias': true}});
      if (o.colorearPaises) {
        const pal = c.politico;
        capas.push({id: 'tierra-politica', type: 'fill', source: 'ne-paises', paint: {
          'fill-color': ['match', ['%', ['coalesce', ['get', 'mc7'], 1], pal.length],
            ...pal.flatMap((col, i) => [i, col]), pal[0]] as unknown as ExpressionSpecification,
        }});
      }
    }
  }

  // Sombra desplazada bajo el país resaltado: parece que sobresale del mapa.
  capas.push({id: 'mm-pais-sombra', type: 'line', source: 'ne-paises', paint: {
    'line-color': '#2A1C10',
    'line-opacity': ['*', 0.45, ['coalesce', ['feature-state', 'opBorde'], 0]],
    'line-width': ['interpolate', ['linear'], ['zoom'], 2, 3, 6, 9, 9, 16],
    'line-blur': ['interpolate', ['linear'], ['zoom'], 2, 3, 6, 8, 9, 14],
    'line-translate': [2, 5], 'line-translate-anchor': 'viewport',
  }});
  // Resaltado de países por feature-state: color y opacidad cambian por fotograma.
  capas.push({id: 'mm-pais-relleno', type: 'fill', source: 'ne-paises', paint: {
    'fill-color': ['coalesce', ['feature-state', 'color'], '#000000'],
    'fill-opacity': ['coalesce', ['feature-state', 'op'], 0],
  }});

  // Control territorial: debajo del relieve, como los países resaltados.
  capas.push({id: 'mm-territorio', type: 'fill', source: 'mm-territorios', paint: {
    'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'op']}});

  if (esVectorPropio && id !== 'satelite') {
    capas.push({id: 'lagos', type: 'fill', source: 'ne-lagos', paint: {'fill-color': c.lago}});
  }

  if (o.relieve || id === 'realista' || id === 'atlas') {
    // Relieve fijo (imagen de atlas pre-calculada): solo marca las montañas y es idéntico en cada fotograma.
    capas.push({id: 'relieve', type: 'raster', source: 'relieve-fijo', paint: {
      'raster-opacity': Math.min(1, 0.35 + c.intensidadRelieve), 'raster-fade-duration': 0, 'raster-resampling': 'linear'}});
  }

  if (esVectorPropio) {
    if (o.rios && id !== 'satelite') {
      capas.push({id: 'rios', type: 'line', source: 'ne-rios', minzoom: 2.5, paint: {
        'line-color': c.rio,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 6, 1.2, 9, 2.2],
      }});
    }
    if (o.provincias) {
      capas.push({id: 'provincias', type: 'line', source: 'ne-provincias', minzoom: 3, paint: {
        'line-color': c.provincia, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 8, 1.2],
        'line-dasharray': [3, 2],
      }});
    }
    // Solo fronteras en tierra: la costa no lleva trazo, el contraste lo da el mar (como en la referencia).
    capas.push({id: 'fronteras', type: 'line', source: 'ne-fronteras', paint: {
      'line-color': c.frontera,
      'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 4, 1, 7, 1.8, 10, 2.6],
    }});
  } else if (o.provincias) {
    capas.push({id: 'provincias', type: 'line', source: 'ne-provincias', minzoom: 3, paint: {
      'line-color': c.provincia, 'line-width': 1, 'line-dasharray': [3, 2]}});
  }
  return capas;
};

/** Anotaciones del proyecto: países resaltados (borde), zonas, rutas, pines y textos. */
const capasAnotacion = (c: Paleta): LayerSpecification[] => [
  // Foco: todo lo que no es la historia, oscurecido (los países protagonistas quedan iluminados).
  {id: 'mm-foco', type: 'fill', source: 'mm-foco', paint: {'fill-color': '#1C1611', 'fill-opacity': ['get', 'op']}},
  // Rayado de zonas en disputa o con guerrilla.
  {id: 'mm-tramas', type: 'fill', source: 'mm-tramas', paint: {'fill-pattern': ['get', 'img'], 'fill-opacity': ['get', 'op']}},
  // Corredores de tráfico: franja ancha y difusa con un filo fino en el centro (como la densidad de AIS).
  {id: 'mm-carriles-halo', type: 'line', source: 'mm-carriles', layout: {'line-cap': 'round', 'line-join': 'round'}, paint: {
    'line-color': ['get', 'color'], 'line-opacity': ['*', 0.22, ['get', 'op']], 'line-blur': 14,
    'line-width': ['interpolate', ['exponential', 2], ['zoom'], 3, 10, 6, 34, 9, 120]}},
  {id: 'mm-carriles', type: 'line', source: 'mm-carriles', layout: {'line-cap': 'round', 'line-join': 'round'}, paint: {
    'line-color': ['get', 'color'], 'line-opacity': ['*', 0.55, ['get', 'op']], 'line-width': 1.5, 'line-dasharray': [3, 3]}},
  {id: 'mm-pais-borde', type: 'line', source: 'ne-paises', paint: {
    'line-color': ['coalesce', ['feature-state', 'borde'], c.frontera],
    'line-opacity': ['coalesce', ['feature-state', 'opBorde'], 0],
    'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.2, 5, 2.4, 9, 4],
  }},
  {id: 'mm-territorio-borde', type: 'line', source: 'mm-territorios', paint: {
    'line-color': ['get', 'borde'], 'line-opacity': ['get', 'op'],
    'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 6, 2.2, 9, 3.5]}},
  {id: 'mm-zonas-relleno', type: 'fill', source: 'mm-zonas', paint: {
    'fill-color': ['get', 'color'], 'fill-opacity': ['*', ['coalesce', ['get', 'relleno'], 0.18], ['get', 'op']]}},
  {id: 'mm-zonas-borde', type: 'line', source: 'mm-zonas', filter: ['==', ['get', 'disc'], 1], paint: {
    'line-color': ['get', 'color'], 'line-opacity': ['get', 'op'], 'line-width': 2.5, 'line-dasharray': [2, 1.5]}},
  {id: 'mm-zonas-borde-continuo', type: 'line', source: 'mm-zonas', filter: ['==', ['get', 'disc'], 0], paint: {
    'line-color': ['get', 'color'], 'line-opacity': ['get', 'op'], 'line-width': 2.5}},
  // Resplandor suave bajo las rutas (se leen sobre cualquier fondo, como las líneas de luz de los documentales).
  {id: 'mm-rutas-halo', type: 'line', source: 'mm-rutas', layout: {'line-cap': 'round', 'line-join': 'round'}, paint: {
    'line-color': ['get', 'color'], 'line-width': ['*', ['get', 'grosor'], 3.5], 'line-blur': ['*', ['get', 'grosor'], 2.5],
    'line-opacity': ['*', 0.28, ['get', 'op']]}},
  {id: 'mm-rutas-sombra', type: 'line', source: 'mm-rutas', layout: {'line-cap': 'round', 'line-join': 'round'}, paint: {
    'line-color': 'rgba(0,0,0,0.35)', 'line-width': ['+', ['get', 'grosor'], 3], 'line-blur': 3,
    'line-opacity': ['get', 'op'], 'line-translate': [0, 2]}},
  {id: 'mm-rutas', type: 'line', source: 'mm-rutas', filter: ['==', ['get', 'disc'], 0],
    layout: {'line-cap': 'round', 'line-join': 'round'}, paint: {
      'line-color': ['get', 'color'], 'line-width': ['get', 'grosor'], 'line-opacity': ['get', 'op']}},
  {id: 'mm-rutas-disc', type: 'line', source: 'mm-rutas', filter: ['==', ['get', 'disc'], 1],
    layout: {'line-cap': 'butt', 'line-join': 'round'}, paint: {
      'line-color': ['get', 'color'], 'line-width': ['get', 'grosor'], 'line-opacity': ['get', 'op'],
      'line-dasharray': [2, 1.4]}},
  // Flechas de ataque gruesas: sombra suave, relleno y filo claro.
  {id: 'mm-ataques-sombra', type: 'line', source: 'mm-ataques', paint: {
    'line-color': '#000000', 'line-width': 10, 'line-blur': 10, 'line-opacity': ['*', 0.28, ['get', 'op']], 'line-translate': [4, 6]}},
  // Flecha en 3D: placa extruida con canto sombreado (se ve en perspectiva al inclinar la cámara).
  {id: 'mm-ataques', type: 'fill-extrusion', source: 'mm-ataques', paint: {
    'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'altura'], 'fill-extrusion-base': 0,
    'fill-extrusion-opacity': 0.96, 'fill-extrusion-vertical-gradient': true}},
  // Unidades que viajan por una ruta (drones, aviones, misiles): tumbadas sobre el mapa y orientadas al rumbo.
  {id: 'mm-moviles', type: 'symbol', source: 'mm-moviles', layout: {
    'icon-image': ['get', 'img'], 'icon-rotate': ['get', 'rumbo'], 'icon-rotation-alignment': 'map',
    'icon-pitch-alignment': 'map', 'icon-size': ['*', 0.95, ['get', 'tam']], 'icon-allow-overlap': true,
    'icon-ignore-placement': true}, paint: {'icon-opacity': ['get', 'op']}},
  {id: 'mm-flechas', type: 'symbol', source: 'mm-flechas', layout: {
    'icon-image': 'mm-flecha', 'icon-rotate': ['get', 'rumbo'], 'icon-rotation-alignment': 'map',
    'icon-pitch-alignment': 'map', 'icon-size': ['/', ['get', 'grosor'], 7], 'icon-allow-overlap': true,
    'icon-ignore-placement': true}, paint: {'icon-color': ['get', 'color'], 'icon-opacity': ['get', 'op']}},
  {id: 'mm-pins-pulso', type: 'circle', source: 'mm-pins', filter: ['==', ['get', 'estilo'], 'pulso'], paint: {
    'circle-color': ['get', 'color'], 'circle-radius': ['get', 'radioPulso'], 'circle-opacity': ['get', 'opPulso'],
    'circle-pitch-alignment': 'map'}},
  {id: 'mm-pins-punto', type: 'circle', source: 'mm-pins', filter: ['!', ['in', ['get', 'estilo'], ['literal', ['ficha', 'modelo']]]], paint: {
    'circle-color': ['get', 'color'], 'circle-radius': ['*', ['get', 'escala'], ['match', ['get', 'estilo'], 'capital', 9, 8]],
    'circle-opacity': ['get', 'op'], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': ['*', ['get', 'escala'], 3],
    'circle-stroke-opacity': ['get', 'op']}},
];

const capasEtiquetas = (id: EstiloId, c: Paleta, o: OpcionesEstilo, rot: NonNullable<PresetEstilo['rotulos']> = {}): LayerSpecification[] => {
  const capas: LayerSpecification[] = [];
  if (id === 'calles') return capas;
  // Atlas: serifas y rótulos tumbados sobre el plano del mapa (se ven en perspectiva).
  const atlas = id === 'atlas';
  const fPais = atlas ? FUENTE_ROMANA : FUENTE_MEDIA;
  const fCiudad = atlas ? FUENTE_SERIFA_CURSIVA : FUENTE_REGULAR;
  const fCapital = atlas ? FUENTE_SERIFA_CURSIVA : FUENTE_MEDIA;
  const fMar = atlas ? FUENTE_SERIFA_CURSIVA : FUENTE_CURSIVA;
  const plano = atlas ? {'text-pitch-alignment': 'map', 'text-rotation-alignment': 'map'} as const : {};
  if (o.mares) {
    capas.push({id: 'mares', type: 'symbol', source: 'ne-mares', minzoom: 1.5,
      filter: ['<=', ['coalesce', ['get', 'rank'], 9], 4],
      layout: {...plano, 'text-field': nombre(o), 'text-font': fMar, 'symbol-placement': 'point',
        'text-size': ['interpolate', ['linear'], ['zoom'], 2, 11, 6, 17], 'text-letter-spacing': 0.15,
        'text-max-width': 8, 'symbol-sort-key': ['coalesce', ['get', 'rank'], 9]},
      paint: {'text-color': c.mar, 'text-halo-color': 'rgba(0,0,0,0)'}});
  }
  if (o.ciudades) {
    // Cada tramo de importancia entra a su zoom; los rangos no se solapan (si no, se duplican).
    const capa = (sufijo: string, minzoom: number, minRank: number, maxRank: number): LayerSpecification[] => [
      {id: `ciudades-punto-${sufijo}`, type: 'circle', source: 'ne-ciudades', minzoom,
        filter: ['all', ['>=', ['get', 'rank'], minRank], ['<=', ['get', 'rank'], maxRank]],
        paint: atlas
          ? {'circle-color': c.ciudad, 'circle-radius': ['case', ['==', ['get', 'capital'], 1], 5.5, 4.2],
            'circle-stroke-color': '#5A4A1E', 'circle-stroke-width': 0.8, 'circle-pitch-alignment': 'map'}
          : {'circle-color': c.ciudad, 'circle-radius': ['case', ['==', ['get', 'capital'], 1], 4.2, 3],
            'circle-stroke-color': c.haloCiudad, 'circle-stroke-width': 1.2}},
      {id: `ciudades-texto-${sufijo}`, type: 'symbol', source: 'ne-ciudades', minzoom,
        filter: ['all', ['>=', ['get', 'rank'], minRank], ['<=', ['get', 'rank'], maxRank]],
        layout: {'text-field': ['coalesce', nombre(o), ['get', 'nombre_local']], 'text-font': ['case', ['==', ['get', 'capital'], 1], ['literal', fCapital], ['literal', fCiudad]],
          'text-size': atlas ? ['interpolate', ['linear'], ['zoom'], 3, 14, 8, 21] : ['interpolate', ['linear'], ['zoom'], 3, 11, 8, 16],
          'text-anchor': atlas ? 'top' : 'left',
          'text-offset': atlas ? [0, 0.55] : [0.6, 0], 'symbol-sort-key': ['get', 'rank'], 'text-padding': 4,
          'text-variable-anchor': atlas ? ['top', 'bottom', 'right', 'left'] : ['left', 'right', 'top', 'bottom']},
        paint: {'text-color': c.ciudadTexto, 'text-halo-color': c.haloCiudad, 'text-halo-width': 1.4}},
    ];
    // El atlas es sobrio: solo capitales y grandes ciudades, como en la referencia.
    if (atlas) capas.push(...capa('a', 2.5, 0, 1), ...capa('b', 5, 2, 3));
    // Los demás estilos, igual de contenidos: al acercarse, las ciudades pequeñas (Zhongli, Hsinchu…) tapaban el objetivo.
    else capas.push(...capa('a', 2.5, 0, 1), ...capa('b', 4.5, 2, 3), ...capa('c', 7, 4, 5));
  }
  // Los países van después: las capas de arriba se colocan primero y ganan las colisiones.
  if (o.etiquetasPaises) {
    // Fuera bases militares, glaciares y territorios diminutos (min_label ≥ 6 en Natural Earth).
    capas.push({id: 'paises-etiquetas', type: 'symbol', source: 'ne-etiquetas',
      filter: ['<', ['coalesce', ['get', 'min_label'], 5], 6], layout: {
      ...plano,
      'text-field': rot.mayusculas === false ? nombre(o) : ['upcase', nombre(o)], 'text-font': fPais,
      // La escala va dentro de cada parada: "zoom" solo puede ir en el interpolate de primer nivel.
      'text-size': ['interpolate', ['linear'], ['zoom'],
        1, ['*', (rot.escala ?? 1) * (atlas ? 1.25 : 1), ['-', 12, ['/', ['get', 'rank'], 2]]],
        4, ['*', (rot.escala ?? 1) * (atlas ? 1.5 : 1), ['-', 18, ['/', ['get', 'rank'], 2]]],
        // A zoom alto, los países pequeños (Taiwán, Hong Kong) no deben tapar la isla con un rótulo enorme.
        7, ['*', (rot.escala ?? 1) * (atlas ? 1.5 : 1), ['-', 26, ['*', 2, ['get', 'rank']]]]],
      'text-letter-spacing': rot.espaciado ?? (atlas ? 0.38 : 0.14), 'text-max-width': atlas ? 16 : 7,
      'symbol-sort-key': ['coalesce', ['get', 'min_label'], 5], 'text-padding': 6},
    paint: atlas
      ? {'text-color': c.etiquetaPais, 'text-halo-color': c.haloPais, 'text-halo-width': 0.8, 'text-halo-blur': 1}
      : {'text-color': c.etiquetaPais, 'text-halo-color': c.haloPais, 'text-halo-width': 1.4, 'text-halo-blur': 0.5}});
  }
  return capas;
};

/** Etiquetas de pines y textos libres: siempre arriba del todo. */
const capasTextoProyecto = (): LayerSpecification[] => [
  // Figuras 3D extruidas.
  {id: 'mm-columnas', type: 'fill-extrusion', source: 'mm-columnas', paint: {
    'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'altura'],
    'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-opacity': 0.95, 'fill-extrusion-vertical-gradient': true}},
  // Fichas de pie: sombra en el suelo y la ficha mirando a cámara.
  {id: 'mm-fichas-sombra', type: 'circle', source: 'mm-pins', filter: ['==', ['get', 'estilo'], 'ficha'], paint: {
    'circle-color': '#1A120A', 'circle-radius': ['*', 13, ['get', 'tam'], ['get', 'escala']], 'circle-blur': 0.9,
    'circle-opacity': ['*', 0.45, ['get', 'op']], 'circle-pitch-alignment': 'map', 'circle-translate': [6, 2]}},
  {id: 'mm-fichas', type: 'symbol', source: 'mm-pins', filter: ['==', ['get', 'estilo'], 'ficha'], layout: {
    'icon-image': ['get', 'ficha'], 'icon-anchor': 'bottom', 'icon-size': ['*', 0.9, ['get', 'tam'], ['get', 'escala']],
    'icon-allow-overlap': true, 'icon-ignore-placement': true,
    'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport'},
  paint: {'icon-opacity': ['get', 'op']}},
  {id: 'mm-pins-papel', type: 'symbol', source: 'mm-pins', filter: ['==', ['get', 'etiqueta'], 'papel'], layout: {
    'text-field': ['get', 'texto'], 'text-font': FUENTE_MEDIA, 'text-size': 20, 'text-letter-spacing': 0.06,
    'text-anchor': 'bottom', 'text-offset': ['case', ['==', ['get', 'estilo'], 'ficha'], ['literal', [0, -5.4]], ['literal', [0, -1.6]]], 'text-max-width': 30, 'text-allow-overlap': true, 'text-ignore-placement': true,
    'icon-image': 'mm-papel', 'icon-text-fit': 'both', 'icon-text-fit-padding': [8, 14, 6, 14],
    'icon-allow-overlap': true, 'icon-ignore-placement': true},
  paint: {'text-color': '#1A1A17', 'text-opacity': ['get', 'op'], 'icon-opacity': ['get', 'op']}},
  {id: 'mm-pins-halo', type: 'symbol', source: 'mm-pins', filter: ['==', ['get', 'etiqueta'], 'halo'], layout: {
    'text-field': ['get', 'texto'], 'text-font': FUENTE_MEDIA, 'text-size': 20, 'text-letter-spacing': 0.06,
    'text-anchor': 'bottom', 'text-offset': ['case', ['==', ['get', 'estilo'], 'ficha'], ['literal', [0, -5]], ['literal', [0, -1.1]]], 'text-max-width': 30, 'text-allow-overlap': true, 'text-ignore-placement': true},
  paint: {'text-color': '#FFFFFF', 'text-halo-color': 'rgba(0,0,0,0.8)', 'text-halo-width': 2, 'text-opacity': ['get', 'op']}},
  {id: 'mm-textos', type: 'symbol', source: 'mm-textos', layout: {
    'text-field': ['get', 'texto'],
    'text-font': ['case', ['==', ['get', 'cursiva'], 1], ['literal', FUENTE_CURSIVA], ['literal', FUENTE_MEDIA]],
    'text-size': ['get', 'tamano'], 'text-letter-spacing': ['get', 'espaciado'], 'text-max-width': 14,
    'text-allow-overlap': true, 'text-ignore-placement': true, 'text-pitch-alignment': 'viewport'},
  paint: {'text-color': ['get', 'color'], 'text-opacity': ['get', 'op'], 'text-halo-color': ['get', 'halo'],
    'text-halo-width': 1.6}},
  // Borrador mientras se dibuja una ruta.
  {id: 'mm-borrador-linea', type: 'line', source: 'mm-borrador', paint: {
    'line-color': '#FF5A36', 'line-width': 3, 'line-dasharray': [1, 1]}},
  {id: 'mm-borrador-puntos', type: 'circle', source: 'mm-borrador', filter: ['==', ['geometry-type'], 'Point'], paint: {
    'circle-color': '#FFFFFF', 'circle-radius': 5, 'circle-stroke-color': '#FF5A36', 'circle-stroke-width': 2}},
];

let estiloCallesCache: StyleSpecification | null = null;

/** Construye el estilo completo. El mismo estilo se usa en el editor y en la exportación. */
export const construirEstilo = async (id: EstiloId, o: OpcionesEstilo, preset?: PresetEstilo | null): Promise<StyleSpecification> => {
  const c = paletaDe(id, preset);
  const propio = preset && preset.base === id ? preset : null;
  const rampa = propio?.rampaAltitud?.length ? propio.rampaAltitud : RAMPA_ALTITUD;
  const sources: Record<string, SourceSpecification> = {...fuentesBase()};
  if (o.relieve || o.terreno3d || id === 'realista' || id === 'atlas') Object.assign(sources, fuentesRelieve());
  if (id === 'satelite') {
    sources.sat = {type: 'raster', tiles: [FUENTES.satelite], tileSize: 256, maxzoom: 15, attribution: ATRIBUCION.satelite};
  }

  let capasCalles: LayerSpecification[] = [];
  let glyphs = abs('fonts/') + '{fontstack}/{range}.pbf';
  if (id === 'calles') {
    if (!estiloCallesCache) {
      const r = await fetch(FUENTES.calles);
      if (!r.ok) throw new Error('No se pudo cargar el estilo de calles (OpenFreeMap).');
      estiloCallesCache = (await r.json()) as StyleSpecification;
    }
    Object.assign(sources, estiloCallesCache.sources);
    capasCalles = estiloCallesCache.layers;
    // Las etiquetas de OpenFreeMap usan sus propias fuentes.
    glyphs = estiloCallesCache.glyphs ?? glyphs;
  }

  const capas = [
    ...capasCalles.filter((l) => l.type !== 'symbol'),
    ...capasBase(id, c, o, rampa),
    ...capasAnotacion(c),
    ...capasCalles.filter((l) => l.type === 'symbol'),
    ...capasEtiquetas(id, c, o, propio?.rotulos),
    ...capasTextoProyecto(),
  ];

  const estilo: StyleSpecification = {
    version: 8,
    glyphs,
    sources,
    layers: capas,
    // Globo en vistas amplias y plano (Mercator) al acercarse: los mapas regionales se leen mejor planos.
    projection: {type: o.globo ? ['interpolate', ['linear'], ['zoom'], 3.5, 'vertical-perspective', 5, 'mercator'] : 'mercator'},
    sky: {
      'sky-color': c.espacio,
      'horizon-color': c.oceano,
      'fog-color': c.espacio,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.8,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 5, 0.6, 8, 0],
    },
  };
  if (o.terreno3d) estilo.terrain = {source: 'dem-3d', exaggeration: o.exageracion};
  if (id === 'calles' && !glyphs.includes('{fontstack}')) estilo.glyphs = abs('fonts/') + '{fontstack}/{range}.pbf';
  return estilo;
};
