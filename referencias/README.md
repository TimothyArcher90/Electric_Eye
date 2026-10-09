# Copiar el estilo de mapas de una referencia

Proceso fijo para pasar de "quiero mapas como este vídeo" a un estilo cargable en el portal.
Nada se estima a ojo: cada valor sale de un fotograma con su timestamp.

## 1. Fotogramas

Si el vídeo se puede descargar en el entorno, se usa la skill `watch` directamente.
Si no (YouTube bloqueado, archivo en tu PC), en PowerShell:

```powershell
.\scripts\fotogramas-referencia.ps1 -Video "$env:USERPROFILE\Downloads\<video>.mp4" -Cada 4
# Tramo concreto, más denso:
.\scripts\fotogramas-referencia.ps1 -Video "<video>.mp4" -Cada 1 -Desde 75 -Hasta 180
```

Arrastra el `.zip` resultante al chat.

## 2. Ficha técnica (prompt)

Para Claude Code en tu PC, con la skill `watch`:

```
Usa la skill watch sobre este vídeo local: <ruta>. --detail balanced --resolution 1024.
Céntrate en los tramos con mapas (--start/--end) y luego haz un barrido general.
Quiero una ficha técnica de los mapas, con timestamps, que incluya:
1) Tipo de mapa: satélite, relieve sombreado, vectorial plano o globo 3D.
2) Paleta exacta en hex: mar, tierra, montañas, fronteras, resaltado de países, rutas.
3) Cámara: zoom, inclinación, giro, duración y curva de velocidad de cada movimiento.
4) Rótulos: tipografía, mayúsculas, tamaño, halo o caja, y cómo aparecen.
5) Rutas, flechas, pines y zonas: grosor, si son discontinuas, cómo se animan.
6) Texturas: grano, viñeta, papel, sombras.
7) Herramienta probable (Google Earth Studio, GEOlayers, Blender…) y en qué te basas.
8) Tabla "cómo replicarlo" con parámetros listos para un editor de mapas.
No inventes nada que no se vea en los fotogramas; marca las suposiciones como tales.
Guarda la ficha en ficha-mapas.md.
```

## 3. Ficha → preset

La ficha se traduce a un JSON como `preset-ejemplo.json`:

| Campo | De dónde sale en la ficha |
|---|---|
| `base` | Tipo de mapa: `realista` (relieve con color por altitud), `geopolitico`, `documental`, `satelite`, `noche`, `minimal`. |
| `paleta` | Punto 2. Roles: `espacio`, `oceano`, `tierra`, `frontera`, `costa`, `rio`, `lago`, `etiquetaPais`, `haloPais`, `ciudad`, `ciudadTexto`, `haloCiudad`, `mar`, `sombra`, `luz`, `intensidadRelieve` (0–1), `acento`. |
| `rampaAltitud` | Colores de montaña por altura, `[metros, hex]`, solo para `realista`. |
| `rotulos` | Punto 4: `mayusculas`, `espaciado` (em), `escala`. |
| `opciones` | Punto 6 y tipo: `globo`, `relieve`, `terreno3d`, `grano`, `vineta`, `colorearPaises`… |

La cámara (punto 3) no va en el preset: se usa como guía para los keyframes (curva `suave`/`entrada`/`salida`, `vuelo`, inclinación).

## 4. Cargar y comparar

En el portal: **Estilo → Importar estilo…** y elige el JSON. Saca un PNG del mismo encuadre que un
fotograma de la referencia y compáralos lado a lado. Ajusta el JSON hasta que coincidan.
