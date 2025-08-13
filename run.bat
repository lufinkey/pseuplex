@echo off
(
	cd %~dp0% || goto :exit
	call npm install || goto :exit
	call npm run build || goto :exit
	set NODE_ENV=production
	call npm start -- --config=config/config.json || goto :exit
)
pause

:exit
exit /b
