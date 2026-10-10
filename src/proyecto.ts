// El proyecto entero es un JSON: se guarda, se carga y se versiona.
// Tiempos en segundos. Coordenadas [longitud, latitud].

export type LonLat = [number, number];

export type Curva = 'suave' | 'lineal' | 'entrada' | 'salida';

export type Keyframe = {
  id: string;
  t: number;
  centro: LonLat;
  zoom: number;
  rumbo: number; // bearing, grados
  inclinacion: number; // pitch, grados
  curva: Curva;
  /** Se aleja a mitad de trayecto y vuelve a acercarse, como un avión. */
  vuelo: boolean;
};

type Base = {
  id: string;
  nombre: string;
  desde: number;
  hasta: number | null;
  /** Segundos de fundido de entrada y salida. */
  fundido: number;
  oculto?: boolean;
};

export type ElemPais = Base & {
  tipo: 'pais';
  iso: string;
  color: string;
  opacidad: number;
  borde: boolean;
  pulso: boolean;
};

export type ElemRuta = Base & {
  tipo: 'ruta';
  puntos: LonLat[];
  color: string;
  grosor: number;
  discontinua: boolean;
  flecha: boolean;
  forma: 'geodesica' | 'arco' | 'recta';
  /** Segundos que tarda en dibujarse. 0 = aparece entera. */
  trazo: number;
  /** 'linea' (por defecto) o 'ataque': flecha gruesa que se ensancha y avanza, como en los documentales. */
  estilo?: 'linea' | 'ataque';
  /** Ancho de la flecha de ataque, en km. */
  anchoKm?: number;
  /** Unidad que viaja por la ruta mientras se dibuja (dron, shahed, avion, misil, barco…), vista desde arriba. */
  movil?: string;
  /** Tamaño de la unidad que viaja (1 = normal). */
  tamanoMovil?: number;
};

export type ElemPin = Base & {
  tipo: 'pin';
  en: LonLat;
  texto: string;
  color: string;
  estilo: 'punto' | 'pulso' | 'capital' | 'ficha';
  etiqueta: 'papel' | 'halo' | 'ninguna';
  /** Ficha hexagonal de pie: emoji o texto corto dentro… */
  icono?: string;
  /** …o una imagen (retrato, logo), guardada como data URL pequeña. */
  imagen?: string;
  fondo?: 'color' | 'blanco';
  tamano?: number;
  /** hexagono (ficha de pie), peana (silueta de pie sobre una base hexagonal, para frentes) o unidad
   * (barco o avión pequeño y blanco, con sombra y banderita del color del bando). */
  forma?: 'hexagono' | 'peana' | 'unidad';
};

export type ElemTexto = Base & {
  tipo: 'texto';
  en: LonLat;
  texto: string;
  tamano: number;
  color: string;
  mayusculas: boolean;
  cursiva: boolean;
  espaciado: number;
};

export type ElemZona = Base & {
  tipo: 'zona';
  en: LonLat;
  radioKm: number;
  color: string;
  discontinua: boolean;
  /** area = círculo translúcido; objetivo = doble anillo que late; radar = alcance con barrido. */
  estilo?: 'area' | 'objetivo' | 'radar';
};

/** Control territorial: el color avanza sobre el país como un frente. */
export type ElemTerritorio = Base & {
  tipo: 'territorio';
  iso: string;
  color: string;
  opacidad: number;
  /** Hacia dónde avanza el frente, en grados (0 = norte, 90 = este). */
  direccion: number;
  /** Segundos que tarda en cubrir el país. */
  avance: number;
  /** Fracción final cubierta (1 = todo el país). */
  hasta_fraccion: number;
};

export type ElemTitulo = Base & {
  tipo: 'titulo';
  texto: string;
  subtitulo: string;
  posicion: 'arriba' | 'abajo' | 'centro';
};

/** Figura 3D: columna extruida sobre un punto (cifras, presencia militar, producción…). */
export type ElemColumna = Base & {
  tipo: 'columna';
  en: LonLat;
  /** Altura en km, a escala real del mapa: 40–200 km se leen bien a escala de país (zoom 5–6). */
  alturaKm: number;
  radioKm: number;
  color: string;
  forma: 'cilindro' | 'prisma' | 'hexagono';
  texto: string;
  /** Segundos que tarda en crecer. */
  crece: number;
};

export type Elemento = ElemPais | ElemRuta | ElemPin | ElemTexto | ElemZona | ElemTitulo | ElemTerritorio | ElemColumna;
export type TipoElemento = Elemento['tipo'];

export type EstiloId = 'atlas' | 'documental' | 'geopolitico' | 'realista' | 'noche' | 'satelite' | 'calles' | 'minimal';

export type OpcionesEstilo = {
  relieve: boolean;
  terreno3d: boolean;
  exageracion: number;
  globo: boolean;
  etiquetasPaises: boolean;
  /** Solo rótulos de la historia: nombres de los países que salen en la pieza; ciudades y mares solo si los añades. */
  soloHistoria?: boolean;
  ciudades: boolean;
  rios: boolean;
  provincias: boolean;
  mares: boolean;
  colorearPaises: boolean;
  grano: number; // 0–1
  vineta: number; // 0–1
  /** Desenfoque de profundidad (tilt-shift) en la parte alta del encuadre, 0–1. */
  desenfoque: number;
  /** Etalonaje cálido y plano (negros levantados), 0–1. */
  etalonaje: number;
  /** Desenfoque de movimiento de cine (3 vistas por fotograma; el render tarda el triple). */
  desenfoqueMovimiento?: boolean;
  idioma: 'es' | 'en';
};

/**
 * Estilo a medida, normalmente sacado de analizar un vídeo de referencia
 * (ver referencias/README.md). Se apoya en un estilo base y sobrescribe lo que trae.
 */
export type PresetEstilo = {
  nombre: string;
  base: EstiloId;
  /** Vídeo o fuente de donde sale el estilo. */
  referencia?: string;
  /** Colores en hex por rol (oceano, tierra, frontera, acento, etiquetaPais…). */
  paleta?: Record<string, string | number>;
  /** Color por altitud: pares [metros, hex], de menor a mayor. */
  rampaAltitud?: [number, string][];
  rotulos?: {mayusculas?: boolean; espaciado?: number; escala?: number};
  opciones?: Partial<OpcionesEstilo>;
};

export type Proyecto = {
  version: 1;
  nombre: string;
  ancho: number;
  alto: number;
  fps: number;
  duracion: number;
  estilo: EstiloId;
  opciones: OpcionesEstilo;
  fuente: string;
  preset?: PresetEstilo | null;
  /** Logo o marca de agua en pantalla (data URL), abajo a la izquierda. */
  marca?: {imagen: string; opacidad: number; tamano: number} | null;
  camara: Keyframe[];
  elementos: Elemento[];
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export const OPCIONES_POR_DEFECTO: OpcionesEstilo = {
  relieve: true,
  terreno3d: false,
  exageracion: 1.4,
  globo: true,
  etiquetasPaises: true,
  soloHistoria: true,
  ciudades: true,
  rios: true,
  provincias: false,
  mares: true,
  colorearPaises: false,
  grano: 0.35,
  vineta: 0.4,
  desenfoque: 0,
  etalonaje: 0,
  idioma: 'es',
};

/** Ajustes que trae cada estilo al elegirlo (se pueden cambiar después). */
export const OPCIONES_DE_ESTILO: Partial<Record<EstiloId, Partial<OpcionesEstilo>>> = {
  atlas: {globo: false, relieve: true, rios: false, colorearPaises: false, grano: 0, vineta: 0.45, desenfoque: 0.6, etalonaje: 0.5},
  documental: {grano: 0.35, vineta: 0.4, desenfoque: 0, etalonaje: 0},
  geopolitico: {grano: 0.15, vineta: 0.45, desenfoque: 0.3, etalonaje: 0},
  realista: {grano: 0.1, vineta: 0.4, desenfoque: 0.3, etalonaje: 0},
};

export const proyectoNuevo = (): Proyecto => ({
  version: 1,
  nombre: 'Sin título',
  ancho: 1920,
  alto: 1080,
  fps: 30,
  duracion: 10,
  estilo: 'atlas',
  opciones: {...OPCIONES_POR_DEFECTO, ...OPCIONES_DE_ESTILO.atlas},
  fuente: 'Mapa: Natural Earth',
  camara: [],
  elementos: [],
});

// Proyecto de muestra en estilo Atlas: Golfo Pérsico, país protagonista, frente, fichas y objetivos.
export const proyectoDemo = (): Proyecto => {
  const p = proyectoNuevo();
  p.nombre = 'Demo — El Golfo';
  p.duracion = 14;
  p.fuente = 'Mapa: Natural Earth · AWS Terrain Tiles';
  p.camara = [
    {id: uid(), t: 0, centro: [50.5, 27.5], zoom: 3.9, rumbo: 0, inclinacion: 35, curva: 'suave', vuelo: false},
    {id: uid(), t: 5, centro: [53.8, 27.2], zoom: 4.8, rumbo: -4, inclinacion: 55, curva: 'suave', vuelo: false},
    {id: uid(), t: 14, centro: [55.6, 26.4], zoom: 5.7, rumbo: -10, inclinacion: 60, curva: 'suave', vuelo: false},
  ];
  p.elementos = [
    {id: uid(), tipo: 'titulo', nombre: 'Título', texto: 'El estrecho de Ormuz', subtitulo: 'Por donde sale el petróleo del Golfo',
      posicion: 'arriba', desde: 0.4, hasta: 3.4, fundido: 0.4},
    {id: uid(), tipo: 'pais', nombre: 'Irán', iso: 'IRN', color: '#CB8C5B', opacidad: 0.94, borde: true, pulso: false,
      desde: 1.5, hasta: null, fundido: 0.8},
    {id: uid(), tipo: 'territorio', nombre: 'Avance en Irak', iso: 'IRQ', color: '#5C844E', opacidad: 0.94, direccion: 330,
      avance: 4, hasta_fraccion: 0.6, desde: 4, hasta: null, fundido: 0.3},
    {id: uid(), tipo: 'pin', nombre: 'Ficha 1', en: [47.9, 29.6], texto: '', color: '#5C844E', estilo: 'ficha', etiqueta: 'ninguna',
      icono: '🪖', fondo: 'color', tamano: 1, desde: 5, hasta: null, fundido: 0.2},
    {id: uid(), tipo: 'pin', nombre: 'Ficha 2', en: [49.2, 29.0], texto: '', color: '#5C844E', estilo: 'ficha', etiqueta: 'ninguna',
      icono: '🪖', fondo: 'color', tamano: 1, desde: 5.4, hasta: null, fundido: 0.2},
    {id: uid(), tipo: 'pin', nombre: 'Flota', en: [58.3, 24.6], texto: '', color: '#FFFFFF', estilo: 'ficha', etiqueta: 'ninguna',
      icono: '🚢', fondo: 'blanco', tamano: 1, desde: 7, hasta: null, fundido: 0.2},
    {id: uid(), tipo: 'zona', nombre: 'Objetivo', en: [56.3, 26.6], radioKm: 45, color: '#C74227', discontinua: false, estilo: 'objetivo',
      desde: 9, hasta: null, fundido: 0.4},
    {id: uid(), tipo: 'zona', nombre: 'Radar', en: [51.5, 25.3], radioKm: 160, color: '#3FD06A', discontinua: false, estilo: 'radar',
      desde: 10, hasta: null, fundido: 0.5},
    {id: uid(), tipo: 'ruta', nombre: 'Ruta de petroleros', puntos: [[50.2, 26.7], [54.5, 26.2], [56.4, 26.5], [57.5, 25.2], [60.5, 23]],
      color: '#C74227', grosor: 4, discontinua: true, flecha: true, forma: 'recta', trazo: 3, desde: 8, hasta: null, fundido: 0.2},
  ];
  return p;
};

/**
 * Cambia el formato del proyecto. Si cambia la orientación (horizontal ↔ vertical), la cámara se
 * adapta: en vertical el encuadre es mucho más estrecho, así que se aleja 0,8 de zoom para que el
 * protagonista siga entrando (y se acerca al volver a horizontal).
 */
export const DELTA_ZOOM_ORIENTACION = 0.8;
export const cambiarFormato = (p: Proyecto, ancho: number, alto: number, adaptarCamara = true) => {
  const antesVertical = p.alto > p.ancho;
  const ahoraVertical = alto > ancho;
  p.ancho = ancho;
  p.alto = alto;
  if (adaptarCamara && antesVertical !== ahoraVertical) {
    const d = ahoraVertical ? -DELTA_ZOOM_ORIENTACION : DELTA_ZOOM_ORIENTACION;
    for (const k of p.camara) k.zoom = Math.max(0, +(k.zoom + d).toFixed(3));
    return d;
  }
  return 0;
};

export const normalizar = (p: Partial<Proyecto>): Proyecto => {
  const base = proyectoNuevo();
  return {
    ...base,
    ...p,
    opciones: {...base.opciones, ...(p.opciones ?? {})},
    camara: p.camara ?? [],
    elementos: p.elementos ?? [],
  } as Proyecto;
};
