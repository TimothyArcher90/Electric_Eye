// Render en segundo plano desde el editor: encarga el vídeo al servidor local (servidor/render.mjs), que lo
// hace en un navegador oculto. El editor solo muestra el avance en la barra superior; se puede seguir
// trabajando, cambiar de pestaña o cerrarla.
import type {Vista} from './camara';
import type {Proyecto} from './proyecto';

export type Trabajo = {
  id: string; fase: string; hecho: number; total: number; ruta: string | null; error: string | null;
  inicio: number; segundos: number; mb?: number; codec?: string; formato?: string;
};

/** Para el chat y el conector: renderizando | listo | error (como la exportación de antes). */
export const faseSimple = (f: string) => (f === 'listo' ? 'listo' : f === 'error' || f === 'cancelado' ? 'error' : 'renderizando');

export const encargarVideo = async (p: Proyecto, anchoCss: number, vista: Vista | null): Promise<Trabajo> => {
  const r = await fetch('/api/render', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({proyecto: p, anchoCss, vista})});
  if (!r.ok) throw new Error(`No se pudo encargar el render (${r.status})`);
  return (await r.json()) as Trabajo;
};

export const estadoVideo = async (id?: string): Promise<Trabajo | null> => {
  const r = await fetch(`/api/render/estado${id ? `?id=${id}` : ''}`, {cache: 'no-store'});
  if (!r.ok) return null;
  const t = (await r.json()) as Trabajo & {fase: string};
  return t.fase === 'ninguno' ? null : t;
};

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Sigue un trabajo hasta que termina: pinta la barra superior y avisa al chat (evento ee-exportacion). */
export const seguirVideo = (id: string, avisar: (texto: string) => void) => {
  const pastilla = document.getElementById('render-estado') as HTMLDivElement;
  const evento = (t: Trabajo) => window.dispatchEvent(new CustomEvent('ee-exportacion', {detail: {
    fase: faseSimple(t.fase), inicio: t.inicio, segundos: t.segundos, ruta: t.ruta, mb: t.mb, error: t.error}}));
  let primero = true;
  const tic = async () => {
    const t = await estadoVideo(id).catch(() => null);
    if (!t) return void window.setTimeout(tic, 2000);
    if (primero) {
      primero = false;
      evento(t);
    }
    pastilla.hidden = false;
    const fin = faseSimple(t.fase) !== 'renderizando';
    if (!fin) {
      const pct = t.total ? Math.round((t.hecho / t.total) * 100) : 0;
      pastilla.className = 'render-estado';
      pastilla.innerHTML = `<span class="render-barra" style="--p:${pct}%"></span>` +
        `🎬 ${t.fase === 'en cola' ? 'En cola' : t.fase === 'preparando' ? 'Preparando' : `Renderizando ${t.hecho}/${t.total}`}` +
        ` · ${reloj(t.segundos)} <button data-accion="cancelar" title="Cancelar el render">✕</button>`;
      return void window.setTimeout(tic, 1000);
    }
    evento(t);
    if (t.fase === 'listo') {
      pastilla.className = 'render-estado listo';
      pastilla.innerHTML = `✅ Vídeo listo en ${reloj(t.segundos)} · ${t.mb ?? '?'} MB <button data-accion="carpeta">Abrir carpeta</button>` +
        ` <button data-accion="cerrar" title="Ocultar">✕</button>`;
      avisar(`Vídeo guardado: ${t.ruta}`);
    } else {
      pastilla.className = 'render-estado error';
      pastilla.innerHTML = `⚠️ ${t.fase === 'cancelado' ? 'Render cancelado' : `El render falló: ${t.error ?? ''}`} <button data-accion="cerrar">✕</button>`;
    }
  };
  pastilla.onclick = (e) => {
    const accion = (e.target as HTMLElement).dataset.accion;
    if (accion === 'cancelar') void fetch('/api/render/cancelar', {method: 'POST', body: JSON.stringify({id})});
    if (accion === 'carpeta') void fetch('/api/abrir-salidas', {method: 'POST'});
    if (accion === 'cerrar') pastilla.hidden = true;
  };
  void tic();
};
