@echo off
setlocal
(
	cd "%~dp0" || goto :exit
	call npm install || goto :exit
	call npm run build || goto :exit
	set NODE_ENV=production
	call npm start -- --config=config/config.json --log-watched-paths || goto :exit
)
endlocal

:exit
pause
exit /b
