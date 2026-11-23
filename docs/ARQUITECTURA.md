# Arquitectura

- apps/web contiene rutas de cartera, evidencia pública, autorizaciones, fixture, informes y ajustes. El build se sirve desde el mismo origen que la API.
- apps/api registra módulos de cartera, activos, pipeline, auditoría, informes y respaldos. Los cambios son transaccionales y los DTO se validan con Zod.
- packages/core define contratos, importación, estados y ScopePolicy. packages/reporting renderiza documentos y protege las salidas.
- SQLite v2 agrega public_assets con FK a public_sources y pipeline_events con FK a engagements. La migración preserva los registros previos y crea una copia v1 antes de aplicar los cambios sobre un archivo existente.
- Los activos públicos pasan por captura manual con proveniencia. Esos datos nunca se usan como entrada al transporte del laboratorio.
- El pipeline registra hitos comerciales declarados. Las conversiones se calculan solo entre fichas con ambos hitos explícitamente registrados.

## Prospección V3

- La web y `scripts/research.ps1` comparten una API Fastify de lotes. La CLI usa un token de 15 minutos que acepta creación de lotes y lectura de sus resúmenes. La sesión web permite revisar fichas y ejecutar las acciones del operador.
- `AIProvider` interpreta únicamente los filtros de la solicitud. `research.ts` combina esos filtros con los campos explícitos y lee un catálogo local elegido al arrancar o un lote JSON adjunto. Node ejecuta el intérprete oficial con parámetros fijos y valida sus respuestas antes de que la API evalúe los registros.
- SQLite v3 agrega `research_jobs` y `research_candidates` mediante una migración aditiva con respaldo. Los resultados se graban en una transacción, incluyendo organización, fuente, observación, borrador y referencia al lote. Cada `requestId` reintenta el mismo trabajo si coincide la huella de la solicitud. Al reiniciar, un trabajo inconcluso se marca parcial. Se permite una investigación activa por proceso.
- El historial deriva de los lotes e hitos persistidos en la cartera. El mapa construye grupos a partir de coordenadas locales con fuente. El dashboard operativo lee métricas de esos registros. La ruta `#preview` usa una cohorte ficticia para validar el rediseño mientras se revisa.

## V4

La migración agrega `research_inputs`, `saved_searches`, `campaigns`, `campaign_memberships` y `enrichment_proposals`. La copia operativa usa el backup nativo de SQLite y las escrituras de cada lote y revisión son transaccionales. `app_runtime` evita que dos procesos operen la misma base y recuperen la misma ejecución. El patrón comercial de campaña con membresías permite atribuir los hitos por fecha de incorporación a cada campaña. [SQLite Online Backup](https://sqlite.org/backup.html) · [Campañas de EspoCRM](https://docs.espocrm.com/user-guide/campaigns/)
