// Servidor local de Electric Eye (puerto 5175).
// - /ws       : la pestaña del editor se conecta aquí y ejecuta órdenes.
// - /rpc      : el conector MCP envía una orden y espera la respuesta del editor.
// - /guardar  : el editor sube vídeos y PNG; se guardan en salidas/.
// - /salud    : comprobación rápida.
import {createServer} from 'node:http';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {WebSocketServer} from 'ws';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PUERTO = Number(process.env.EE_PUERTO ?? 5175);
const CONFIG = join(RAIZ, 'electric-eye.config.json');

const leerConfig = () => {
  try {
    return JSON.parse(readFileSync(CONFIG, 'utf8'));
  } catch {
    return {};
  }
};

/**
 * Carpeta donde se guardan vídeos, PNG y proyectos. Orden de prioridad:
 * variable EE_SALIDAS → electric-eye.config.json → D:\ElectricEye\salidas si existe el disco D (Windows) → ./salidas.
 */
const salidasPorDefecto = () => {
  if (process.env.EE_SALIDAS) return resolve(process.env.EE_SALIDAS);
  const c = leerConfig();
  if (c.salidas) return resolve(c.salidas);
  if (process.platform === 'win32' && existsSync('D:\\')) return 'D:\\ElectricEye\\salidas';
  return join(RAIZ, 'salidas');
};
let salidas = salidasPorDefecto();
export const rutaSalidas = () => salidas;

/** Cambia la carpeta de salida y la recuerda para las próximas veces. */
export const fijarSalidas = (ruta) => {
  const r = resolve(ruta);
  mkdirSync(r, {recursive: true});
  salidas = r;
  writeFileSync(CONFIG, JSON.stringify({...leerConfig(), salidas: r}, null, 2));
  return r;
};
// Compatibilidad: valor inicial (usar rutaSalidas() para el valor vigente).
export const SALIDAS = salidas;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const leerCuerpo = (req) => new Promise((ok, mal) => {
  const partes = [];
  req.on('data', (c) => partes.push(c));
  req.on('end', () => ok(Buffer.concat(partes)));
  req.on('error', mal);
});

const responder = (res, codigo, datos) => {
  res.writeHead(codigo, {'Content-Type': 'application/json; charset=utf-8', ...cors});
  res.end(JSON.stringify(datos));
};

export const iniciarPuente = () => new Promise((ok, mal) => {
  let editor = null; // última pestaña conectada
  const pendientes = new Map();

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PUERTO}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    if (url.pathname === '/salud') return responder(res, 200, {ok: true, editor: Boolean(editor), salidas: rutaSalidas()});

    if (url.pathname === '/config' && req.method === 'POST') {
      try {
        const {salidas: nueva} = JSON.parse((await leerCuerpo(req)).toString('utf8'));
        return responder(res, 200, {ok: true, salidas: fijarSalidas(nueva)});
      } catch (e) {
        return responder(res, 400, {ok: false, error: `No se pudo usar esa carpeta: ${e.message}`});
      }
    }

    if (url.pathname === '/guardar' && req.method === 'POST') {
      const nombre = (url.searchParams.get('nombre') ?? 'archivo').replace(/[^\w.\- ]+/g, '_');
      mkdirSync(rutaSalidas(), {recursive: true});
      const ruta = join(rutaSalidas(), nombre);
      writeFileSync(ruta, await leerCuerpo(req));
      return responder(res, 200, {ruta});
    }

    if (url.pathname === '/rpc' && req.method === 'POST') {
      let orden;
      try {
        orden = JSON.parse((await leerCuerpo(req)).toString('utf8'));
      } catch {
        return responder(res, 400, {ok: false, error: 'JSON no válido'});
      }
      if (!editor || editor.readyState !== 1) {
        return responder(res, 409, {ok: false, error: 'El editor de Electric Eye no está abierto. Arráncalo con "npm run iniciar" (o Iniciar Electric Eye.bat) y deja la pestaña abierta.'});
      }
      const id = randomUUID();
      const limite = Number(orden.limiteMs ?? 120000);
      const respuesta = await new Promise((fin) => {
        const reloj = setTimeout(() => {
          pendientes.delete(id);
          fin({ok: false, error: `El editor no respondió en ${Math.round(limite / 1000)} s`});
        }, limite);
        pendientes.set(id, (r) => {
          clearTimeout(reloj);
          fin(r);
        });
        editor.send(JSON.stringify({id, accion: orden.accion, datos: orden.datos ?? {}}));
      });
      return responder(res, respuesta.ok ? 200 : 500, respuesta);
    }
    responder(res, 404, {ok: false, error: 'Ruta desconocida'});
  });

  const wss = new WebSocketServer({server: servidor, path: '/ws'});
  wss.on('connection', (ws) => {
    editor = ws;
    ws.on('message', (m) => {
      let msg;
      try {
        msg = JSON.parse(String(m));
      } catch {
        return;
      }
      const fin = msg.id && pendientes.get(msg.id);
      if (fin) {
        pendientes.delete(msg.id);
        fin(msg);
      }
    });
    ws.on('close', () => {
      if (editor === ws) editor = null;
    });
  });

  servidor.once('error', mal);
  servidor.listen(PUERTO, '127.0.0.1', () => ok(servidor));
});

/** ¿Hay ya un puente escuchando (por ejemplo, lanzado por "npm run iniciar")? */
export const puenteActivo = async () => {
  try {
    // Con límite: un proceso colgado en el puerto no debe dejar el arranque esperando para siempre.
    const r = await fetch(`http://127.0.0.1:${PUERTO}/salud`, {signal: AbortSignal.timeout(2000)});
    return r.ok;
  } catch {
    return false;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  iniciarPuente().then(() => console.log(`Electric Eye · puente en http://127.0.0.1:${PUERTO} · salidas en ${rutaSalidas()}`));
}
