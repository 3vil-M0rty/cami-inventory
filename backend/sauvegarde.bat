@echo off
rem Double-clic : sauvegarde complete de la base dans Documents\Sauvegardes-CAMI (garde les 10 dernieres)
cd /d "%~dp0"
node backup-db.js --keep=10
pause
