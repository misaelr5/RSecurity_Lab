# Auditoría inicial de Reac Security Lab

El MVP está operativo. La primera prioridad es asegurar que el operador apruebe exactamente lo que revisó y que los datos de una instancia queden aislados en sus respaldos.

## Línea base revalidada

- Windows, Node 24, Fastify, React/Vite y SQLite nativo. Los cuatro workspaces tienen responsabilidades identificables. Se conservó el árbol local con cambios de la entrega anterior.
- SQLite v1 usa tablas estrictas con relaciones padre/hijo, columnas JSON, claves únicas, consultas preparadas y transacciones. Las listas de cartera recorren registros en memoria antes de paginar. No hay medición de carga que justifique introducir ahora otro motor.
- Servidor y fixture en loopback. Host y origen se validan en el servidor. El navegador recibe CSP, no hay CORS permisivo y el laboratorio tiene destino fijo, tiempo máximo, un solo trabajo y pruebas de bloqueo.
- PASS: lint, 11 pruebas automáticas, typecheck dentro del build, build Vite, smoke sobre HTTP y 1 E2E Chrome. Dependencias: npm audit devolvió cero avisos. La cobertura se examinó por casos. La línea base no emitía informe numérico de cobertura.
- Las pruebas verifican creación e integridad de copia SQLite. Se amplía la verificación para la selección de copia y la restauración sin sobrescritura.

## Hallazgos y prioridad

| ID | Prioridad | Evidencia | Decisión |
| --- | --- | --- | --- |
| A01 | Alta | El POST de revisión calcula el hash vigente, aunque el navegador puede mostrar una versión previa. Ver apps/api/src/reports.ts | Requerir el hash mostrado y rechazar revisiones obsoletas |
| A02 | Alta | Una autorización se aprueba con una referencia textual y un nombre declarado. Ver apps/api/src/audits.ts | Registrar SHA-256 declarado del documento, fijar la versión revisada y conservar versiones reemplazadas |
| A03 | Alta | La configuración inicia instancias con bases distintas, pero usa un directorio global de respaldos. Ver apps/api/src/start.ts y scripts/restore.ts | Separar carpetas por base, con acceso explícito a copias anteriores |
| A04 | Media | La deduplicación usa solo nombre/localidad. Ver packages/core/src/index.ts y apps/api/src/portfolio.ts | Señalar identidades compartidas y conservar originales. No fusionar automáticamente |
| A05 | Media | Los permisos del usuario Windows son el perímetro de acceso. No hay identidad autenticada ni custodia documental integrada | Operación monousuario en Windows. Evaluar sesiones y almacenamiento cifrado antes de compartir el servicio |
| A06 | Media | Sin activos OSINT tipados, proveedor de búsqueda, historial comercial estructurado ni integración de hallazgos externos | Entregar primero registro pasivo, evidencia trazable y pipeline. Usar importación inerte para resultados defensivos |
| A07 | Baja | El seguimiento usa enum del CRM y hay campos de prospección repetidos entre organizaciones, contactos y engagements | Conservar compatibilidad, ampliar mediante rutas y modelos con responsabilidades claras |
