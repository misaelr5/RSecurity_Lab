# Reac Security Lab

Herramienta local de Reac Studio para registrar prospectos, documentar evidencia pública, revisar mensajes e informes y verificar la configuración de un fixture HTTP.

## Iniciar en PowerShell

Requiere Node 24.14 o superior dentro de la serie 24 y npm. Para los tests E2E se usa Google Chrome instalado.

~~~powershell
Set-Location 'D:\Reac_Security_Lab_Kit\reac-security-lab'
npm ci --ignore-scripts
npm run build
npm start
~~~

Abrí http://127.0.0.1:4310/. La primera ejecución crea `data/reac.sqlite`. El comando `npm run dev` vuelve a generar el bundle antes de iniciar. Para elegir otro puerto o archivo, copiá `.env.example` a `.env` y ajustá sus valores. El servidor y el fixture escuchan en loopback.

### Demo con datos ficticios

En una terminal:

~~~powershell
$env:REAC_PORT = '4320'
$env:REAC_DATABASE = 'reac-demo.sqlite'
npm start
~~~

En una segunda terminal desde el repo:

~~~powershell
node scripts/seed-demo.ts
~~~

Abrí http://127.0.0.1:4320/. Si preferís probar el importador, usá `fixtures/prospectos-demo.csv` desde una base vacía. El menú Prospectos intercambia CSV con Reac Leads y JSON v1 entre instalaciones de Security Lab. Las empresas y las fuentes `.example` de la demo son ficticias.

## Recorrido

| Vista | Ruta | Flujo |
| --- | --- | --- |
| Dashboard | `/#dashboard` | Conteos derivados de SQLite y actividad |
| Prospectos | `/#prospects` | Alta, edición, eliminación con restricciones, filtros, CSV/JSON y borradores comerciales |
| Evidencia pública | `/#evidence` | Fuentes, observaciones y activos OSINT públicos registrados de forma manual |
| Auditorías | `/#audits` | Autorizaciones versionadas, fixture, cancelación y revisión defensiva de archivos |
| Informes | `/#reports` | Acceso desde fichas y corridas, revisión, descarga MD/HTML/CSV e impresión a PDF |
| Configuración | `/#settings` | Salud SQLite, límites y copias |

Los borradores requieren aprobación manual. Para registrar una autorización revisada, el operador verifica la titularidad y el documento externo y carga su referencia. La API registra la decisión y mantiene la ejecución restringida al fixture fijo. Los resultados del laboratorio son observaciones informativas de presencia de encabezados.

## Respaldos

Creá una copia desde Configuración. Cada base escribe en `data/backups/<nombre-de-la-base>/`. Para restaurar, mantené `REAC_DATABASE` apuntando a la base que originó la copia y elegí un nombre distinto para el resultado.

~~~powershell
npm run restore -- reac-backup-UUID.sqlite restaurada.sqlite
~~~

Para las copias de la versión anterior ubicadas directamente en `data/backups/`, agregá `--legacy` al comando. El restaurador usa copia exclusiva, verifica esquema e integridad y mantiene la base de origen. Las copias contienen los datos de la base. El directorio `data/` está excluido de Git.

## Validación

~~~powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run smoke
npm run test:e2e
npm audit
~~~

La API pública local de la app usa `/api/v1/`. Las rutas `/api/` se mantienen como alias para los scripts existentes.

El E2E usa Chrome y SQLite en memoria en `127.0.0.1:4331`. El smoke reserva un puerto local. La bitácora documenta resultados y pendientes.

## Estructura

~~~text
reac-security-lab/
├── apps/api        Fastify, migración SQLite y API HTTP
├── apps/web        React, TypeScript y Vite
├── packages/core   Validación, CSV, clasificación y ScopePolicy
├── packages/reporting  Renderizado seguro MD/HTML/CSV
├── fixtures        CSV sintético y servidor HTTP del laboratorio
├── scripts         Smoke, demo, restauración y servidor E2E
├── tests           Node test runner y Playwright
├── data            Bases privadas y copias
└── docs            Decisiones, bitácora y roadmap
~~~

[Bitácora](docs/ESTADO.md) · [Ciclos](docs/CICLOS_IMPLEMENTACION.md) · [Operación](docs/OPERACION.md) · [Pruebas](docs/TESTING.md) · [Roadmap](docs/ROADMAP.md)
