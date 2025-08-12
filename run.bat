@echo off
cd %~dp0% || exit /b
call npm install || exit /b
call npm run build || exit /b
set NODE_ENV=production
call npm start -- --config=config/config.json
pause
