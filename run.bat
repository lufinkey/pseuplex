@echo off
set NODE_ENV=production
cd %~dp0% || exit /b
call npm install || exit /b
call npm start -- --config=config/config.json
pause
