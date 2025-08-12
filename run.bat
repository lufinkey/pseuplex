@echo off
set NODE_ENV=production
cd %~dp0% || exit /b
call npm run build || exit /b
call npm start -- --config=config/config.json
pause
