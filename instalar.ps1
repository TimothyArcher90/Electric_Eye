# Instalador de Electric Eye para Windows.
# Hace todo lo que necesita la primera vez:
#   1. Instala Node.js si falta (con winget).
#   2. Instala las dependencias del proyecto.
#   3. Conecta Electric Eye a la app de escritorio de Claude y a Claude Code.
#   4. Crea un acceso directo en el escritorio y arranca el editor.
# Uso: clic derecho > "Ejecutar con PowerShell", o desde PowerShell: .\instalar.ps1

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$mcp = Join-Path $raiz 'servidor\mcp.mjs'
Set-Location $raiz

function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Recargar-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

# 1. Node.js
Paso 'Comprobando Node.js'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js no está instalado. Instalando la versión LTS con winget...'
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  Recargar-Path
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'No se pudo instalar Node.js. Instálalo a mano desde https://nodejs.org (versión LTS) y vuelve a ejecutar este script.'
  }
}
Write-Host "Node.js $(node --version)"

# 2. Dependencias
Paso 'Instalando dependencias (la primera vez tarda unos minutos)'
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install falló. Revisa la conexión a internet y vuelve a ejecutar.' }

# 3a. App de escritorio de Claude
Paso 'Conectando Electric Eye con la app de escritorio de Claude'
$dirClaude = Join-Path $env:APPDATA 'Claude'
$config = Join-Path $dirClaude 'claude_desktop_config.json'
New-Item -ItemType Directory -Force $dirClaude | Out-Null
$datos = [ordered]@{}
if (Test-Path $config) {
  Copy-Item $config "$config.respaldo" -Force
  $texto = Get-Content $config -Raw
  if ($texto.Trim()) {
    $leido = $texto | ConvertFrom-Json
    foreach ($p in $leido.PSObject.Properties) { $datos[$p.Name] = $p.Value }
  }
}
$servidores = [ordered]@{}
if ($datos.Contains('mcpServers') -and $datos['mcpServers']) {
  foreach ($p in $datos['mcpServers'].PSObject.Properties) { $servidores[$p.Name] = $p.Value }
}
$servidores['electric-eye'] = [ordered]@{ command = 'node'; args = @($mcp) }
$datos['mcpServers'] = $servidores
# Sin BOM: la app de Claude lee el JSON con un parser estricto.
$json = $datos | ConvertTo-Json -Depth 20
[IO.File]::WriteAllText($config, $json, (New-Object Text.UTF8Encoding $false))
Write-Host "Listo: $config (copia de seguridad en claude_desktop_config.json.respaldo)"

# 3b. Claude Code (si está instalado)
if (Get-Command claude -ErrorAction SilentlyContinue) {
  Paso 'Conectando Electric Eye con Claude Code'
  try { claude mcp remove electric-eye --scope user *> $null } catch { }
  try { claude mcp add electric-eye --scope user -- node "$mcp" } catch { Write-Host 'Aviso: no se pudo registrar en Claude Code; la app de escritorio sí quedó conectada.' }
}

# 4. Acceso directo y arranque
Paso 'Creando acceso directo en el escritorio'
$escritorio = [Environment]::GetFolderPath('Desktop')
$atajo = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $escritorio 'Electric Eye.lnk'))
$atajo.TargetPath = Join-Path $raiz 'Iniciar Electric Eye.bat'
$atajo.WorkingDirectory = $raiz
$atajo.Save()

Paso 'Arrancando Electric Eye'
Start-Process -FilePath (Join-Path $raiz 'Iniciar Electric Eye.bat') -WorkingDirectory $raiz

Write-Host "`nTodo listo." -ForegroundColor Green
Write-Host '1) El editor se abre en el navegador: http://127.0.0.1:5174 (deja esa pestaña abierta).'
Write-Host '2) Cierra la app de escritorio de Claude por completo (también desde la bandeja del sistema) y vuelve a abrirla.'
Write-Host '3) En un chat nuevo pide, por ejemplo: "Haz un mapa de 15 segundos del estrecho de Ormuz en formato Reel".'
Write-Host 'Para volver a abrirlo otro día: doble clic en "Electric Eye" en el escritorio.'
