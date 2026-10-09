import maplibregl from 'maplibre-gl';
import {
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_VERY_HIGH,
  WebMOutputFormat,
} from 'mediabunny';
import {vistaEn} from './camara';
import {aplicarElementos, registrarImagenes} from './capas';
import {construirEstilo, paletaDe} from './estilos';
import {pintarOverlay} from './overlay';
import type {Proyecto} from './proyecto';

export type Progreso = (hecho: number, total: number, fase: string) => void;

/**
 * Motor de render determinista: un mapa oculto del mismo tamaño CSS que el encuadre
 * del editor (así etiquetas y zoom coinciden con lo que ves), con pixelRatio
 * escalado hasta la resolución de salida. Para cada fotograma: coloca la cámara,
 * actualiza capas, espera a que no falte ninguna tesela y compone el overlay.
 */
class Renderizador {
  private map!: maplibregl.Map;
  private cont: HTMLDivElement;
  readonly lienzo: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(private p: Proyecto, private anchoCss: number) {
    this.cont = document.createElement('div');
    const altoCss = (anchoCss * p.alto) / p.ancho;
    Object.assign(this.cont.style, {
      position: 'fixed', left: '-20000px', top: '0', width: `${anchoCss}px`, height: `${altoCss}px`,
      pointerEvents: 'none',
    });
    document.body.appendChild(this.cont);
    this.lienzo = document.createElement('canvas');
    this.lienzo.width = p.ancho;
    this.lienzo.height = p.alto;
    this.ctx = this.lienzo.getContext('2d')!;
  }

  async iniciar() {
    const estilo = await construirEstilo(this.p.estilo, this.p.opciones, this.p.preset);
    this.map = new maplibregl.Map({
      container: this.cont,
      style: estilo,
      pixelRatio: this.p.ancho / this.anchoCss,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0, // sin fundidos de etiquetas: cada fotograma es exacto
      canvasContextAttributes: {preserveDrawingBuffer: true, antialias: true},
      maxCanvasSize: [8192, 8192],
    });
    registrarImagenes(this.map);
    // Una tesela que falla (red, CORS) dispara 'error' pero no impide renderizar: solo se registra.
    this.map.on('error', (e) => console.warn('[exportar]', e.error?.message ?? e));
    await new Promise<void>((ok, mal) => {
      const t = setTimeout(() => mal(new Error('El mapa no terminó de cargar en 60 s. Revisa la conexión.')), 60000);
      this.map.once('load', () => {
        clearTimeout(t);
        ok();
      });
    });
  }

  async fotograma(t: number) {
    const v = vistaEn(this.p.camara, t, this.anchoCss);
    if (v) this.map.jumpTo({center: v.centro, zoom: v.zoom, bearing: v.rumbo, pitch: v.inclinacion});
    aplicarElementos(this.map, this.p, t);
    await this.esperarListo();
    const {ctx, lienzo} = this;
    ctx.fillStyle = paletaDe(this.p.estilo, this.p.preset).espacio;
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(this.map.getCanvas(), 0, 0, lienzo.width, lienzo.height);
    pintarOverlay(ctx, lienzo.width, lienzo.height, this.p, t);
  }

  private esperarListo() {
    return new Promise<void>((ok) => {
      let hecho = false;
      const fin = () => {
        if (hecho) return;
        hecho = true;
        ok();
      };
      this.map.once('idle', fin);
      this.map.triggerRepaint();
      // Red caída o tesela que no llega: no bloquear la exportación para siempre.
      setTimeout(fin, 15000);
    });
  }

  destruir() {
    this.map?.remove();
    this.cont.remove();
  }
}

export const capturarPNG = async (p: Proyecto, t: number, anchoCss: number): Promise<Blob> => {
  const r = new Renderizador(p, anchoCss);
  try {
    await r.iniciar();
    await r.fotograma(t);
    return await new Promise<Blob>((ok, mal) => r.lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('PNG vacío'))), 'image/png'));
  } finally {
    r.destruir();
  }
};

export const exportarVideo = async (
  p: Proyecto, anchoCss: number, progreso: Progreso, cancelado: () => boolean,
): Promise<{blob: Blob; extension: string; codec: string}> => {
  const r = new Renderizador(p, anchoCss);
  try {
    progreso(0, 1, 'Cargando mapa');
    await r.iniciar();

    let formato: Mp4OutputFormat | WebMOutputFormat = new Mp4OutputFormat({fastStart: 'in-memory'});
    let codec = await getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], {width: p.ancho, height: p.alto});
    if (!codec) {
      formato = new WebMOutputFormat();
      codec = await getFirstEncodableVideoCodec(['vp9', 'vp8', 'av1'], {width: p.ancho, height: p.alto});
    }
    if (!codec) throw new Error('Este navegador no puede codificar vídeo. Usa Chrome o Edge actualizados.');

    const output = new Output({format: formato, target: new BufferTarget()});
    const fuente = new CanvasSource(r.lienzo, {codec, bitrate: QUALITY_VERY_HIGH, keyFrameInterval: 2});
    output.addVideoTrack(fuente, {frameRate: p.fps});
    await output.start();

    const total = Math.max(1, Math.round(p.duracion * p.fps));
    for (let i = 0; i < total; i++) {
      if (cancelado()) {
        await output.cancel();
        throw new Error('Exportación cancelada');
      }
      const t = i / p.fps;
      const a = performance.now();
      await r.fotograma(t);
      const b = performance.now();
      await fuente.add(t, 1 / p.fps);
      console.debug(`[exportar] f${i} render ${(b - a).toFixed(0)} ms · codificar ${(performance.now() - b).toFixed(0)} ms`);
      progreso(i + 1, total, 'Renderizando');
    }
    progreso(total, total, 'Cerrando archivo');
    await output.finalize();
    const buf = (output.target as BufferTarget).buffer!;
    return {blob: new Blob([buf], {type: formato.mimeType}), extension: formato.fileExtension, codec};
  } finally {
    r.destruir();
  }
};
