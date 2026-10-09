import {visibilidad} from './geo';
import {imagenCargada} from './capas';
import {paletaDe} from './estilos';
import type {ElemTitulo, OpcionesEstilo, Proyecto} from './proyecto';

// Capa 2D encima del mapa: títulos, fuente, grano de película y viñeta.
// La misma función pinta la vista previa y cada fotograma exportado.

let ruido: HTMLCanvasElement | null = null;
const texturaRuido = () => {
  if (ruido) return ruido;
  ruido = document.createElement('canvas');
  ruido.width = ruido.height = 256;
  const ctx = ruido.getContext('2d')!;
  const img = ctx.createImageData(256, 256);
  // Generador determinista: el grano sale igual en cada exportación.
  let s = 1234567;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = 128 + ((s >> 8) % 128) - 64;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return ruido;
};

/**
 * Dibuja el mapa con la óptica del proyecto: etalonaje (saturación y contraste más bajos,
 * negros levantados en tono cálido) y desenfoque de profundidad arriba y, más suave, abajo.
 * La vista previa imita lo mismo con CSS (ver aplicarOpticaPrevia).
 */
export const componerMapa = (
  ctx: CanvasRenderingContext2D, fuente: CanvasImageSource, w: number, h: number, o: OpcionesEstilo,
) => {
  const e = o.etalonaje ?? 0;
  ctx.save();
  ctx.filter = e > 0 ? `saturate(${1 - 0.18 * e}) contrast(${1 - 0.14 * e})` : 'none';
  ctx.drawImage(fuente, 0, 0, w, h);
  ctx.restore();
  const d = o.desenfoque ?? 0;
  if (d > 0) {
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const t = tmp.getContext('2d')!;
    t.filter = `blur(${(d * h) / 110}px)`;
    t.drawImage(ctx.canvas, 0, 0);
    t.filter = 'none';
    t.globalCompositeOperation = 'destination-in';
    const g = t.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.18, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.36, 'rgba(0,0,0,0)');
    g.addColorStop(0.82, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    t.fillStyle = g;
    t.fillRect(0, 0, w, h);
    ctx.drawImage(tmp, 0, 0);
  }
  if (e > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(46,34,22,${0.8 * e})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = `rgba(255,231,196,${0.35 * e})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
};

/** Equivalente aproximado en CSS para la vista previa del editor. */
export const aplicarOpticaPrevia = (marco: HTMLElement, o: OpcionesEstilo) => {
  const e = o.etalonaje ?? 0;
  const d = o.desenfoque ?? 0;
  marco.style.setProperty('--mm-filtro', e > 0 ? `saturate(${1 - 0.18 * e}) contrast(${1 - 0.14 * e})` : 'none');
  marco.style.setProperty('--mm-blur', `${(d * marco.clientHeight) / 110}px`);
  marco.style.setProperty('--mm-dof', d > 0 ? '1' : '0');
  marco.style.setProperty('--mm-lift', String(0.8 * e));
  marco.style.setProperty('--mm-calido', String(0.35 * e));
};

const SANS = '"Inter", "Helvetica Neue", Arial, sans-serif';
// Titulares de documental: Oswald (condensada). Las dos fuentes viajan con Electric Eye (public/fuentes, licencia
// OFL), así el vídeo sale igual en cualquier ordenador y no cae en Arial.
const TITULAR = '"Oswald", "Bebas Neue", Impact, sans-serif';

let fuentes: Promise<unknown> | null = null;
/** Carga Inter y Oswald una vez. Hay que esperarla antes de pintar el primer fotograma. */
export const cargarFuentes = () => {
  if (fuentes || typeof FontFace === 'undefined') return fuentes ?? Promise.resolve();
  const base = new URL('fuentes/', document.baseURI).href;
  const caras = [new FontFace('Inter', `url(${base}Inter.ttf)`, {weight: '100 900'}),
    new FontFace('Oswald', `url(${base}Oswald.ttf)`, {weight: '200 700'})];
  fuentes = Promise.all(caras.map((f) => f.load().then((c) => document.fonts.add(c)).catch(() => undefined)));
  return fuentes;
};

export const pintarOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number, p: Proyecto, t: number) => {
  const pal = paletaDe(p.estilo, p.preset);
  const u = Math.min(w, h) / 1080; // unidad relativa: escala con el lado corto (vale para 16:9 y 9:16)
  const vertical = h > w;
  // En vertical, la interfaz de Reels/TikTok tapa ~14 % arriba y ~22 % abajo: se respeta esa zona.
  const base = vertical ? h * 0.78 : h - 30 * u;
  // La fuente es letra pequeña: en vertical va abajo del todo para no tapar la acción del centro.
  const baseFuente = vertical ? h - 40 * u : base;

  // Viñeta
  if (p.opciones.vineta > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.55 * p.opciones.vineta})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Grano: textura desplazada por fotograma para que "viva".
  if (p.opciones.grano > 0) {
    const tex = texturaRuido();
    const f = Math.floor(t * 24);
    const dx = (f * 73) % 256;
    const dy = (f * 151) % 256;
    ctx.save();
    ctx.globalAlpha = 0.16 * p.opciones.grano;
    ctx.globalCompositeOperation = 'overlay';
    const pat = ctx.createPattern(tex, 'repeat')!;
    const escala = Math.max(1, u * 1.2);
    pat.setTransform(new DOMMatrix().translate(-dx, -dy).scale(escala));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Títulos
  for (const e of p.elementos) {
    if (e.tipo !== 'titulo' || e.oculto) continue;
    const op = visibilidad(t, e.desde, e.hasta, e.fundido);
    if (op > 0) pintarTitulo(ctx, w, h, u, e, op, p.estilo === 'documental' || p.estilo === 'minimal', pal.acento);
  }

  // Marca de agua (logo) abajo a la izquierda; con logo, la fuente pasa a la derecha.
  const logo = p.marca?.imagen ? imagenCargada(p.marca.imagen) : undefined;
  if (logo && p.marca) {
    const alto = h * 0.11 * (p.marca.tamano || 1);
    const ancho = (logo.width / logo.height) * alto;
    ctx.save();
    ctx.globalAlpha = p.marca.opacidad;
    ctx.drawImage(logo, 36 * u, base - alto, ancho, alto);
    ctx.restore();
  }
  if (p.fuente && logo) {
    ctx.save();
    ctx.font = `italic 600 ${Math.round(22 * u)}px ${SANS}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 6 * u;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(p.fuente, w - 36 * u, baseFuente);
    ctx.restore();
  }
  // Fuente (abajo a la izquierda)
  if (p.fuente && !logo) {
    ctx.save();
    ctx.font = `600 ${Math.round(15 * u)}px ${SANS}`;
    ctx.letterSpacing = `${2 * u}px`;
    ctx.fillStyle = pal.etiquetaPais;
    ctx.globalAlpha = 0.75;
    ctx.shadowColor = pal.haloPais;
    ctx.shadowBlur = 4 * u;
    ctx.textBaseline = 'bottom';
    ctx.fillText(p.fuente.toUpperCase(), 36 * u, baseFuente);
    ctx.restore();
  }
};

const pintarTitulo = (
  ctx: CanvasRenderingContext2D, w: number, h: number, u: number, e: ElemTitulo, op: number, papel: boolean, acento: string,
) => {
  const entrada = Math.min(1, op);
  const desliz = (1 - entrada) * 24 * u;
  ctx.save();
  ctx.globalAlpha = op;
  // En vertical (Reel) el título manda: letra más grande; abajo se limita al 88 % del ancho.
  let tam = (h > w ? 92 : 58) * u;
  let tamSub = (h > w ? 36 : 26) * u;
  const texto = e.texto.toUpperCase();
  const pad = 26 * u;
  const medir = () => {
    ctx.font = `600 ${tam}px ${TITULAR}`;
    ctx.letterSpacing = `${3 * u}px`;
    const a = ctx.measureText(texto).width;
    ctx.font = `500 ${tamSub}px ${SANS}`;
    ctx.letterSpacing = '0px';
    return [a, e.subtitulo ? ctx.measureText(e.subtitulo).width : 0];
  };
  let [anchoT, anchoS] = medir();
  // Si no cabe (típico en 9:16), la letra se reduce hasta ocupar como mucho el 88 % del ancho.
  const k = Math.min(1, (w * 0.88 - pad * 2) / Math.max(1, anchoT, anchoS));
  if (k < 1) {
    tam *= k;
    tamSub *= k;
    [anchoT, anchoS] = medir();
  }
  const anchoCaja = Math.max(anchoT, anchoS) + pad * 2;
  const altoCaja = tam * 1.15 + (e.subtitulo ? tamSub * 1.6 : 0) + pad * 1.4;
  const x = (w - anchoCaja) / 2;
  const vertical = h > w;
  const y = e.posicion === 'arriba' ? h * (vertical ? 0.15 : 0.08)
    : e.posicion === 'abajo' ? h * (vertical ? 0.76 : 0.92) - altoCaja : (h - altoCaja) / 2;

  ctx.translate(w / 2, y + altoCaja / 2 + (e.posicion === 'abajo' ? desliz : -desliz));
  if (papel) ctx.rotate((-1.2 * Math.PI) / 180);
  ctx.translate(-w / 2, -(y + altoCaja / 2));

  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 22 * u;
  ctx.shadowOffsetY = 8 * u;
  ctx.fillStyle = papel ? '#FFFDF6' : 'rgba(12,16,22,0.88)';
  ctx.fillRect(x, y, anchoCaja, altoCaja);
  ctx.shadowColor = 'transparent';

  ctx.fillStyle = papel ? '#1A1A17' : '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  // Barra de acento bajo la caja, en el color de la pieza (como los rótulos de documental).
  ctx.fillStyle = acento;
  ctx.fillRect(x, y + altoCaja - 6 * u, anchoCaja, 6 * u);
  ctx.fillStyle = papel ? '#1A1A17' : '#FFFFFF';
  ctx.font = `600 ${tam}px ${TITULAR}`;
  ctx.letterSpacing = `${3 * u}px`;
  ctx.fillText(texto, w / 2, y + pad * 0.7);
  if (e.subtitulo) {
    ctx.font = `500 ${tamSub}px ${SANS}`;
    ctx.letterSpacing = '0px';
    ctx.fillStyle = papel ? '#4A4337' : 'rgba(255,255,255,0.8)';
    ctx.fillText(e.subtitulo, w / 2, y + pad * 0.7 + tam * 1.2);
  }
  ctx.restore();
};
