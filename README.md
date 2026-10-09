# Electric Eye

Editor local de mapas animados en el registro de los documentales de geopolítica: atlas en 3D inclinado, países que
se iluminan, frentes que avanzan, fichas de pie, objetivos que laten, radares, rutas, columnas 3D, profundidad de
campo y etalonaje. Exporta MP4 y PNG.

**Se dirige desde el chat de Claude.** Le dices qué quieres contar; Claude monta la pieza en el editor, la mira y la
corrige, y exporta el vídeo. También puedes editar a mano cuando quieras. No hace falta clave de API: usa tu
suscripción de Claude a través de la app de escritorio o de Claude Code.

```
Tú (chat de Claude) ──► conector MCP "electric-eye" ──► puente local :5175 ──► editor en el navegador :5174
                                                                              └─► salidas/  (MP4, PNG, proyectos)
```

## 1. Instalar y arrancar (una vez por sesión)

Necesitas Node.js 20 o superior y Chrome o Edge.

- **Windows:** doble clic en `Iniciar Electric Eye.bat` (la primera vez instala dependencias).
- **Cualquier sistema:** `npm install` y luego `npm run iniciar`.

Se abre `http://127.0.0.1:5174`. Deja esa pestaña abierta: es donde se renderiza. El indicador **● Claude** de la
barra superior se pone verde cuando el chat está conectado.

## 2. Conectar el chat de Claude

### App de escritorio de Claude (recomendado)

Edita el archivo de configuración de la app:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "electric-eye": {
      "command": "node",
      "args": ["D:\\electric-eye\\servidor\\mcp.mjs"]
    }
  }
}
```

Cambia la ruta por la de tu carpeta y reinicia la app. En un chat nuevo verás las herramientas de Electric Eye.

### Claude Code

```bash
claude mcp add electric-eye -- node "D:\electric-eye\servidor\mcp.mjs"
```

> El chat de claude.ai en el navegador no puede llegar a tu ordenador: para dirigir el editor usa la app de escritorio
> o Claude Code. El modelo sigue siendo Claude en la nube; lo único local es el conector y el editor.

## 3. Pedir una pieza

Ejemplos de órdenes:

- "Mapa de 20 s en 16:9: Irán en naranja, frente verde que entra en Irak desde el sur, flota en el golfo de Omán,
  objetivo que late sobre Bandar Abbas y título 'El estrecho de Ormuz'. Cámara baja hacia Ormuz."
- "Ahora sácame la versión Reel" (pasa a 9:16, adapta la cámara, revisa y exporta).
- "Pon columnas 3D con la producción de petróleo de Arabia Saudí, Irak e Irán (te paso las cifras)."
- "Exporta el vídeo."

Claude sigue `servidor/guia-de-direccion.md` (colores por bando, ritmo, cámara, formatos) y revisa cada pieza con
vistas previas antes de exportar.

### Dónde se guardan los archivos

Por defecto, en Windows con disco D: **`D:\ElectricEye\salidas`** (vídeos, PNG y `proyectos/`); si no hay disco D,
en `salidas/` dentro de la carpeta de Electric Eye. Para cambiarla, pídeselo al chat ("guarda las salidas en
E:\Videos\Mapas") o edita `electric-eye.config.json` (`{"salidas": "..."}`). La variable `EE_SALIDAS` tiene prioridad.

Para no ocupar el disco C, pon también la carpeta de Electric Eye en D: (por ejemplo `D:\electric-eye`): ahí quedan
`node_modules` y la caché.

### Herramientas del conector

| Herramienta | Qué hace |
|---|---|
| `guia_de_direccion` | Reglas de estilo y formato de cada elemento |
| `buscar_lugar` | Países, ciudades y mares con coordenadas reales (sin conexión) |
| `nuevo_proyecto` / `configurar_estilo` | Formato, duración, fps, estilo y ajustes |
| `cambiar_formato` | Pasa la pieza a Reel (9:16) u horizontal (16:9) adaptando la cámara |
| `poner_camara` | Keyframes de cámara por lugar o coordenadas |
| `anadir_elementos` / `editar_elemento` / `borrar_elementos` | País, frente, ficha, pin, ruta, texto, zona, título, columna 3D |
| `ver_estado` | Lo que hay ahora en el editor |
| `vista_previa` | Renderiza un fotograma y se lo enseña a Claude |
| `exportar_png` / `exportar_video` / `estado_exportacion` | Archivos finales en `salidas/` |
| `guardar_proyecto` / `abrir_proyecto` | Proyectos `.mapa.json` |
| `carpeta_de_salida` | Consulta o cambia dónde se guardan los archivos |

## 4. Editar a mano

| Paso | Qué haces |
|---|---|
| Encuadre | Botones **▭ Horizontal** (16:9) y **▯ Reel** (9:16) arriba, o el selector de formato (4K, 4:5, 1:1, 4:3). Al cambiar de orientación la cámara se adapta sola, y en Reel aparece la guía de zona segura (tecla `G`). |
| Estilo | **Atlas 3D** por defecto; también Documental, Geopolítico, Realista (montañas), Noche, Minimal, Satélite y Calles. **Ajustes del estilo**: globo, relieve, terreno 3D, ríos, mares, provincias, grano, viñeta, profundidad y etalonaje. |
| Cámara | Navega (arrastrar mueve; clic derecho o Ctrl + arrastrar gira e inclina) y pulsa **K** para fijar un keyframe. |
| Elementos | País, Frente, Ficha, 3D, Ruta, Pin, Texto, Zona y Título. Cada uno tiene su barra en la línea de tiempo. |
| Exportar | **Exportar vídeo** (MP4 con H.264 si el navegador lo soporta, si no VP9/AV1) y **Capturar PNG**. |

Atajos: `Espacio` reproducir · `K` keyframe · `←/→` fotograma (con `Shift`, 1 s) · `Supr` borrar · `Ctrl+Z / Ctrl+Y`
deshacer y rehacer · `Esc` cancelar · `G` guías de zona segura. El botón ◐ cambia entre tema claro y oscuro.

**Copiar el estilo de una referencia:** `referencias/README.md` (proceso) y `referencias/caspian-report-ficha.md`
(ingeniería inversa de la referencia de la que sale el estilo Atlas 3D). **Estilo → Importar estilo…** carga un JSON
con paleta, rampa de altitud, rótulos y opciones.

## Datos y licencias

| Capa | Fuente | Licencia |
|---|---|---|
| Países, ciudades, ríos, lagos, mares, provincias | [Natural Earth](https://www.naturalearthdata.com) (incluido en `public/data/`) | Dominio público |
| Relieve, batimetría y terreno 3D | Terrarium (Mapzen / Joerd) en AWS Open Data | Abierta, con atribución |
| Satélite | Sentinel-2 cloudless **2016** de EOX | CC BY 4.0 |
| Calles | OpenFreeMap (datos de OpenStreetMap) | ODbL, "© OpenStreetMap contributors" |
| Tipografía | Noto Sans, Cinzel y EB Garamond (glifos en `public/fonts/`, generados con `scripts/generar-glifos.py`) | SIL Open Font License |

Los años 2018+ de Sentinel-2 cloudless son no comerciales; por eso se usa 2016. Natural Earth dibuja una versión de las
fronteras en disputa: si la frontera es el tema, avísalo en pantalla.

## Arquitectura

| Archivo | Qué hace |
|---|---|
| `servidor/mcp.mjs` | Conector MCP: las herramientas que usa Claude |
| `servidor/puente.mjs` | Servidor local: pasa órdenes al editor y guarda archivos en `salidas/` |
| `servidor/iniciar.mjs` | Arranca puente y editor y abre el navegador |
| `servidor/guia-de-direccion.md` | Reglas de dirección que lee Claude |
| `src/puente.ts` | Lado del editor: recibe y ejecuta órdenes |
| `src/proyecto.ts` | Modelo del proyecto (JSON) |
| `src/camara.ts` | Interpolación de cámara, curvas y vuelo |
| `src/estilos.ts` | Estilos de mapa (MapLibre) y paletas medidas |
| `src/capas.ts` | Proyecto → capas del mapa: fichas, frentes, zonas, columnas 3D |
| `src/overlay.ts` | Títulos, logo, grano, viñeta, profundidad de campo y etalonaje |
| `src/exportar.ts` | Render determinista y codificación MP4 (Mediabunny + WebCodecs) |
| `src/main.ts` | Interfaz del editor |

Regenerar datos: ver `scripts/preparar-datos.py`. Regenerar glifos: `scripts/generar-glifos.py <carpeta con TTF>`.
