// Página del render en segundo plano. La abre un navegador oculto (servidor/render.mjs): recibe el proyecto,
// lo renderiza fotograma a fotograma con el mismo motor que el editor y guarda el vídeo en la carpeta de salidas.
import 'maplibre-gl/dist/maplibre-gl.css';
import type {Vista} from './camara';
import {capturarPNG, exportarVideo} from './exportar';
import type {Proyecto} from './proyecto';
import {subirArchivo} from './puente';

declare global {
  interface Window {
    eeProgreso?: (hecho: number, total: number, fase: string) => void;
    eeRender?: (p: Proyecto, anchoCss: number, vista: Vista | null, nombre: string) => Promise<{ruta: string; codec: string; mb: number; calidad: unknown; tarjeta: string; codificador: string}>;
    eeCancelar?: boolean;
    eeFoto?: (p: Proyecto, anchoCss: number, t: number) => Promise<string>;
  }
}

window.eeRender = async (p, anchoCss, vista, nombre) => {
  const r = await exportarVideo(p, anchoCss, (h, t, f) => window.eeProgreso?.(h, t, f), () => Boolean(window.eeCancelar), vista);
  const ruta = await subirArchivo(r.blob, `${nombre}.${r.extension.replace(/^\./, '')}`);
  return {ruta, codec: r.codec, mb: +(r.blob.size / 1e6).toFixed(1), calidad: r.calidad, tarjeta: r.tarjeta, codificador: r.codificador};
};

/** Fotograma suelto (pruebas y revisión): devuelve la imagen como data URL. */
window.eeFoto = async (p, anchoCss, t) => {
  const b = await capturarPNG(p, t, anchoCss);
  return await new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.readAsDataURL(b);
  });
};
