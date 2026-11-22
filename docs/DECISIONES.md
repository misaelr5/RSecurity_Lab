# Decisiones de arquitectura

## Reutilizar React, Vite, Fastify, Zod y csv-parse

React y React DOM 19.3.1 (MIT) para la interfaz en TypeScript. Vite 8.3.8 (MIT) construye el bundle sin un servidor adicional. Fastify 5.12.8 (MIT) sirve API y archivos del build mediante rutas exactas. Zod 4.6.7 (MIT) valida DTO. csv-parse 7.0.3 (MIT) resuelve comillas, BOM y saltos de línea. Playwright 1.65.1 (Apache-2.0) conduce Chrome para el flujo E2E. TypeScript 5.9.3 (Apache-2.0) y ESLint 10.15.0 con typescript-eslint 8.73.0 (MIT) verifican código.

Versiones fijadas en los manifests. El lockfile registra integridad de paquetes del registro npm. La primera resolución incluyó nueve avisos. Se quitó el complemento de archivos estáticos y se actualizó el linter antes de continuar.

## Integrar SQLite de Node 24

Se eligió node:sqlite sobre un ORM o driver adicional. Esquema v1, transacciones síncronas, índices por relación, FK y consultas preparadas. La adopción se limita a Node 24 porque su módulo SQLite sigue en desarrollo activo. Los respaldos usan la API de SQLite y se restauran a un archivo nuevo. La base queda bajo data/ con permisos del usuario local.
[Documentación de SQLite en Node 24](https://nodejs.org/download/release/v24.14.0/docs/api/sqlite.html)

## Adaptar el intercambio de Reac Leads

Se verificó con lectura autenticada el contrato CSV de la rama main de misaelr5/reac-leads en src/domain.js y la protección reversible en src/data.js. Se preservan los 18 encabezados y las celdas originales reconocidas en SQLite. El CSV exportado combina los valores actuales con las columnas de CRM preservadas y neutraliza fórmulas y restituye teléfonos y apóstrofos literales en el intercambio con Reac Leads. El intercambio v1 en JSON corresponde a esta app y no incluye la base interna ni historia privada del CRM. Los duplicados se detectan por nombre y localidad normalizados. Una exclusión importada invalida aprobaciones previas y las fichas excluidas conservan su historial.

## Construir flujo pasivo, revisión y fixture

El proveedor manual y el de CSV solo procesan datos entregados por el operador. La prueba de laboratorio hace un HEAD a un servidor interno en un puerto de loopback elegido al iniciar. No toma objetivos del CRM. ScopePolicy evalúa modo y alcance antes del transporte. El cliente y la API de producción comparten origen. El log registra acciones e identificadores y el informe contiene evidencia estructurada, redactada y sin cuerpos HTTP.

El registro de autorizaciones guarda el alcance y una referencia a un documento verificado externamente por la persona operadora. Su aprobación documenta la revisión. El transporte disponible en el MVP es exclusivamente el fixture. Los informes revisados se vinculan a un hash del contenido y una edición devuelve el informe a borrador.

## Interfaz

El dashboard reúne cartera y distribución territorial en una superficie amplia. La navegación deja el laboratorio en su propia vista. Paleta local en azul pizarra (#11151c, #171c25, #1d2430, #26364c y #a9ccff) y texto Segoe UI. El layout adapta navegación, tabla y formularios sin fuentes ni dependencias de red.

[Fuentes oficiales evaluadas](FUENTES.md)
