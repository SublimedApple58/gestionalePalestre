@echo off
REM ─── reglo-access — installazione come Servizio Windows (auto-start + restart) ───
REM Richiede NSSM (https://nssm.cc/download). Metti nssm.exe in questa cartella
REM oppure nel PATH. Esegui questo .bat come AMMINISTRATORE.
REM
REM Prerequisiti gia' fatti:
REM   - Python installato (py -3)
REM   - pip install -r requirements.txt
REM   - file .env compilato in questa cartella

setlocal
set SERVICE_NAME=RegloAccess
set DIR=%~dp0
set DIR=%DIR:~0,-1%

REM Trova python
for /f "delims=" %%p in ('where pythonw 2^>nul') do set PYW=%%p
if "%PYW%"=="" (
  echo ERRORE: pythonw non trovato nel PATH. Installa Python e riprova.
  exit /b 1
)

REM Trova nssm
set NSSM=nssm.exe
if exist "%DIR%\nssm.exe" set NSSM=%DIR%\nssm.exe

echo Installo il servizio %SERVICE_NAME%...
"%NSSM%" install %SERVICE_NAME% "%PYW%" "%DIR%\service.py"
"%NSSM%" set %SERVICE_NAME% AppDirectory "%DIR%"
"%NSSM%" set %SERVICE_NAME% Start SERVICE_AUTO_START
"%NSSM%" set %SERVICE_NAME% AppStdout "%DIR%\service-stdout.log"
"%NSSM%" set %SERVICE_NAME% AppStderr "%DIR%\service-stderr.log"
REM Restart automatico su crash
"%NSSM%" set %SERVICE_NAME% AppExit Default Restart
"%NSSM%" set %SERVICE_NAME% AppRestartDelay 5000

echo Avvio il servizio...
"%NSSM%" start %SERVICE_NAME%

echo.
echo Fatto. Stato: "%NSSM%" status %SERVICE_NAME%
echo Log: %DIR%\reglo-access.log
endlocal
