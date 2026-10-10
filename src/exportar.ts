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
import {desfaseZoom, type Vista, vistaEn} from './camara';
import {precargarModelos} from './modelos3d';
import {aplicarElementos, precargarGeometrias, precargarImagenes, registrarImagenes} from './capas';
import {construirEstilo, paletaDe} from './estilos';
import {cargarFuentes, componerMapa, pintarOverlay} from './overlay';
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

  constructor(private p: Proyecto, private anchoCss: number, private vistaFija: Vista | null = null) {
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
    await Promise.all([precargarImagenes(this.p), precargarGeometrias(), cargarFuentes(), precargarModelos()]);
    const estilo = await construirEstilo(this.p.estilo, this.p.opciones, this.p.preset);
    this.map = new maplibregl.Map({
      container: this.cont,
      style: estilo,
      pixelRatio: this.p.ancho / this.anchoCss,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0, // sin fundidos de etiquetas: cada fotograma es exacto
      // Pide la tarjeta gráfica potente (en portátiles con dos, la dedicada).
      canvasContextAttributes: {preserveDrawingBuffer: true, antialias: true, powerPreference: 'high-performance'},
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
    // Sin keyframes, la cámara se queda en la vista del editor.
    const v = vistaEn(this.p.camara, t, this.anchoCss) ?? this.vistaFija;
    if (v) this.map.jumpTo({center: v.centro, zoom: v.zoom + desfaseZoom((this.anchoCss * this.p.alto) / this.p.ancho), bearing: v.rumbo, pitch: v.inclinacion});
    aplicarElementos(this.map, this.p, t);
    await this.esperarListo();
    const {ctx, lienzo} = this;
    ctx.fillStyle = paletaDe(this.p.estilo, this.p.preset).espacio;
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    componerMapa(ctx, this.map.getCanvas(), lienzo.width, lienzo.height, this.p.opciones);
    pintarOverlay(ctx, lienzo.width, lienzo.height, this.p, t);
  }

  private async esperarListo() {
    const m = this.map;
    const limite = performance.now() + 30000; // red caída o tesela que no llega: no bloquear para siempre
    for (;;) {
      await new Promise<void>((ok) => {
        let hecho = false;
        const fin = () => {
          if (!hecho) {
            hecho = true;
            ok();
          }
        };
        m.once('idle', fin);
        m.triggerRepaint();
        setTimeout(fin, 4000);
      });
      if ((m.loaded() && m.areTilesLoaded()) || performance.now() > limite) break;
    }
    // Repintado síncrono: el lienzo refleja el último estado (iconos recién añadidos, datos nuevos).
    m.redraw();
  }

  estado() {
    const m = this.map;
    const capa = (id: string) => (m.getLayer(id) ? m.queryRenderedFeatures({layers: [id]}).length : -1);
    return {
      zoom: m.getZoom(), pitch: m.getPitch(), centro: m.getCenter().toArray(),
      canvas: [m.getCanvas().width, m.getCanvas().height], pixelRatio: m.getPixelRatio(),
      fichas: capa('mm-fichas'), territorio: capa('mm-territorio'), ciudades: capa('ciudades-texto-a'),
      paises: capa('paises-etiquetas'), cargado: m.loaded(),
    };
  }

  /** Tarjeta gráfica con la que dibuja el navegador (para saber si el render va por GPU o por software). */
  tarjeta() {
    const gl = this.map.getCanvas().getContext('webgl2') ?? this.map.getCanvas().getContext('webgl');
    if (!gl) return 'desconocida';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }

  destruir() {
    this.map?.remove();
    this.cont.remove();
  }
}

/** Saltos: fotogramas cuyo cambio supera 3 veces la mediana y un mínimo absoluto. Se agrupan los seguidos. */
export const analizarCambios = (cambios: number[], fps: number) => {
  const orden = [...cambios].sort((a, b) => a - b);
  const mediana = orden[Math.floor(orden.length / 2)] ?? 0;
  const umbral = Math.max(mediana * 3, 6);
  const saltos: {t: number; intensidad: number}[] = [];
  cambios.forEach((v, i) => {
    if (v <= umbral) return;
    const t = +((i + 1) / fps).toFixed(2);
    const ultimo = saltos.at(-1);
    if (ultimo && t - ultimo.t < 0.5) ultimo.intensidad = Math.max(ultimo.intensidad, +(v / Math.max(mediana, 0.5)).toFixed(1));
    else saltos.push({t, intensidad: +(v / Math.max(mediana, 0.5)).toFixed(1)});
  });
  return {movimientoMedio: +mediana.toFixed(2), saltos};
};

export const capturarPNG = async (p: Proyecto, t: number, anchoCss: number, vista: Vista | null = null): Promise<Blob> => {
  const r = new Renderizador(p, anchoCss, vista);
  try {
    await r.iniciar();
    await r.fotograma(t); // calentamiento: filtros de rótulos e imágenes listos
    await r.fotograma(t);
    return await new Promise<Blob>((ok, mal) => r.lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('PNG vacío'))), 'image/png'));
  } finally {
    r.destruir();
  }
};

export const exportarVideo = async (
  p: Proyecto, anchoCss: number, progreso: Progreso, cancelado: () => boolean, vista: Vista | null = null,
): Promise<{blob: Blob; extension: string; codec: string; calidad: ReturnType<typeof analizarCambios>; tarjeta: string; codificador: string}> => {
  const r = new Renderizador(p, anchoCss, vista);
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
    // Codificador de vídeo de la tarjeta gráfica (NVENC, Quick Sync, AMF…) si el navegador lo ofrece.
    let aceleracion: 'prefer-hardware' | 'no-preference' = 'no-preference';
    if (codec === 'avc' && typeof VideoEncoder !== 'undefined') {
      const prueba = await VideoEncoder.isConfigSupported({codec: 'avc1.640033', width: p.ancho, height: p.alto,
        hardwareAcceleration: 'prefer-hardware'}).catch(() => null);
      if (prueba?.supported) aceleracion = 'prefer-hardware';
    }
    const fuente = new CanvasSource(r.lienzo, {codec, bitrate: QUALITY_VERY_HIGH, keyFrameInterval: 2, hardwareAcceleration: aceleracion});
    const tarjeta = r.tarjeta();
    console.log(`[exportar] tarjeta: ${tarjeta} · codificador: ${aceleracion === 'prefer-hardware' ? 'hardware' : 'automático'}`);
    output.addVideoTrack(fuente, {frameRate: p.fps});
    await output.start();

    const total = Math.max(1, Math.round(p.duracion * p.fps));
    // Fotograma de calentamiento (se descarta): los filtros de rótulos y las imágenes se aplican en el primer
    // pase, y sin él el primer fotograma del vídeo salía con rótulos que no tocaban.
    await r.fotograma(0);
    // Control de calidad: cada fotograma se reduce a 64 px de ancho y se compara con el anterior. Un cambio
    // mucho mayor que lo normal (salto de cámara, parpadeo, tesela que aparece de golpe) queda anotado.
    const mini = document.createElement('canvas');
    mini.width = 64;
    mini.height = Math.max(1, Math.round((64 * p.alto) / p.ancho));
    const mctx = mini.getContext('2d', {willReadFrequently: true})!;
    let previo: Uint8ClampedArray | null = null;
    const sub = p.opciones.desenfoqueMovimiento ? 3 : 1;
    const acum = sub > 1 ? Object.assign(document.createElement('canvas'), {width: p.ancho, height: p.alto}) : null;
    const actx = acum?.getContext('2d');
    const cambios: number[] = [];
    for (let i = 0; i < total; i++) {
      if (cancelado()) {
        await output.cancel();
        throw new Error('Exportación cancelada');
      }
      const t = i / p.fps;
      const a = performance.now();
      if (sub > 1) {
        // Desenfoque de movimiento: varias vistas dentro del tiempo de obturación (medio fotograma) promediadas,
        // como la cámara de cine a 180°.
        for (let k = 0; k < sub; k++) {
          await r.fotograma(Math.max(0, t + ((k + 0.5) / sub - 0.5) * (0.5 / p.fps)));
          actx!.globalAlpha = 1 / (k + 1);
          actx!.drawImage(r.lienzo, 0, 0);
        }
        const lctx = r.lienzo.getContext('2d')!;
        lctx.globalAlpha = 1;
        lctx.drawImage(acum!, 0, 0);
      } else {
        await r.fotograma(t);
      }
      mctx.drawImage(r.lienzo, 0, 0, mini.width, mini.height);
      const px = mctx.getImageData(0, 0, mini.width, mini.height).data;
      if (previo) {
        let suma = 0;
        for (let k = 0; k < px.length; k += 4) suma += Math.abs(px[k] - previo[k]) + Math.abs(px[k + 1] - previo[k + 1]) + Math.abs(px[k + 2] - previo[k + 2]);
        cambios.push(suma / (px.length / 4) / 3);
      }
      previo = px.slice();
      const b = performance.now();
      await fuente.add(t, 1 / p.fps);
      console.debug(`[exportar] f${i} render ${(b - a).toFixed(0)} ms · codificar ${(performance.now() - b).toFixed(0)} ms`);
      progreso(i + 1, total, 'Renderizando');
    }
    progreso(total, total, 'Cerrando archivo');
    await output.finalize();
    const buf = (output.target as BufferTarget).buffer!;
    return {blob: new Blob([buf], {type: formato.mimeType}), extension: formato.fileExtension, codec,
      calidad: analizarCambios(cambios, p.fps), tarjeta, codificador: aceleracion === 'prefer-hardware' ? 'hardware' : 'automático'};
  } finally {
    r.destruir();
  }
};

/** Diagnóstico: estado del mapa de exportación tras pintar el fotograma t. */
export const diagnosticar = async (p: Proyecto, t: number, anchoCss: number) => {
  const r = new Renderizador(p, anchoCss);
  try {
    await r.iniciar();
    await r.fotograma(t);
    return r.estado();
  } finally {
    r.destruir();
  }
};
