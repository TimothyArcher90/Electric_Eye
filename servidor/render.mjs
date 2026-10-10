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
  const comunes = ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    // En portátiles con dos tarjetas, la potente (NVIDIA/AMD) y no la integrada.
    '--force_high_performance_gpu'];
  // En Windows y macOS el navegador se abre con ventana, pero colocada fuera de la pantalla: así usa la tarjeta
  // gráfica con seguridad (un navegador sin ventana puede caer en dibujo por software, diez veces más lento) y el
  // usuario no ve nada. EE_RENDER_OCULTO=1 fuerza el modo sin ventana.
  const conVentana = process.platform !== 'linux' && !process.env.EE_RENDER_OCULTO;
  if (conVentana) comunes.push('--window-position=-32000,-32000', '--window-size=1280,800', '--no-first-run', '--no-default-browser-check');
  const lista = [];
  const poner = (o, extra = []) => lista.push({...o, headless: !conVentana, args: [...comunes, ...extra]});
  if (process.env.EE_NAVEGADOR) poner({executablePath: process.env.EE_NAVEGADOR});
  if (process.platform === 'win32') {
    // DirectX 11 primero; si el navegador cae a software, se prueba con su configuración de fábrica y luego Chrome.
    poner({channel: 'msedge'}, ['--use-angle=d3d11']);
    poner({channel: 'msedge'});
    poner({channel: 'chrome'}, ['--use-angle=d3d11']);
    poner({channel: 'chrome'});
  } else if (process.platform === 'darwin') {
    poner({channel: 'chrome'}, ['--use-angle=metal']);
    poner({channel: 'chrome'});
    poner({channel: 'msedge'});
  } else {
    const sw = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
    poner({channel: 'chrome'}, sw);
    poner({channel: 'chromium'}, sw);
    for (const p of ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']) {
      if (existsSync(p)) poner({executablePath: p}, sw);
    }
  }
  return lista;
};

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;

/** Tarjeta gráfica que ve una página (nombre del renderizador WebGL). */
const leerTarjeta = (pag) => pag.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2', {powerPreference: 'high-performance'});
  if (!gl) return 'sin WebGL';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}).catch(() => 'desconocida');

/** Abre el primer navegador que dibuje con la tarjeta gráfica. Si todos caen a software, usa el primero que abrió. */
const abrirNavegador = async () => {
  let ultimo;
  let reserva = null;
  for (const o of opcionesNavegador()) {
    let nav;
    try {
      nav = await chromium.launch(o);
      const pag = await nav.newPage({viewport: {width: 1280, height: 800}});
      const tarjeta = await leerTarjeta(pag);
      if (!SOFTWARE.test(tarjeta) || process.platform === 'linux') {
        await reserva?.nav.close().catch(() => undefined);
        return {nav, pag, tarjeta, gpu: !SOFTWARE.test(tarjeta)};
      }
      console.log(`  [render] ${o.channel ?? 'navegador'} dibuja por software (${tarjeta}); pruebo otra configuración.`);
      if (!reserva) reserva = {nav, pag, tarjeta, gpu: false};
      else await nav.close();
    } catch (e) {
      ultimo = e;
      await nav?.close().catch(() => undefined);
    }
  }
  if (reserva) return reserva;
  throw new Error(`No encontré Edge ni Chrome para renderizar en segundo plano (${String(ultimo?.message ?? ultimo).split('\n')[0]}).`);
};

const publico = (t) => {
  const {cancelar: _c, proyecto: _p, ...resto} = t; // sin el proyecto entero: la respuesta debe ser ligera
  return {...resto, segundos: Math.round(((t.fin ?? Date.now()) - t.inicio) / 1000)};
};

const ejecutar = async (t) => {
  enMarcha = t;
  t.fase = 'preparando';
  t.inicio = Date.now();
  let nav;
  try {
    const abierto = await abrirNavegador();
    nav = abierto.nav;
    const pag = abierto.pag;
    t.tarjeta = abierto.tarjeta;
    t.gpu = abierto.gpu;
    console.log(`  Render con: ${abierto.tarjeta}${abierto.gpu ? '' : ' (sin tarjeta gráfica: irá lento)'}`);
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
    // EE_RENDER_FPS: solo para pruebas en máquinas sin tarjeta gráfica (renderiza a menos fotogramas por segundo).
    if (process.env.EE_RENDER_FPS) t.proyecto = {...t.proyecto, fps: Number(process.env.EE_RENDER_FPS)};
    const r = await pag.evaluate(([p, ancho, vista, nombre]) => window.eeRender(p, ancho, vista, nombre),
      [t.proyecto, t.anchoCss, t.vista, t.nombre]);
    Object.assign(t, {fase: 'listo', ruta: r.ruta, codec: r.codec, mb: r.mb, calidad: r.calidad, codificador: r.codificador});
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
