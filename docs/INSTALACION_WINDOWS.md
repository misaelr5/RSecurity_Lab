# Instalación en Windows

1. Usá Node 24.14 o posterior dentro de la serie 24 y npm. Para probar el navegador se usa Chrome instalado.
2. Desde PowerShell, entrá en la raíz del monorepo y ejecutá npm ci --ignore-scripts.
3. Ejecutá npm run build y npm start. Abrí http://127.0.0.1:4310/.
4. REAC_PORT elige el puerto local. REAC_DATABASE elige un nombre .sqlite sin directorios bajo data/. Podés definir ambas en .env.
5. Para la demo usá REAC_PORT=4320 y REAC_DATABASE=reac-demo.sqlite. Ejecutá node scripts/seed-demo.ts desde otra terminal.

Para actualizar, dejá una copia íntegra, verificá el lockfile, ejecutá las pruebas y reiniciá la instancia. Si el puerto está ocupado, verificá el proceso que lo escucha o elegí un puerto libre. Si Vite todavía no generó el bundle, ejecutá npm run build.
