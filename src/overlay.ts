import {visibilidad} from './geo';
import {PALETAS} from './estilos';
import type {ElemTitulo, Proyecto} from './proyecto';

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

const SANS = '"Inter", "Helvetica Neue", Arial, sans-serif';

export const pintarOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number, p: Proyecto, t: number) => {
  const pal = PALETAS[p.estilo];
  const u = h / 1080; // unidad relativa: todo escala con la altura del fotograma

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
    if (op > 0) pintarTitulo(ctx, w, h, u, e, op, p.estilo === 'documental' || p.estilo === 'minimal');
  }

  // Fuente (abajo a la izquierda)
  if (p.fuente) {
    ctx.save();
    ctx.font = `600 ${Math.round(15 * u)}px ${SANS}`;
    ctx.letterSpacing = `${2 * u}px`;
    ctx.fillStyle = pal.etiquetaPais;
    ctx.globalAlpha = 0.75;
    ctx.shadowColor = pal.haloPais;
    ctx.shadowBlur = 4 * u;
    ctx.textBaseline = 'bottom';
    ctx.fillText(p.fuente.toUpperCase(), 36 * u, h - 30 * u);
    ctx.restore();
  }
};

const pintarTitulo = (
  ctx: CanvasRenderingContext2D, w: number, h: number, u: number, e: ElemTitulo, op: number, papel: boolean,
) => {
  const entrada = Math.min(1, op);
  const desliz = (1 - entrada) * 24 * u;
  ctx.save();
  ctx.globalAlpha = op;
  const tam = 58 * u;
  const tamSub = 26 * u;
  ctx.font = `800 ${tam}px ${SANS}`;
  ctx.letterSpacing = `${1 * u}px`;
  const texto = e.texto.toUpperCase();
  const anchoT = ctx.measureText(texto).width;
  ctx.font = `500 ${tamSub}px ${SANS}`;
  ctx.letterSpacing = '0px';
  const anchoS = e.subtitulo ? ctx.measureText(e.subtitulo).width : 0;
  const pad = 26 * u;
  const anchoCaja = Math.max(anchoT, anchoS) + pad * 2;
  const altoCaja = tam * 1.15 + (e.subtitulo ? tamSub * 1.6 : 0) + pad * 1.4;
  const x = (w - anchoCaja) / 2;
  const y = e.posicion === 'arriba' ? h * 0.08 : e.posicion === 'abajo' ? h * 0.92 - altoCaja : (h - altoCaja) / 2;

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
  ctx.font = `800 ${tam}px ${SANS}`;
  ctx.letterSpacing = `${1 * u}px`;
  ctx.fillText(texto, w / 2, y + pad * 0.7);
  if (e.subtitulo) {
    ctx.font = `500 ${tamSub}px ${SANS}`;
    ctx.letterSpacing = '0px';
    ctx.fillStyle = papel ? '#4A4337' : 'rgba(255,255,255,0.8)';
    ctx.fillText(e.subtitulo, w / 2, y + pad * 0.7 + tam * 1.2);
  }
  ctx.restore();
};
