@echo off
REM ─── reglo-access — rimozione del Servizio Windows ───
REM Esegui come AMMINISTRATORE.
setlocal
set SERVICE_NAME=RegloAccess
set DIR=%~dp0
set NSSM=nssm.exe
if exist "%DIR%nssm.exe" set NSSM=%DIR%nssm.exe

"%NSSM%" stop %SERVICE_NAME%
"%NSSM%" remove %SERVICE_NAME% confirm
echo Servizio %SERVICE_NAME% rimosso.
endlocal
