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
};

export type ElemPin = Base & {
  tipo: 'pin';
  en: LonLat;
  texto: string;
  color: string;
  estilo: 'punto' | 'pulso' | 'capital';
  etiqueta: 'papel' | 'halo' | 'ninguna';
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
};

export type ElemTitulo = Base & {
  tipo: 'titulo';
  texto: string;
  subtitulo: string;
  posicion: 'arriba' | 'abajo' | 'centro';
};

export type Elemento = ElemPais | ElemRuta | ElemPin | ElemTexto | ElemZona | ElemTitulo;
export type TipoElemento = Elemento['tipo'];

export type EstiloId = 'documental' | 'geopolitico' | 'noche' | 'satelite' | 'calles' | 'minimal';

export type OpcionesEstilo = {
  relieve: boolean;
  terreno3d: boolean;
  exageracion: number;
  globo: boolean;
  etiquetasPaises: boolean;
  ciudades: boolean;
  rios: boolean;
  provincias: boolean;
  mares: boolean;
  colorearPaises: boolean;
  grano: number; // 0–1
  vineta: number; // 0–1
  idioma: 'es' | 'en';
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
  ciudades: true,
  rios: true,
  provincias: false,
  mares: true,
  colorearPaises: false,
  grano: 0.35,
  vineta: 0.4,
  idioma: 'es',
};

export const proyectoNuevo = (): Proyecto => ({
  version: 1,
  nombre: 'Sin título',
  ancho: 1920,
  alto: 1080,
  fps: 30,
  duracion: 10,
  estilo: 'documental',
  opciones: {...OPCIONES_POR_DEFECTO},
  fuente: 'Mapa: Natural Earth',
  camara: [],
  elementos: [],
});

// Proyecto de muestra: el estrecho de Ormuz, para ver todo funcionando al abrir.
export const proyectoDemo = (): Proyecto => {
  const p = proyectoNuevo();
  p.nombre = 'Demo — Estrecho de Ormuz';
  p.duracion = 12;
  p.camara = [
    {id: uid(), t: 0, centro: [30, 25], zoom: 1.6, rumbo: 0, inclinacion: 0, curva: 'suave', vuelo: false},
    {id: uid(), t: 3.5, centro: [53, 27], zoom: 4.6, rumbo: 0, inclinacion: 0, curva: 'suave', vuelo: true},
    {id: uid(), t: 9, centro: [56.2, 26.4], zoom: 6.6, rumbo: -12, inclinacion: 45, curva: 'suave', vuelo: false},
  ];
  p.elementos = [
    {id: uid(), tipo: 'titulo', nombre: 'Título', texto: 'El estrecho de Ormuz', subtitulo: 'Por aquí pasa el petróleo del Golfo',
      posicion: 'arriba', desde: 0.4, hasta: 3.2, fundido: 0.4},
    {id: uid(), tipo: 'pais', nombre: 'Irán', iso: 'IRN', color: '#C44A33', opacidad: 0.55, borde: true, pulso: false,
      desde: 3.6, hasta: null, fundido: 0.6},
    {id: uid(), tipo: 'pais', nombre: 'Omán', iso: 'OMN', color: '#C9A84C', opacidad: 0.5, borde: true, pulso: false,
      desde: 4.2, hasta: null, fundido: 0.6},
    {id: uid(), tipo: 'ruta', nombre: 'Ruta de petroleros', puntos: [[50.2, 26.7], [54.5, 26.2], [56.4, 26.5], [57.5, 25.2], [60.5, 23]],
      color: '#B3261E', grosor: 5, discontinua: true, flecha: true, forma: 'recta', trazo: 3, desde: 5.5, hasta: null, fundido: 0.2},
    {id: uid(), tipo: 'pin', nombre: 'Ormuz', en: [56.3, 26.6], texto: 'ESTRECHO DE ORMUZ', color: '#B3261E', estilo: 'pulso',
      etiqueta: 'papel', desde: 8.6, hasta: null, fundido: 0.3},
    {id: uid(), tipo: 'zona', nombre: 'Zona', en: [56.3, 26.5], radioKm: 60, color: '#B3261E', discontinua: true,
      desde: 9.2, hasta: null, fundido: 0.5},
  ];
  return p;
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
