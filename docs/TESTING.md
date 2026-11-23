# Validación automatizada

Ejecutá npm run lint, npm run typecheck, npm test, npm run build, npm run smoke, npm run test:e2e y npm audit. npm run build ejecuta TypeScript antes de Vite. Para cuantificar solo la cobertura de unitarias/API: node --test --experimental-test-coverage tests/*.test.ts.

Los tests usan SQLite en memoria o directorios temporales. El smoke levanta la aplicación HTTP y el fixture en loopback. Playwright usa Chrome del sistema y una instancia descartable en 127.0.0.1:4331.

## Casos críticos

- Host/origen ajeno, cuerpo de formulario, pasivo con solicitud técnica, remoto, DNS, ruta/método fuera de alcance, autorización incompleta, vencida o reemplazada.
- Límite de tasa, cancelación, rechazo de redirects y evidencia en el fixture fijo.
- CSV y JSON portables, fórmula reversible, HTML escapado, redacción, exclusiones, fuentes de otra organización y coincidencias de identidad.
- Aprobaciones obsoletas de informe y borrador, revisión de resultados inertes, estado solo confirmado por el operador.
- Migración automatizada de v1 a v3, respaldo previo restaurable, verificación de la restauración de la base v2 del piloto y rechazo de sobrescritura. El E2E genera un PDF desde Chrome con la vista imprimible.
- V3 cubre 20 fichas ficticias, lote cotejado, idempotencia, deduplicación, opt-out, fuentes vencidas, contenido externo tratado como datos, revisión manual, cancelación y errores simulados de autenticación y cuota. La prueba de sesión comprueba el alcance del token de CLI.
- Chrome verifica el cambio de tema y su persistencia, el uso del sistema a 390 px, el lote desde el dashboard, la ficha, los marcadores y las descargas CSV y GeoJSON. `REAC_CAPTURE_DIR` habilita capturas de `#preview` con datos ficticios.

[Bitácora de ejecuciones](ESTADO.md)

## V4

La línea base se validó con 21 pruebas de Node y 5 recorridos de Chrome antes de modificar. V4 agrega regresiones sobre archivo y rechazo, historial que cruza lotes, revisión obsoleta, continuidad del cupo, reintentos, cancelación, simulación local, guardado y cambio de filtros, enriquecimiento, acceso de CLI y preservación de contacto y etapas. El archivo JSON se prueba al reimportar dos selecciones diferentes de un mismo lote. `REAC_V4_CAPTURE_DIR` habilita las capturas de campañas con datos ficticios en ambos temas.
