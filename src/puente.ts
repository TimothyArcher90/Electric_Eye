// Conexión con el chat de Claude.
// El servidor local (servidor/puente.mjs) reenvía aquí las órdenes que llegan del
// conector MCP de Electric Eye. Esta pestaña las ejecuta y devuelve el resultado.

export type Orden = {id: string; accion: string; datos?: Record<string, unknown>};
export type Manejador = (accion: string, datos: Record<string, unknown>) => Promise<unknown>;

const URL_PUENTE = 'ws://127.0.0.1:5175/ws';

export const iniciarPuente = (manejar: Manejador, alCambiar: (conectado: boolean) => void) => {
  let ws: WebSocket | null = null;
  let espera = 1000;

  const conectar = () => {
    try {
      ws = new WebSocket(URL_PUENTE);
    } catch {
      setTimeout(conectar, espera);
      return;
    }
    ws.onopen = () => {
      espera = 1000;
      alCambiar(true);
      ws?.send(JSON.stringify({tipo: 'hola', cliente: 'electric-eye'}));
    };
    ws.onclose = () => {
      alCambiar(false);
      // Reintento suave: el servidor puede arrancar después que la página.
      setTimeout(conectar, espera);
      espera = Math.min(10000, espera * 1.5);
    };
    ws.onerror = () => ws?.close();
    ws.onmessage = async (ev) => {
      let orden: Orden;
      try {
        orden = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!orden.id || !orden.accion) return;
      try {
        const resultado = await manejar(orden.accion, orden.datos ?? {});
        ws?.send(JSON.stringify({id: orden.id, ok: true, resultado}));
      } catch (e) {
        ws?.send(JSON.stringify({id: orden.id, ok: false, error: (e as Error).message ?? String(e)}));
      }
    };
  };
  conectar();
};

/** Sube un archivo grande (vídeo, PNG) al servidor local, que lo guarda en disco. */
export const subirArchivo = async (blob: Blob, nombre: string): Promise<string> => {
  const r = await fetch(`http://127.0.0.1:5175/guardar?nombre=${encodeURIComponent(nombre)}`, {method: 'POST', body: blob});
  if (!r.ok) throw new Error(`El servidor local no pudo guardar ${nombre}`);
  const j = (await r.json()) as {ruta: string};
  return j.ruta;
};
