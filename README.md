# Mapas multimedia

Portal para **navegar, diseñar y animar mapas** y exportarlos como vídeo de alta calidad, en el registro de los documentales de geopolítica: globo que gira, vuelo de cámara hasta la región, países que se iluminan, rutas que se dibujan, pines con etiqueta de papel, relieve y grano de película.

Funciona en el navegador. No necesita After Effects ni plugins de pago, y no pide claves de API.

## Arrancar

```bash
npm install
npm run dev        # abre http://localhost:5173
```

Para publicarlo como web estática: `npm run build` y sube la carpeta `dist/` a cualquier hosting (Vercel, Netlify, GitHub Pages).

Navegador recomendado: **Chrome o Edge** de escritorio con aceleración por hardware (la exportación usa WebCodecs).

## Cómo se trabaja

| Paso | Qué haces |
|---|---|
| 1. Encuadre | Elige formato (16:9, 4K, 9:16, 4:5, 1:1, 4:3) y FPS arriba. |
| 2. Estilo | Documental (papel), Geopolítico (relieve), Noche, Minimal, Satélite o Calles. Activa globo, relieve, terreno 3D, ríos, mares, provincias… |
| 3. Cámara | Navega el mapa (arrastrar = mover; clic derecho o Ctrl + arrastrar = girar e inclinar). Pulsa **K** para fijar un keyframe. Mueve el cabezal y repite. La cámara viaja entre keyframes con la curva elegida; **Vuelo** la aleja a mitad de trayecto. |
| 4. Elementos | Herramientas: **País** (clic en el país), **Ruta** (clics + doble clic), **Pin**, **Texto**, **Zona** (radio en km) y **Título**. Cada elemento tiene su barra en la línea de tiempo: arrástrala o estírala. |
| 5. Exportar | **Exportar vídeo** renderiza fotograma a fotograma (sin saltos, esperando a que cargue cada tesela) en MP4 (H.264 si el navegador lo soporta; si no, VP9/AV1). **Capturar PNG** saca el fotograma actual a resolución final. |

Atajos: `Espacio` reproducir · `K` keyframe · `←/→` fotograma (con `Shift`, 1 s) · `Supr` borrar · `Ctrl+Z / Ctrl+Y` deshacer y rehacer · `Esc` cancelar · `G` guías de zona segura.

El proyecto se guarda solo en el navegador. **Guardar / Abrir** lo exporta e importa como `.mapa.json`, para versionarlo o compartirlo.

## Datos y licencias

| Capa | Fuente | Licencia |
|---|---|---|
| Países, ciudades, ríos, lagos, mares, provincias | [Natural Earth](https://www.naturalearthdata.com) (incluida en `public/data/`) | Dominio público |
| Relieve y terreno 3D | Terrarium (Mapzen / Joerd) en AWS Open Data | Abierta, con atribución |
| Satélite | Sentinel-2 cloudless **2016** de EOX | CC BY 4.0 (atribución obligatoria) |
| Calles | OpenFreeMap (datos de OpenStreetMap) | ODbL, atribución "© OpenStreetMap contributors" |
| Tipografía | Noto Sans (en `public/fonts/`) | SIL Open Font License |

La atribución de cada estilo aparece en el panel derecho. Ponla en pantalla o en la descripción del vídeo.

Avisos:
- Los años más recientes de Sentinel-2 cloudless (2018 en adelante) son **no comerciales**. Por eso el portal usa 2016.
- Natural Earth dibuja una versión de las fronteras en disputa. Si la frontera es el tema del vídeo, avísalo en pantalla o dibújala a mano.
- El satélite, las calles y el relieve se descargan de servicios públicos gratuitos. Sin conexión, los estilos vectoriales siguen funcionando (todo lo de Natural Earth va incluido).

## Regenerar los datos

```bash
mkdir -p data-raw && cd data-raw
B=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
for f in ne_10m_admin_0_countries ne_50m_admin_0_countries ne_10m_populated_places ne_10m_rivers_lake_centerlines ne_10m_lakes ne_10m_admin_1_states_provinces_lines ne_10m_geography_marine_polys; do curl -LO $B/$f.geojson; done
cd .. && npm run datos
```

## Arquitectura

| Archivo | Qué hace |
|---|---|
| `src/proyecto.ts` | Modelo del proyecto (JSON): keyframes y elementos. |
| `src/camara.ts` | Interpolación de cámara en Mercator, curvas y vuelo. |
| `src/estilos.ts` | Estilos de mapa (MapLibre) y paletas. |
| `src/capas.ts` | Proyecto → capas del mapa en el segundo *t* (rutas, pines, zonas, países por feature-state). |
| `src/overlay.ts` | Títulos, fuente, grano y viñeta (vista previa y exportación). |
| `src/exportar.ts` | Render determinista en un mapa oculto y codificación MP4 (Mediabunny + WebCodecs). |
| `src/main.ts` | Interfaz del editor: línea de tiempo, inspector, herramientas. |

Motor: [MapLibre GL JS](https://maplibre.org) (globo, terreno 3D, sombreado de relieve) y [Mediabunny](https://mediabunny.dev) para escribir el MP4.
