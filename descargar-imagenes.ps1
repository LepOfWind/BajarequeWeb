# Descarga todas las imágenes de la tienda Shopify a static\img
# Uso (desde esta carpeta):  powershell -ExecutionPolicy Bypass -File .\descargar-imagenes.ps1
# Hazlo ANTES de cancelar Shopify: después las imágenes dejan de existir en su CDN.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$datos = Get-Content -Raw -Encoding UTF8 (Join-Path $raiz 'datos\tienda.json') | ConvertFrom-Json
$destino = Join-Path $raiz 'static\img'
New-Item -ItemType Directory -Force -Path $destino | Out-Null

$archivos = @()
$archivos += $datos.inicio.hero.imagenes
$archivos += $datos.inicio.categorias | ForEach-Object { $_.imagen }
$archivos += $datos.productos | ForEach-Object { $_.imagenes }
$archivos += $datos.articulos | ForEach-Object { $_.imagen }
foreach ($a in $datos.articulos) {
  [regex]::Matches($a.contenido, '\{\{img:([^}]+)\}\}') | ForEach-Object { $archivos += $_.Groups[1].Value }
}
$archivos = $archivos | Where-Object { $_ } | Sort-Object -Unique

$ok = 0; $fallos = 0
foreach ($f in $archivos) {
  if ($f.StartsWith('articles/')) { $url = $datos.cdn.articles + $f.Substring(9) } else { $url = $datos.cdn.files + $f }
  $nombre = Split-Path $f -Leaf
  $salida = Join-Path $destino $nombre
  if (Test-Path $salida) { $ok++; continue }
  try {
    Invoke-WebRequest -Uri "$($url)?width=1600" -OutFile $salida -UseBasicParsing
    Write-Host "  OK  $nombre"
    $ok++
  } catch {
    Write-Warning "Fallo $nombre : $($_.Exception.Message)"
    $fallos++
  }
}
Write-Host ""
Write-Host "Listo: $ok imagenes en static\img ($fallos fallos)."
Write-Host "Ahora corre:  node build.mjs   para regenerar el sitio usando las imagenes locales."
