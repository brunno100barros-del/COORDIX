# COORDIX Desktop · testa o instalador gerado (máquina de integração contínua).
# Instala em modo silencioso, confere o executável e o atalho do menu Iniciar, desinstala e confere a remoção.
$ErrorActionPreference = "Stop"
$setup = Get-ChildItem "out/make/squirrel.windows/x64/*.exe" | Select-Object -First 1
if (-not $setup) { throw "Instalador não encontrado em out/make/squirrel.windows/x64" }
$base = Join-Path $env:LOCALAPPDATA "coordix"
$menu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$r = [ordered]@{ instalador = $setup.Name; tamanho_mb = [math]::Round($setup.Length / 1MB, 1) }

Start-Process -FilePath $setup.FullName -ArgumentList "--silent" -Wait
$t0 = Get-Date
while (-not (Test-Path (Join-Path $base "COORDIX.exe")) -and ((Get-Date) - $t0).TotalSeconds -lt 120) { Start-Sleep 2 }
Start-Sleep 10
$r.executavel_instalado = Test-Path (Join-Path $base "COORDIX.exe")
$r.pasta_versao = (Get-ChildItem $base -Directory -Filter "app-*" | Select-Object -ExpandProperty Name) -join ","
$atalhos = Get-ChildItem $menu -Recurse -Filter "COORDIX*.lnk" -ErrorAction SilentlyContinue
$r.atalho_menu_iniciar = ($atalhos | ForEach-Object { $_.FullName.Replace($menu, "Menu Iniciar") }) -join ","

Get-Process -Name "COORDIX" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2
Start-Process -FilePath (Join-Path $base "Update.exe") -ArgumentList "--uninstall", "-s" -Wait
# o Squirrel remove as pastas em segundo plano depois de encerrar o aplicativo; espera até 2 minutos
$t0 = Get-Date
do {
  Start-Sleep 5
  Get-Process -Name "COORDIX" -ErrorAction SilentlyContinue | Stop-Process -Force
  $resta = Get-ChildItem $base -Directory -Filter "app-*" -ErrorAction SilentlyContinue
} while ($resta -and ((Get-Date) - $t0).TotalSeconds -lt 120)
$r.atalho_removido = -not (Get-ChildItem $menu -Recurse -Filter "COORDIX*.lnk" -ErrorAction SilentlyContinue)
$r.aplicativo_removido = -not $resta
# marcador ".dead": o Squirrel registrou a remoção e apaga o que estiver preso na próxima execução do Update.exe
$r.remocao_registrada = Test-Path (Join-Path $base ".dead")
$r.restante = ($resta | ForEach-Object { $_.Name }) -join ","

$r | ConvertTo-Json | Set-Content -Encoding utf8 "desktop-instalador.json"
$r | Format-List
if (-not ($r.executavel_instalado -and $r.atalho_menu_iniciar -and $r.atalho_removido -and ($r.aplicativo_removido -or $r.remocao_registrada))) { throw "Teste do instalador falhou" }
Write-Host "Instalação, atalho no menu Iniciar e desinstalação conferidos."
