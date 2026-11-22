# Modelo de datos

SQLite v2 usa tablas STRICT con UUID, padre relacional, clave de deduplicación cuando corresponde, datos JSON y fechas de creación y actualización.

| Grupo | Relación principal |
| --- | --- |
| Cartera | organizations contiene datos del prospecto. contacts y engagements están vinculados a la ficha |
| Fuentes públicas | public_sources pertenece a la organización. observations y public_assets dependen de la fuente |
| Comercial | outreach_drafts pertenece a la organización. pipeline_events pertenece a engagements |
| Autorizaciones | authorizations pertenece a engagements. scope_assets pertenece a authorizations. Los reemplazos guardan los UUID de ambas versiones |
| Resultados | audit_runs agrupa findings y evidence_refs. Las revisiones defensivas almacenan historial de decisiones |
| Trazabilidad | activity_log contiene acciones y referencias. report_reviews vincula aprobaciones al SHA-256 del contenido revisado |

La migración v1 → v2 agrega public_assets y pipeline_events. Antes de migrar un archivo crea una copia v1 con SQLite. Los respaldos v1 se pueden restaurar y migrar al arrancar. Los campos del CRM siguen su contrato CSV de 18 columnas. El JSON de fichas es un formato interno portable.
