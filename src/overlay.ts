import {visibilidad} from './geo';
import {imagenCargada} from './capas';
import {paletaDe} from './estilos';
import type {ElemGrafico, ElemRecorte, ElemTitulo, OpcionesEstilo, Proyecto} from './proyecto';

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

  // Recortes de archivo y gráficos (debajo de los títulos)
  for (const e of p.elementos) {
    if (e.oculto || (e.tipo !== 'recorte' && e.tipo !== 'grafico')) continue;
    const op = visibilidad(t, e.desde, e.hasta, e.fundido);
    if (op <= 0) continue;
    if (e.tipo === 'recorte') pintarRecorte(ctx, w, h, u, e, op);
    else pintarGrafico(ctx, w, h, u, e, op, t);
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
  let tam = (h > w ? 92 : 74) * u;
  let tamSub = (h > w ? 36 : 28) * u;
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

const suaveSalida = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

const rectRedondo = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
};

/** Foto de archivo en un marco (televisor antiguo, papel o limpio) que entra deslizándose sobre el mapa. */
const pintarRecorte = (ctx: CanvasRenderingContext2D, w: number, h: number, u: number, e: ElemRecorte, op: number) => {
  const img = imagenCargada(e.imagen);
  if (!img) return;
  const vertical = h > w;
  const anchoMax = w * (vertical ? Math.max(e.ancho, 0.72) : e.ancho);
  let W = anchoMax;
  let H = (W * img.height) / img.width;
  if (H > h * 0.5) {
    H = h * 0.5;
    W = (H * img.width) / img.height;
  }
  const margen = w * 0.06;
  const x = e.posicion === 'izquierda' ? margen : e.posicion === 'derecha' ? w - W - margen : (w - W) / 2;
  const y = vertical ? h * 0.2 : h * 0.16;
  const k = suaveSalida(op);
  const lado = e.posicion === 'derecha' ? 1 : e.posicion === 'izquierda' ? -1 : 0;
  ctx.save();
  ctx.globalAlpha = Math.min(1, op * 1.4);
  ctx.translate(x + W / 2 + lado * (1 - k) * 80 * u, y + H / 2 + (lado === 0 ? (1 - k) * 40 * u : 0));
  ctx.rotate(((e.marco === 'papel' ? 2 : e.marco === 'crt' ? -1.2 : 0) * Math.PI) / 180);
  ctx.scale(0.94 + 0.06 * k, 0.94 + 0.06 * k);
  ctx.translate(-W / 2, -H / 2);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 30 * u;
  ctx.shadowOffsetY = 12 * u;
  if (e.marco === 'crt') {
    // Carcasa de televisor: marco oscuro redondeado, pantalla con líneas y viñeta.
    const b = 26 * u;
    const carcasa = ctx.createLinearGradient(0, -b, 0, H + b);
    carcasa.addColorStop(0, '#3A352E');
    carcasa.addColorStop(1, '#16130F');
    rectRedondo(ctx, -b, -b, W + 2 * b, H + 2 * b, 26 * u);
    ctx.fillStyle = carcasa;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save();
    rectRedondo(ctx, 0, 0, W, H, 34 * u);
    ctx.clip();
    ctx.filter = 'saturate(0.75) contrast(1.08) sepia(0.15)';
    ctx.drawImage(img, 0, 0, W, H);
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    for (let yy = 0; yy < H; yy += 4 * u) ctx.fillRect(0, yy, W, 1.6 * u);
    const vin = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    vin.addColorStop(0, 'rgba(0,0,0,0)');
    vin.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vin;
    ctx.fillRect(0, 0, W, H);
    const brillo = ctx.createLinearGradient(0, 0, W, H);
    brillo.addColorStop(0, 'rgba(255,255,255,0.12)');
    brillo.addColorStop(0.4, 'rgba(255,255,255,0)');
    ctx.fillStyle = brillo;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  } else {
    const b = e.marco === 'papel' ? 14 * u : 5 * u;
    ctx.fillStyle = e.marco === 'papel' ? '#FBF7EE' : '#FFFFFF';
    ctx.fillRect(-b, -b, W + 2 * b, H + 2 * b + (e.marco === 'papel' && e.pie ? 44 * u : 0));
    ctx.shadowColor = 'transparent';
    ctx.drawImage(img, 0, 0, W, H);
  }
  if (e.pie) {
    ctx.shadowColor = 'transparent';
    ctx.font = `600 ${Math.round(24 * u)}px ${SANS}`;
    ctx.textBaseline = 'top';
    if (e.marco === 'papel') {
      ctx.fillStyle = '#2B2722';
      ctx.textAlign = 'left';
      ctx.fillText(e.pie, 0, H + 12 * u, W);
    } else {
      // Rótulo oscuro bajo la imagen.
      const tw = Math.min(W, ctx.measureText(e.pie).width + 28 * u);
      const yy = H + (e.marco === 'crt' ? 40 : 14) * u;
      ctx.fillStyle = 'rgba(12,16,22,0.88)';
      ctx.fillRect(0, yy, tw, 40 * u);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.fillText(e.pie, 14 * u, yy + 8 * u, W - 28 * u);
    }
  }
  ctx.restore();
};

/** Gráfico de barras sobre papel (barras marrones como en los documentales), que crecen al entrar. */
const pintarGrafico = (ctx: CanvasRenderingContext2D, w: number, h: number, u: number, e: ElemGrafico, op: number, t: number) => {
  if (!e.barras.length) return;
  const vertical = h > w;
  const W = vertical ? w * 0.84 : w * 0.36;
  const H = vertical ? h * 0.34 : h * 0.5;
  const margen = w * 0.06;
  const x = vertical ? (w - W) / 2 : e.posicion === 'izquierda' ? margen : e.posicion === 'derecha' ? w - W - margen : (w - W) / 2;
  const y = vertical ? h * 0.42 : h * 0.24;
  const k = suaveSalida(op);
  const crec = suaveSalida(e.crece > 0 ? (t - e.desde) / e.crece : 1);
  ctx.save();
  ctx.globalAlpha = Math.min(1, op * 1.4);
  ctx.translate(0, (1 - k) * 30 * u);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 26 * u;
  ctx.shadowOffsetY = 10 * u;
  ctx.fillStyle = 'rgba(251,247,238,0.96)';
  ctx.fillRect(x, y, W, H);
  ctx.shadowColor = 'transparent';
  const pad = 28 * u;
  ctx.fillStyle = '#1F1A15';
  ctx.font = `600 ${Math.round(34 * u)}px ${TITULAR}`;
  ctx.letterSpacing = `${1.5 * u}px`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(e.titulo.toUpperCase(), x + pad, y + pad * 0.8, W - 2 * pad);
  ctx.letterSpacing = '0px';
  const max = Math.max(...e.barras.map((b) => b.valor), 1e-9);
  const zonaY = y + pad * 0.8 + 56 * u;
  const zonaH = H - (zonaY - y) - 56 * u;
  const n = e.barras.length;
  const hueco = (W - 2 * pad) / n;
  const anchoBarra = Math.min(hueco * 0.62, 120 * u);
  const fmt = new Intl.NumberFormat('es-ES', {maximumFractionDigits: 1});
  e.barras.forEach((b, i) => {
    const retraso = Math.min(1, Math.max(0, crec * 1.4 - i * 0.12));
    const alto = (b.valor / max) * zonaH * suaveSalida(retraso);
    const bx = x + pad + hueco * i + (hueco - anchoBarra) / 2;
    const by = zonaY + zonaH - alto;
    const g = ctx.createLinearGradient(bx, 0, bx + anchoBarra, 0);
    const col = b.color ?? '#8C5A3C';
    g.addColorStop(0, col);
    g.addColorStop(1, '#5E3B26');
    ctx.fillStyle = g;
    ctx.fillRect(bx, by, anchoBarra, alto);
    ctx.fillStyle = '#1F1A15';
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(24 * u)}px ${SANS}`;
    if (retraso > 0.05) ctx.fillText(`${fmt.format(b.valor * suaveSalida(retraso))}${e.unidad ? ` ${e.unidad}` : ''}`, bx + anchoBarra / 2, by - 32 * u);
    ctx.font = `500 ${Math.round(20 * u)}px ${SANS}`;
    ctx.fillStyle = '#4A4337';
    ctx.fillText(b.etiqueta, bx + anchoBarra / 2, zonaY + zonaH + 12 * u, hueco - 6 * u);
  });
  // Línea base
  ctx.fillStyle = '#3A322A';
  ctx.fillRect(x + pad, zonaY + zonaH, W - 2 * pad, 2 * u);
  ctx.restore();
};
