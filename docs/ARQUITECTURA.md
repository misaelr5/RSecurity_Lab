# Arquitectura

- apps/web contiene rutas de cartera, evidencia pública, autorizaciones, fixture, informes y ajustes. El build se sirve desde el mismo origen que la API.
- apps/api registra módulos de cartera, activos, pipeline, auditoría, informes y respaldos. Los cambios son transaccionales y los DTO se validan con Zod.
- packages/core define contratos, importación, estados y ScopePolicy. packages/reporting renderiza documentos y protege las salidas.
- SQLite v2 agrega public_assets con FK a public_sources y pipeline_events con FK a engagements. La migración preserva los registros previos y crea una copia v1 antes de aplicar los cambios sobre un archivo existente.
- Los activos públicos pasan por captura manual con proveniencia. Esos datos nunca se usan como entrada al transporte del laboratorio.
- El pipeline registra hitos comerciales declarados. Las conversiones se calculan solo entre fichas con ambos hitos explícitamente registrados.
