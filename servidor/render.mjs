// Render en segundo plano: "encargar y olvidar".
// El servidor abre un navegador oculto (Edge o Chrome del ordenador, sin ventana), carga render.html y
// renderiza ahí el vídeo con el mismo motor que el editor. No hace falta tener la pestaña del editor
// delante ni abierta: el vídeo termina solo en la carpeta de salidas.
import {existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';

const URL_RENDER = 'http://127.0.0.1:5174/render.html';
const trabajos = new Map(); // id → estado del trabajo
const cola = [];
let enMarcha = null;

/** Navegadores a probar, en orden. En Windows siempre está Edge. EE_NAVEGADOR permite fijar uno. */
const opcionesNavegador = () => {
  const args = ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  const lista = [];
  if (process.env.EE_NAVEGADOR) lista.push({executablePath: process.env.EE_NAVEGADOR});
  if (process.platform === 'win32') {
    lista.push({channel: 'msedge'}, {channel: 'chrome'});
    args.push('--use-angle=d3d11'); // tarjeta gráfica de Windows (DirectX)
  } else if (process.platform === 'darwin') {
    lista.push({channel: 'chrome'}, {channel: 'msedge'});
  } else {
    lista.push({channel: 'chrome'}, {channel: 'chromium'});
    for (const p of ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']) {
      if (existsSync(p)) lista.push({executablePath: p});
    }
    args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  }
  return lista.map((o) => ({...o, headless: true, args}));
};

const abrirNavegador = async () => {
  let ultimo;
  for (const o of opcionesNavegador()) {
    try {
      return await chromium.launch(o);
    } catch (e) {
      ultimo = e;
    }
  }
  throw new Error(`No encontré Edge ni Chrome para renderizar en segundo plano (${String(ultimo?.message ?? ultimo).split('\n')[0]}).`);
};

const publico = (t) => {
  const {cancelar: _c, ...resto} = t;
  return {...resto, segundos: Math.round(((t.fin ?? Date.now()) - t.inicio) / 1000)};
};

const ejecutar = async (t) => {
  enMarcha = t;
  t.fase = 'preparando';
  t.inicio = Date.now();
  let nav;
  try {
    nav = await abrirNavegador();
    const pag = await nav.newPage({viewport: {width: 1280, height: 800}});
    pag.on('console', (m) => {
      if (m.type() === 'error') console.log(`  [render] ${m.text().slice(0, 200)}`);
    });
    await pag.exposeFunction('eeProgreso', (hecho, total, fase) => {
      t.hecho = hecho;
      t.total = total;
      t.fase = fase === 'Renderizando' ? 'renderizando' : t.fase === 'renderizando' ? 'cerrando' : 'preparando';
    });
    await pag.goto(URL_RENDER, {waitUntil: 'load'});
    await pag.waitForFunction(() => typeof window.eeRender === 'function', null, {timeout: 60000});
    t.cancelar = async () => pag.evaluate(() => (window.eeCancelar = true)).catch(() => undefined);
    const r = await pag.evaluate(([p, ancho, vista, nombre]) => window.eeRender(p, ancho, vista, nombre),
      [t.proyecto, t.anchoCss, t.vista, t.nombre]);
    Object.assign(t, {fase: 'listo', ruta: r.ruta, codec: r.codec, mb: r.mb});
    console.log(`  Vídeo listo en ${Math.round((Date.now() - t.inicio) / 1000)} s: ${r.ruta}`);
  } catch (e) {
    t.fase = t.cancelado ? 'cancelado' : 'error';
    t.error = String(e?.message ?? e).split('\n')[0];
    console.log(`  El render falló: ${t.error}`);
  } finally {
    t.fin = Date.now();
    delete t.proyecto; // no guardar el proyecto entero en memoria
    await nav?.close().catch(() => undefined);
    enMarcha = null;
    const siguiente = cola.shift();
    if (siguiente) void ejecutar(siguiente);
  }
};

const slug = (s) => String(s || 'mapa').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'mapa';

/** Encarga un render. Devuelve el trabajo al momento; el vídeo se hace en segundo plano. */
export const encargarRender = ({proyecto, anchoCss, vista}) => {
  const hora = new Date().toTimeString().slice(0, 5).replace(':', '');
  const t = {id: randomUUID().slice(0, 8), nombre: `${slug(proyecto?.nombre)}-${hora}`, fase: 'en cola', hecho: 0,
    total: Math.round((proyecto?.duracion ?? 0) * (proyecto?.fps ?? 30)), ruta: null, error: null,
    inicio: Date.now(), proyecto, anchoCss: anchoCss || 960, vista: vista ?? null,
    formato: `${proyecto?.ancho}×${proyecto?.alto} · ${proyecto?.fps} fps`};
  trabajos.set(t.id, t);
  if (enMarcha) cola.push(t);
  else void ejecutar(t);
  return publico(t);
};

export const estadoRender = (id) => {
  const t = id ? trabajos.get(id) : [...trabajos.values()].at(-1);
  return t ? publico(t) : null;
};

export const cancelarRender = async (id) => {
  const t = id ? trabajos.get(id) : enMarcha;
  if (!t) return null;
  t.cancelado = true;
  const i = cola.indexOf(t);
  if (i >= 0) {
    cola.splice(i, 1);
    t.fase = 'cancelado';
  } else await t.cancelar?.();
  return publico(t);
};
