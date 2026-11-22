# Validación automatizada

Ejecutá npm run lint, npm run typecheck, npm test, npm run build, npm run smoke, npm run test:e2e y npm audit. npm run build ejecuta TypeScript antes de Vite. Para cuantificar solo la cobertura de unitarias/API: node --test --experimental-test-coverage tests/*.test.ts.

Los tests usan SQLite en memoria o directorios temporales. El smoke levanta la aplicación HTTP y el fixture en loopback. Playwright usa Chrome del sistema y una instancia descartable en 127.0.0.1:4331.

## Casos críticos

- Host/origen ajeno, cuerpo de formulario, pasivo con solicitud técnica, remoto, DNS, ruta/método fuera de alcance, autorización incompleta, vencida o reemplazada.
- Límite de tasa, cancelación, rechazo de redirects y evidencia en el fixture fijo.
- CSV y JSON portables, fórmula reversible, HTML escapado, redacción, exclusiones, fuentes de otra organización y coincidencias de identidad.
- Aprobaciones obsoletas de informe y borrador, revisión de resultados inertes, estado solo confirmado por el operador.
- Migración sobre un archivo v1, respaldo previo restaurable, copia v2 y rechazo de overwrite. El E2E genera un PDF desde Chrome con la vista imprimible.

[Bitácora de ejecuciones](ESTADO.md)
