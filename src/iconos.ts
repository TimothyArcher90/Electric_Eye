// Siluetas propias para las fichas (caja de 100×100). Se dibujan igual en cualquier ordenador, a diferencia de
// los emojis, que cambian según el sistema. Se aceptan por nombre ("tanque") o por el emoji de siempre ("🪖").

const estrella = (cx: number, cy: number, r1: number, r2: number, puntas: number, giro = -Math.PI / 2) => {
  let d = '';
  for (let i = 0; i < puntas * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = giro + (Math.PI * i) / puntas;
    d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)} `;
  }
  return `${d}Z`;
};

const nuclear = () => {
  // Tres aspas a 120° alrededor de un círculo central.
  let d = 'M50 42 A8 8 0 1 1 49.99 42 Z ';
  for (let k = 0; k < 3; k++) {
    const a0 = (-Math.PI / 2) + (k * 2 * Math.PI) / 3 - Math.PI / 6;
    const a1 = a0 + Math.PI / 3;
    const p = (r: number, a: number) => `${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`;
    d += `M${p(13, a0)} L${p(40, a0)} A40 40 0 0 1 ${p(40, a1)} L${p(13, a1)} A13 13 0 0 0 ${p(13, a0)} Z `;
  }
  return d;
};

export const ICONOS: Record<string, string> = {
  // Infantería: casco, cabeza y hombros.
  // Infante de pie, con fusil (para las peanas de un frente).
  infante: 'M38 14 Q50 2 62 14 L64 18 L36 18 Z M42 18 H58 V26 Q50 32 42 26 Z M34 30 Q50 26 66 30 L68 58 H61 L58 44 L57 60 H43 L42 44 L39 58 H32 Z M43 60 H49.5 L48 96 H39 Z M50.5 60 H57 L61 96 H52 Z M66 18 L70 17 L73 62 L69 63 Z',
  soldado: 'M26 46 Q50 16 74 46 L78 50 L22 50 Z M38 50 H62 V56 Q50 68 38 56 Z M18 88 Q20 66 40 62 L50 70 L60 62 Q80 66 82 88 Z',
  tanque: 'M14 70 H86 A8 8 0 0 1 86 86 H14 A8 8 0 0 1 14 70 Z M20 60 H80 L86 68 H14 Z M32 46 H62 L70 58 H28 Z M62 49 H94 V55 H62 Z',
  barco: 'M6 62 H94 L82 80 H18 Z M34 48 H60 V62 H34 Z M41 36 H54 V48 H41 Z M46.5 20 H48.5 V36 H46.5 Z M60 55 H80 V58.5 H60 Z M16 57 H30 V62 H16 Z',
  avion: 'M50 8 L55 34 L90 55 L90 62 L55 51 L54 74 L65 83 L65 88 L50 84 L35 88 L35 83 L46 74 L45 51 L10 62 L10 55 L45 34 Z',
  misil: 'M50 6 Q59 16 59 30 V70 L70 84 V91 L59 85 V88 H41 V85 L30 91 V84 L41 70 V30 Q41 16 50 6 Z',
  explosion: estrella(50, 50, 44, 20, 9),
  ancla: 'M50 8 A7 7 0 1 1 49.99 8 Z M46 21 H54 V30 H64 V36 H54 V80 Q70 78 76 64 L69 62 L82 52 L86 70 L80 67 Q72 88 50 90 Q28 88 20 67 L14 70 L18 52 L31 62 L24 64 Q30 78 46 80 V36 H36 V30 H46 Z',
  nuclear: nuclear(),
  petroleo: 'M50 10 C50 10 78 44 78 61 A28 28 0 0 1 22 61 C22 44 50 10 50 10 Z',
  fabrica: 'M10 88 V54 L30 64 V54 L50 64 V54 L70 64 V20 H82 V88 Z',
  mando: estrella(50, 52, 42, 17, 5),
  dron: 'M42 44 H58 V56 H42 Z M20 30 A10 10 0 1 1 19.99 30 Z M80 30 A10 10 0 1 1 79.99 30 Z M20 70 A10 10 0 1 1 19.99 70 Z M80 70 A10 10 0 1 1 79.99 70 Z M26 34 L44 46 L42 48 L24 36 Z M74 34 L56 46 L58 48 L76 36 Z M26 66 L44 54 L42 52 L24 64 Z M74 66 L56 54 L58 52 L76 64 Z',
  // Dron de ala fija tipo Bayraktar/Reaper (visto desde arriba, morro hacia arriba): ala larga y cola en V.
  'dron-ala': 'M48 10 Q50 6 52 10 L53 40 L94 46 L94 51 L53 50 L52 76 L62 86 L60 89 L50 83 L40 89 L38 86 L48 76 L47 50 L6 51 L6 46 L47 40 Z',
  // Dron kamikaze en delta tipo Shahed (desde arriba).
  shahed: 'M50 6 L57 30 L88 80 L88 86 L57 76 L54 90 L46 90 L43 76 L12 86 L12 80 L43 30 Z',
  // Enjambre: varios drones pequeños.
  enjambre: [[30, 30], [62, 22], [46, 54], [74, 58], [24, 70]].map(([x, y]) =>
    `M${x} ${y - 9} L${x + 3} ${y - 1} L${x + 12} ${y + 5} L${x + 12} ${y + 8} L${x + 3} ${y + 5} L${x + 3} ${y + 9} L${x - 3} ${y + 9} L${x - 3} ${y + 5} L${x - 12} ${y + 8} L${x - 12} ${y + 5} L${x - 3} ${y - 1} Z`).join(' '),
  helicoptero: 'M8 26 H92 V30 H8 Z M48 30 H52 V40 H48 Z M30 40 H62 Q76 42 78 54 Q76 66 60 66 H40 Q26 66 24 54 Q24 44 30 40 Z M78 50 H96 L98 42 H94 L90 50 Z M36 66 H40 V74 H36 Z M58 66 H62 V74 H58 Z M28 74 H70 V78 H28 Z',
  submarino: 'M8 60 Q8 48 30 48 H74 Q92 48 94 60 Q92 72 74 72 H30 Q8 72 8 60 Z M42 36 H58 V48 H42 Z M49 24 H51 V36 H49 Z',
  satelite: 'M40 40 H60 V60 H40 Z M6 44 H34 V56 H6 Z M66 44 H94 V56 H66 Z M34 49 H40 V51 H34 Z M60 49 H66 V51 H60 Z M46 60 H54 L58 72 H42 Z',
};

/** Emojis de siempre → silueta propia. */
const POR_EMOJI: Record<string, string> = {
  '🪖': 'soldado', '💂': 'soldado', '🎖️': 'mando', '⭐': 'mando', '★': 'mando', '🚀': 'misil', '✈️': 'avion', '✈': 'avion',
  '🛩️': 'avion', '🚢': 'barco', '⛴️': 'barco', '🛳️': 'barco', '💥': 'explosion', '⚓': 'ancla', '☢️': 'nuclear', '☢': 'nuclear',
  '🛢️': 'petroleo', '🛢': 'petroleo', '🏭': 'fabrica', '🚁': 'helicoptero', '🛰️': 'satelite', '🛰': 'satelite',
};

const SINONIMOS: Record<string, string> = {
  tropas: 'soldado', infanteria: 'soldado', ejercito: 'soldado', tanques: 'tanque', blindado: 'tanque', flota: 'barco',
  buque: 'barco', armada: 'barco', portaaviones: 'barco', aviacion: 'avion', caza: 'avion', misiles: 'misil',
  ataque: 'explosion', bombardeo: 'explosion', base: 'ancla', puerto: 'ancla', petroleo: 'petroleo', gas: 'petroleo',
  industria: 'fabrica', cuartel: 'mando', estrella: 'mando', drones: 'dron', submarinos: 'submarino',
  cuadricoptero: 'dron', bayraktar: 'dron-ala', reaper: 'dron-ala', 'dron ala': 'dron-ala', 'dron de ala fija': 'dron-ala',
  'shahed-136': 'shahed', kamikaze: 'shahed', geran: 'shahed', 'dron kamikaze': 'shahed', 'enjambre de drones': 'enjambre',
};

const limpiar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Devuelve la silueta (Path2D) para un icono, o null si es texto libre o un emoji sin silueta propia. */
export const silueta = (icono: string): Path2D | null => {
  const n = POR_EMOJI[icono] ?? POR_EMOJI[icono.replace(/️/g, '')] ?? SINONIMOS[limpiar(icono)] ?? limpiar(icono);
  return ICONOS[n] ? new Path2D(ICONOS[n]) : null;
};

export const NOMBRES_ICONOS = Object.keys(ICONOS);
