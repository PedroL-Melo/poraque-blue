@echo off
setlocal

echo === Compilando frontend ===
call npm --prefix "%~dp0app" run build
if errorlevel 1 exit /b 1

echo === Instalando dependencias PlatformIO ===
pio pkg install
if errorlevel 1 exit /b 1

echo === Enviando arquivos LittleFS ===
pio run -t uploadfs
if errorlevel 1 exit /b 1

echo === Enviando firmware ===
pio run -t upload
if errorlevel 1 exit /b 1

echo === Iniciando monitor serial ===
pio device monitor

endlocal