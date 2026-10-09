# Saca fotogramas de un vídeo de referencia para analizar su estilo de mapas.
# Uso (PowerShell):  .\scripts\fotogramas-referencia.ps1 -Video "C:\ruta\video.mp4" [-Cada 4] [-Desde 0] [-Hasta 0]
# Resultado: <video>_frames\f_0001.jpg… y <video>_frames.zip, listo para arrastrar al chat.
# f_0001 = segundo $Desde; cada fotograma siguiente suma $Cada segundos.
param(
  [Parameter(Mandatory = $true)][string]$Video,
  [double]$Cada = 4,
  [double]$Desde = 0,
  [double]$Hasta = 0,
  [int]$Ancho = 960
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Video)) { throw "No existe el vídeo: $Video" }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
$item = Get-Item $Video
$out = Join-Path $item.DirectoryName ($item.BaseName + '_frames')
New-Item -ItemType Directory -Force $out | Out-Null
$rango = @('-ss', "$Desde")
if ($Hasta -gt $Desde) { $rango += @('-to', "$Hasta") }
ffmpeg -hide_banner -loglevel error @rango -i $item.FullName -vf "fps=1/$Cada,scale=${Ancho}:-2" -q:v 4 (Join-Path $out 'f_%04d.jpg')
$zip = "$out.zip"
Compress-Archive -Path (Join-Path $out '*') -DestinationPath $zip -Force
"Listo: $((Get-ChildItem $out).Count) fotogramas (cada $Cada s desde $Desde s) en $zip"
