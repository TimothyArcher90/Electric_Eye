// Mantiene la pestaña del editor al día: si Electric Eye se actualizó (dist/version.json cambió) y no se está
// exportando, recarga la página. Así nunca se trabaja con una versión vieja que se quedó abierta en el navegador.
declare const __COMPILACION__: string;
export const COMPILACION = __COMPILACION__;

export const vigilarVersion = (ocupado: () => boolean) => {
  const marca = document.getElementById('version');
  if (marca) marca.textContent = `v ${COMPILACION}`;
  const comprobar = async () => {
    try {
      const r = await fetch(`version.json?_=${Date.now()}`, {cache: 'no-store'});
      if (!r.ok) return;
      const {compilacion} = (await r.json()) as {compilacion: string};
      if (compilacion && compilacion !== COMPILACION && !ocupado()) location.reload();
    } catch {
      /* servidor apagado un momento: se reintenta */
    }
  };
  void comprobar();
  window.setInterval(comprobar, 20000);
};
