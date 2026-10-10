// Modelos 3D de verdad sobre el mapa (Three.js en una capa propia de MapLibre).
// Las unidades (tanques, barcos, aviones, drones, misiles…) se construyen aquí con piezas geométricas de baja
// poligonización, con luz y sombra reales: se ven con volumen al inclinar o girar la cámara, como en la referencia.
// Si en public/modelos/lista.json hay modelos .glb (p. ej. de Kenney o Quaternius, CC0), se usan en su lugar.
import type {CustomLayerInterface, Map as MapLibre} from 'maplibre-gl';
import {MercatorCoordinate} from 'maplibre-gl';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export type Modelo3d = {
  /** Nombre del modelo (tanque, barco, avion, dron, dron-ala, shahed, enjambre, misil, helicoptero, submarino). */
  modelo: string;
  en: [number, number];
  /** Rumbo en grados (0 = norte, sentido horario). */
  rumbo: number;
  /** Color del bando (banda, bandera). */
  color: string;
  op: number;
  /** Tamaño relativo (1 = normal: unos 70 px de largo). */
  tam: number;
  /** Para fichas y peanas: imagen de la cara (icono, retrato) y su clave para reutilizarla. */
  cara?: HTMLCanvasElement;
  clave?: string;
};

const SINONIMOS: Record<string, string> = {
  soldado: '', infante: '', tanques: 'tanque', blindado: 'tanque', flota: 'barco', buque: 'barco', armada: 'barco',
  portaaviones: 'portaaviones', destructor: 'barco', fragata: 'barco', avion: 'avion', caza: 'avion', aviacion: 'avion',
  misiles: 'misil', drones: 'dron', cuadricoptero: 'dron', bayraktar: 'dron-ala', reaper: 'dron-ala',
  kamikaze: 'shahed', geran: 'shahed', 'shahed-136': 'shahed', submarinos: 'submarino', helicoptero: 'helicoptero',
  tanquero: 'petrolero', petroleros: 'petrolero', carguero: 'portacontenedores', mercante: 'portacontenedores',
  contenedores: 'portacontenedores', portacontenedores: 'portacontenedores',
  '🚢': 'barco', '⛴️': 'barco', '🛳️': 'barco', '✈️': 'avion', '✈': 'avion', '🛩️': 'avion', '🚀': 'misil', '🚁': 'helicoptero',
};

const limpiar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Nombre del modelo 3D para un icono, o null si no hay modelo (se queda la figura plana). */
export const modeloPara = (icono: string | undefined): string | null => {
  if (!icono) return null;
  const n = SINONIMOS[icono] ?? SINONIMOS[icono.replace(/️/g, '')] ?? SINONIMOS[limpiar(icono)] ?? limpiar(icono);
  return CONSTRUCTORES[n] || externos.has(n) ? n : null;
};

// ── Piezas ─────────────────────────────────────────────────────────────────────────
// Ejes del modelo: x = derecha, y = morro (adelante), z = arriba. Largo total ≈ 1.

type Mats = {casco: THREE.Material; gris: THREE.Material; oscuro: THREE.Material; bando: THREE.Material; cristal: THREE.Material};

const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({color, flatShading: true, roughness: 0.72, metalness: 0.05, ...extra});

const caja = (g: THREE.Group, m: THREE.Material, w: number, l: number, h: number, x: number, y: number, z: number) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, l, h), m);
  o.position.set(x, y, z);
  g.add(o);
  return o;
};

/** Cilindro a lo largo del morro (eje y). */
const tubo = (g: THREE.Group, m: THREE.Material, r1: number, r2: number, l: number, x: number, y: number, z: number, lados = 10) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, l, lados), m);
  o.position.set(x, y, z);
  g.add(o);
  return o;
};

/** Cilindro vertical (eje z). */
const torre = (g: THREE.Group, m: THREE.Material, r1: number, r2: number, h: number, x: number, y: number, z: number, lados = 8) => {
  const o = tubo(g, m, r1, r2, h, x, y, z, lados);
  o.rotation.x = Math.PI / 2;
  return o;
};

/** Placa plana a partir de un contorno (x, y), con grosor hacia arriba. */
const placa = (g: THREE.Group, m: THREE.Material, puntos: [number, number][], grosor: number, z: number) => {
  const s = new THREE.Shape(puntos.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(s, {depth: grosor, bevelEnabled: false});
  const o = new THREE.Mesh(geo, m);
  o.position.z = z;
  g.add(o);
  return o;
};

/** Contorno simétrico: se da la mitad derecha de morro a cola y se refleja. */
const simetrico = (mitad: [number, number][]): [number, number][] =>
  [...mitad, ...mitad.slice().reverse().map(([x, y]) => [-x, y] as [number, number])].filter((p, i, a) =>
    i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);

const banderita = (g: THREE.Group, m: Mats, x: number, y: number, z: number, alto = 0.16) => {
  tubo(g, m.oscuro, 0.006, 0.006, alto, x, y, z + alto / 2, 4).rotation.x = Math.PI / 2;
  caja(g, m.bando, 0.006, 0.09, 0.055, x, y - 0.045, z + alto - 0.03);
};

const texturaDe = (cv: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/** Plano de pie que mira hacia -y (hacia la cámara cuando el rumbo de la pieza es el de la cámara). */
const cartel = (g: THREE.Group, cv: HTMLCanvasElement, ancho: number, alto: number, z: number, y = 0) => {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto),
    // Sin brillo: la cara es una impresión, como en una ficha de juego de mesa.
    new THREE.MeshBasicMaterial({map: texturaDe(cv), color: '#F2EFEA', transparent: true, alphaTest: 0.35, side: THREE.DoubleSide}));
  o.rotation.x = Math.PI / 2;
  o.position.set(0, y, z);
  g.add(o);
  return o;
};

const CONSTRUCTORES: Record<string, (m: Mats, d?: Modelo3d) => THREE.Group> = {
  // Ficha hexagonal de pie, de verdad en 3D: disco de seis lados con grosor, canto claro y la cara impresa.
  ficha: (m, d) => {
    const g = new THREE.Group();
    const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.09, 6), [mat('#C9C1B4'), m.casco, m.casco]);
    cuerpo.position.z = 0.53;
    g.add(cuerpo);
    if (d?.cara) cartel(g, d.cara, 1.105, 1.105, 0.53, -0.047);
    // Patita que la sostiene, como una pieza de juego de mesa.
    caja(g, m.gris, 0.36, 0.22, 0.03, 0, 0.0, 0.015);
    return g;
  },
  // Peana: base hexagonal del color del bando con la figura de pie encima.
  peana: (m, d) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.1, 6), [m.casco, m.bando, m.oscuro]);
    base.rotation.x = Math.PI / 2;
    base.position.z = 0.05;
    g.add(base);
    if (d?.cara) cartel(g, d.cara, 0.8, 0.8, 0.5);
    return g;
  },
  tanque: (m) => {
    const g = new THREE.Group();
    caja(g, m.oscuro, 0.13, 0.86, 0.12, 0.2, 0, 0.06);
    caja(g, m.oscuro, 0.13, 0.86, 0.12, -0.2, 0, 0.06);
    placa(g, m.bando, simetrico([[0.0, 0.46], [0.2, 0.4], [0.24, 0.3], [0.24, -0.42], [0.0, -0.42]]), 0.1, 0.08);
    const t = torre(g, m.bando, 0.15, 0.17, 0.1, 0, -0.06, 0.23, 7);
    t.scale.set(1, 1, 1);
    caja(g, m.casco, 0.12, 0.12, 0.04, 0, -0.16, 0.3);
    tubo(g, m.oscuro, 0.018, 0.024, 0.55, 0, 0.32, 0.24, 8);
    return g;
  },
  barco: (m) => {
    const g = new THREE.Group();
    placa(g, m.oscuro, simetrico([[0, 0.5], [0.07, 0.3], [0.09, 0.0], [0.08, -0.46], [0, -0.48]]), 0.05, 0);
    placa(g, m.casco, simetrico([[0, 0.5], [0.075, 0.3], [0.1, 0.0], [0.09, -0.46], [0, -0.48]]), 0.05, 0.05);
    caja(g, m.gris, 0.12, 0.12, 0.012, 0, -0.38, 0.104);
    caja(g, m.casco, 0.13, 0.22, 0.07, 0, -0.02, 0.135);
    caja(g, m.casco, 0.09, 0.1, 0.07, 0, 0.03, 0.2);
    caja(g, m.oscuro, 0.092, 0.012, 0.02, 0, 0.081, 0.215);
    torre(g, m.gris, 0.008, 0.012, 0.18, 0, -0.02, 0.32, 5);
    caja(g, m.gris, 0.08, 0.01, 0.01, 0, -0.02, 0.36);
    torre(g, m.casco, 0.04, 0.045, 0.04, 0, 0.26, 0.12, 8);
    tubo(g, m.gris, 0.007, 0.009, 0.12, 0, 0.33, 0.13, 6);
    caja(g, m.gris, 0.06, 0.08, 0.05, 0, -0.2, 0.125);
    banderita(g, m, 0, -0.44, 0.1);
    return g;
  },
  // Petrolero: casco largo y bajo, cubierta roja con tuberías y puente blanco a popa.
  petrolero: (m) => {
    const g = new THREE.Group();
    placa(g, m.oscuro, simetrico([[0, 0.5], [0.08, 0.38], [0.1, 0.2], [0.1, -0.46], [0, -0.48]]), 0.05, 0);
    placa(g, mat('#8E3B2E'), simetrico([[0, 0.49], [0.075, 0.38], [0.095, 0.2], [0.095, -0.45], [0, -0.47]]), 0.012, 0.05);
    caja(g, m.gris, 0.012, 0.66, 0.012, 0, 0.04, 0.068);
    for (const y of [0.3, 0.12, -0.06, -0.24]) caja(g, m.gris, 0.15, 0.012, 0.01, 0, y, 0.068);
    caja(g, m.casco, 0.15, 0.1, 0.09, 0, -0.39, 0.105);
    caja(g, m.casco, 0.1, 0.07, 0.05, 0, -0.39, 0.17);
    torre(g, m.bando, 0.02, 0.022, 0.06, 0, -0.44, 0.17, 6);
    return g;
  },
  // Portacontenedores: casco oscuro y pilas de contenedores de colores.
  portacontenedores: (m) => {
    const g = new THREE.Group();
    placa(g, m.oscuro, simetrico([[0, 0.5], [0.08, 0.36], [0.105, 0.15], [0.105, -0.46], [0, -0.48]]), 0.06, 0);
    const colores = ['#B5543C', '#3E6E8E', '#C9A447', '#5D7F52', '#8A8F96', '#A2442F'].map((c) => mat(c));
    let n = 0;
    for (let y = 0.3; y > -0.32; y -= 0.075) {
      for (const x of [-0.06, 0, 0.06]) {
        const alto = 0.03 + ((n * 7) % 3) * 0.022;
        caja(g, colores[n++ % colores.length], 0.055, 0.068, alto, x, y, 0.06 + alto / 2);
      }
    }
    caja(g, m.casco, 0.19, 0.06, 0.12, 0, -0.38, 0.12);
    caja(g, m.casco, 0.21, 0.03, 0.02, 0, -0.38, 0.19);
    return g;
  },
  portaaviones: (m) => {
    const g = new THREE.Group();
    placa(g, m.oscuro, simetrico([[0, 0.5], [0.08, 0.36], [0.1, 0], [0.09, -0.48], [0, -0.48]]), 0.06, 0);
    placa(g, m.gris, simetrico([[0, 0.5], [0.12, 0.42], [0.16, 0.1], [0.16, -0.48], [0, -0.48]]), 0.02, 0.06);
    caja(g, m.casco, 0.05, 0.14, 0.12, 0.13, -0.08, 0.14);
    caja(g, m.casco, 0.006, 0.6, 0.002, 0.0, 0.0, 0.081);
    banderita(g, m, 0.13, -0.06, 0.2);
    return g;
  },
  submarino: (m) => {
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.82, 4, 10), m.oscuro);
    c.position.z = 0.03;
    c.scale.z = 0.8;
    g.add(c);
    caja(g, m.oscuro, 0.05, 0.14, 0.11, 0, 0.12, 0.11);
    caja(g, m.oscuro, 0.16, 0.025, 0.008, 0, 0.14, 0.12);
    caja(g, m.oscuro, 0.2, 0.05, 0.01, 0, -0.42, 0.03);
    caja(g, m.bando, 0.052, 0.04, 0.02, 0, 0.12, 0.17);
    return g;
  },
  avion: (m) => {
    const g = new THREE.Group();
    tubo(g, m.casco, 0.045, 0.055, 0.78, 0, -0.06, 0, 8);
    tubo(g, m.gris, 0.0, 0.045, 0.2, 0, 0.42, 0, 8);
    placa(g, m.casco, simetrico([[0.04, 0.2], [0.46, -0.16], [0.46, -0.22], [0.04, -0.18]]), 0.015, -0.01);
    placa(g, m.casco, simetrico([[0.04, -0.3], [0.2, -0.44], [0.2, -0.48], [0.04, -0.44]]), 0.012, -0.005);
    const deriva = placa(g, m.bando, [[0, -0.22], [0, -0.48], [0.18, -0.48]], 0.012, 0);
    deriva.rotation.y = -Math.PI / 2;
    deriva.position.x = -0.006;
    const cab = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), m.cristal);
    cab.scale.set(0.8, 2.2, 0.8);
    cab.position.set(0, 0.2, 0.04);
    g.add(cab);
    return g;
  },
  'dron-ala': (m) => {
    const g = new THREE.Group();
    tubo(g, m.casco, 0.035, 0.03, 0.62, 0, 0.02, 0, 8);
    const morro = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), m.casco);
    morro.scale.set(1, 1.4, 1);
    morro.position.set(0, 0.32, 0.01);
    g.add(morro);
    placa(g, m.casco, simetrico([[0.03, 0.12], [0.5, 0.08], [0.5, 0.03], [0.03, 0.0]]), 0.012, 0.01);
    for (const s of [1, -1]) {
      const v = placa(g, m.bando, [[0, -0.22], [0, -0.32], [0.14, -0.34], [0.14, -0.3]], 0.01, 0);
      v.rotation.y = s * -Math.PI / 3.2;
    }
    torre(g, m.oscuro, 0.012, 0.012, 0.01, 0, -0.29, 0, 6);
    return g;
  },
  shahed: (m) => {
    const g = new THREE.Group();
    tubo(g, m.gris, 0.035, 0.04, 0.6, 0, 0.04, 0.01, 8);
    tubo(g, m.bando, 0.0, 0.035, 0.12, 0, 0.4, 0.01, 8);
    placa(g, m.gris, simetrico([[0.03, 0.18], [0.44, -0.3], [0.44, -0.38], [0.03, -0.26]]), 0.014, 0.0);
    for (const s of [1, -1]) {
      const d = placa(g, m.oscuro, [[0, -0.24], [0, -0.38], [0.1, -0.38]], 0.008, 0);
      d.rotation.y = -Math.PI / 2;
      d.position.x = s * 0.43;
    }
    torre(g, m.oscuro, 0.02, 0.02, 0.06, 0, -0.27, 0.0, 6).rotation.set(0, 0, 0);
    return g;
  },
  dron: (m) => {
    const g = new THREE.Group();
    caja(g, m.casco, 0.2, 0.26, 0.08, 0, 0, 0);
    caja(g, m.bando, 0.12, 0.08, 0.03, 0, 0.06, 0.05);
    for (const [x, y] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const brazo = caja(g, m.oscuro, 0.04, 0.36, 0.025, x * 0.14, y * 0.14, 0.02);
      brazo.rotation.z = (x * y * Math.PI) / 4;
      torre(g, m.oscuro, 0.03, 0.03, 0.05, x * 0.27, y * 0.27, 0.04, 8);
      torre(g, m.cristal, 0.15, 0.15, 0.006, x * 0.27, y * 0.27, 0.07, 16);
    }
    return g;
  },
  misil: (m) => {
    const g = new THREE.Group();
    tubo(g, m.casco, 0.045, 0.045, 0.72, 0, -0.06, 0, 10);
    tubo(g, m.bando, 0.0, 0.045, 0.2, 0, 0.4, 0, 10);
    tubo(g, m.bando, 0.046, 0.046, 0.04, 0, -0.1, 0, 10);
    for (let k = 0; k < 4; k++) {
      const a = placa(g, m.gris, [[0, -0.28], [0, -0.42], [0.12, -0.44], [0.12, -0.38]], 0.008, 0);
      a.rotation.y = (k * Math.PI) / 2;
    }
    // Estela de fuego.
    tubo(g, mat('#FFB347', {emissive: '#FF7A1A', emissiveIntensity: 1.2}), 0.035, 0.0, 0.16, 0, -0.5, 0, 8);
    return g;
  },
  helicoptero: (m) => {
    const g = new THREE.Group();
    const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m.bando);
    cuerpo.scale.set(1, 1.8, 1);
    cuerpo.position.set(0, 0.12, 0);
    g.add(cuerpo);
    tubo(g, m.bando, 0.03, 0.015, 0.46, 0, -0.26, 0.03, 6);
    caja(g, m.oscuro, 0.012, 0.08, 0.1, 0.0, -0.46, 0.07);
    torre(g, m.oscuro, 0.015, 0.015, 0.06, 0, 0.12, 0.11, 6);
    torre(g, m.cristal, 0.42, 0.42, 0.004, 0, 0.12, 0.14, 24);
    caja(g, m.oscuro, 0.012, 0.36, 0.012, 0.1, 0.12, -0.11);
    caja(g, m.oscuro, 0.012, 0.36, 0.012, -0.1, 0.12, -0.11);
    return g;
  },
  enjambre: (m) => {
    const g = new THREE.Group();
    for (const [x, y] of [[0, 0.3], [-0.3, 0.05], [0.3, 0.05], [-0.15, -0.25], [0.15, -0.25]]) {
      const d = CONSTRUCTORES.shahed(m);
      d.scale.setScalar(0.42);
      d.position.set(x, y, (x * 7 + y * 3) % 0.08);
      g.add(d);
    }
    return g;
  },
};

/** A qué altura vuela cada modelo (en largos del modelo); los que van por tierra o mar, en 0. */
const ALTURA: Record<string, number> = {ficha: 0, peana: 0, avion: 0.75, 'dron-ala': 0.6, shahed: 0.5, enjambre: 0.5, dron: 0.45, misil: 0.55, helicoptero: 0.4};

// ── Modelos externos (.glb) ─────────────────────────────────────────────────────────

const externos = new Map<string, THREE.Group>();
let cargaExternos: Promise<void> | null = null;
/** Carga los .glb de public/modelos/lista.json, si hay: {"tanque": {"archivo": "tanque.glb", "giro": 0}}. */
export const precargarModelos = () => {
  cargaExternos ??= (async () => {
    try {
      const base = new URL('modelos/', document.baseURI).href;
      const r = await fetch(base + 'lista.json');
      if (!r.ok) return;
      const lista = (await r.json()) as Record<string, {archivo: string; giro?: number}>;
      const loader = new GLTFLoader();
      await Promise.all(Object.entries(lista).map(async ([nombre, d]) => {
        try {
          const gltf = await loader.loadAsync(base + d.archivo);
          const g = new THREE.Group();
          const m = gltf.scene;
          m.rotation.x = Math.PI / 2; // glTF tiene y arriba; aquí z es arriba
          m.rotation.y = ((d.giro ?? 0) * Math.PI) / 180;
          g.add(m);
          g.updateMatrixWorld(true);
          const caja3 = new THREE.Box3().setFromObject(g);
          const tam = caja3.getSize(new THREE.Vector3());
          const c = caja3.getCenter(new THREE.Vector3());
          const k = 1 / Math.max(tam.x, tam.y, 1e-6);
          m.position.set(-c.x, -c.y, -caja3.min.z);
          const envoltura = new THREE.Group();
          g.scale.setScalar(k);
          envoltura.add(g);
          externos.set(limpiar(nombre), envoltura);
        } catch (e) {
          console.warn('[modelos3d] no pude cargar', d.archivo, e);
        }
      }));
    } catch {
      /* sin lista: solo modelos propios */
    }
  })();
  return cargaExternos;
};

// Mancha de sombra difusa (degradado radial), compartida por todas las piezas.
let sombraTex: THREE.Texture | null = null;
const texturaSombra = () => {
  if (sombraTex) return sombraTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  sombraTex = new THREE.CanvasTexture(cv);
  return sombraTex;
};

// ── Capa de MapLibre ────────────────────────────────────────────────────────────────

type Instancia = {raiz: THREE.Object3D; mats: THREE.Material[]; sombra: THREE.Mesh};

class Capa3d implements CustomLayerInterface {
  id = 'mm-3d';
  type = 'custom' as const;
  renderingMode = '3d' as const;
  private map!: MapLibre;
  private renderer!: THREE.WebGLRenderer;
  private camara = new THREE.Camera();
  private escena = new THREE.Scene();
  private cache = new Map<string, Instancia>();
  datos: Modelo3d[] = [];

  onAdd(map: MapLibre, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true});
    this.renderer.autoClear = false;
    // Luz de atlas: principal desde el noroeste y alta, relleno suave del cielo.
    this.escena.add(new THREE.HemisphereLight('#FFFFFF', '#6B6258', 1.6));
    const sol = new THREE.DirectionalLight('#FFF6E8', 2.4);
    sol.position.set(-1, 1.2, 2.2); // ejes del modelo (x este, y norte, z arriba): luz del noroeste y alta
    this.escena.add(sol, sol.target);
  }

  onRemove() {
    for (const i of this.cache.values()) this.escena.remove(i.raiz);
    this.cache.clear();
  }

  private instancia(d: Modelo3d): Instancia {
    const clave = `${d.modelo}|${d.color}|${d.clave ?? ''}`;
    let i = this.cache.get(clave);
    if (i) return i;
    const m: Mats = {
      casco: mat('#EEF0F1'), gris: mat('#A7AEB5'), oscuro: mat('#3B3F44'), bando: mat(d.color),
      cristal: mat('#2A3440', {roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.55}),
    };
    const externo = externos.get(d.modelo);
    const modelo = externo ? externo.clone(true) : CONSTRUCTORES[d.modelo](m, d);
    // Sombra de contacto: mancha oscura en el suelo, bajo la unidad (aunque vuele).
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({map: texturaSombra(), color: '#000000', transparent: true, opacity: 0.3, depthWrite: false}));
    sombra.scale.set(d.modelo === 'ficha' ? 0.9 : 0.7, d.modelo === 'ficha' ? 0.5 : 1.1, 1);
    const giro = new THREE.Group();
    giro.add(modelo);
    const raiz = new THREE.Group();
    raiz.add(giro, sombra);
    raiz.visible = false;
    const mats: THREE.Material[] = [];
    raiz.traverse((o) => {
      const mm = (o as THREE.Mesh).material;
      if (mm) for (const x of Array.isArray(mm) ? mm : [mm]) if (!mats.includes(x)) mats.push(x);
    });
    i = {raiz, mats, sombra};
    this.escena.add(raiz);
    this.cache.set(clave, i);
    return i;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, opciones: {defaultProjectionData: {mainMatrix: ArrayLike<number>}}) {
    if (!this.datos.length) return;
    const mundo = 512 * Math.pow(2, this.map.getZoom()); // píxeles CSS de todo el mapa Mercator
    const vpm = new THREE.Matrix4().fromArray(Array.from(opciones.defaultProjectionData.mainMatrix));
    for (const i of this.cache.values()) i.raiz.visible = false;
    for (const d of this.datos) {
      if (d.op <= 0.01) continue;
      const i = this.instancia(d);
      const largo = (70 * d.tam) / mundo; // unos 70 px de largo, como las figuras planas
      const c = MercatorCoordinate.fromLngLat({lng: d.en[0], lat: d.en[1]}, 0);
      const altura = ALTURA[d.modelo] ?? 0;
      const giro = i.raiz.children[0];
      giro.rotation.z = (-d.rumbo * Math.PI) / 180;
      giro.position.z = altura;
      i.sombra.position.set(altura * 0.35, -altura * 0.45, 0.002); // la luz viene del noroeste: sombra al sureste
      i.sombra.rotation.z = giro.rotation.z;
      (i.sombra.material as THREE.MeshBasicMaterial).opacity = 0.55 * d.op / (1 + altura * 1.5);
      for (const x of i.mats) {
        if (x === i.sombra.material) continue;
        const base = (x.userData.op ??= x.opacity) as number;
        x.transparent = d.op < 0.99 || base < 1;
        x.opacity = base * d.op;
      }
      i.raiz.visible = true;
      this.camara.projectionMatrix = vpm.clone().multiply(
        new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).scale(new THREE.Vector3(largo, -largo, largo)));
      // (y negativa: el modelo tiene el norte hacia +y y Mercator hacia −y; la matriz de MapLibre ya invierte
      // otra vez, así que las caras quedan bien orientadas y Three.js no tiene que darles la vuelta).
      this.renderer.resetState();
      this.renderer.render(this.escena, this.camara);
      i.raiz.visible = false;
    }
  }
}

const capas = new WeakMap<MapLibre, Capa3d>();

/** Pone los modelos 3D del fotograma. La capa se crea (o se vuelve a crear tras un cambio de estilo) aquí. */
export const fijarModelos = (map: MapLibre, datos: Modelo3d[]) => {
  let capa = capas.get(map);
  if (!capa) {
    capa = new Capa3d();
    capas.set(map, capa);
  }
  if (!map.getLayer(capa.id)) {
    if (!datos.length) return;
    map.addLayer(capa, map.getLayer('mm-flechas') ? 'mm-flechas' : undefined);
  }
  capa.datos = datos;
  map.triggerRepaint();
};
