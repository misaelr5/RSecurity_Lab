# Historial comercial y traslado

**Exportaciones** permite elegir ciudad, región, rubro, estado, campaña, lote, período y fichas archivadas. La campaña identifica la iniciativa comercial. El lote identifica una investigación concreta y conserva sus resultados. Las fechas son inclusivas y se aplican a la incorporación de cada empresa o resultado, en UTC.

| Formato | Contenido |
| --- | --- |
| JSON de historial | Versión 1 reimportable con UUID y fechas originales, fichas, resultados, campañas, membresías, referencias públicas e hitos comerciales documentados |
| CSV | Tabla comercial para consulta con IDs, procedencia, último hito y prioridad. Las celdas se escapan para hojas de cálculo |
| CSV Reac Leads | Proyección del lote filtrado sobre los encabezados del CRM y los canales permitidos para traslado |
| GeoJSON | Empresas y candidatas sin ficha vinculada con ubicación de localidad, fuente y precisión. Una ubicación desconocida conserva geometría nula |

## Reimportar una selección

En **Exportaciones**, elegí un JSON generado por **Historial reimportable** y confirmá su procedencia. La operación conserva la identidad de registros nuevos y restaura sus relaciones dentro de una sola transacción. La respuesta indica altas, fichas conservadas, conflictos, candidatas, campañas, lotes y exclusiones revisadas incorporadas. Si repetís el mismo archivo, el resultado registra cero altas. Si la ficha ya existe, se conserva su estado, evidencia, relaciones y exclusión. Una exclusión que discrepa con una ficha activa queda como conflicto para resolución manual. Las exclusiones revisadas de identidad conservan su vigencia en prospección.

El archivo conserva el dominio y la localidad de identidades anteriores cuando están registrados y pasan la validación. Quita consultas y fragmentos de URLs y minimiza contactos personales, notas, cuerpos de borradores, texto íntegro de fuentes y documentos de auditoría. La revisión pública importada conserva fecha y confianza. Los hitos técnicos conservan etapa e instante como referencia documental, fuera de las etapas que habilitan acciones. Usá la copia SQLite para restaurar mensajes, notas privadas, autorizaciones y el detalle completo de la evidencia.

Los lotes restaurados muestran los candidatos incluidos en la selección. Conservan el estado y el objetivo originales. Si importás dos selecciones del mismo lote, los resultados faltantes se agregan por UUID cuando coinciden la procedencia y el objetivo. Los resultados presentes mantienen sus decisiones, y una discrepancia de procedencia cancela la transacción. Para trasladar más de 900 KB, exportá selecciones por separado o usá una copia SQLite. El JSON de referencia de V3 y el CSV siguen las rutas de importación anteriores.

## API local

`GET /api/v1/history/export` acepta `format=json|csv|crm|geojson`, `city`, `region`, `industry`, `status`, `campaign`, `lot`, `q`, `from`, `to` y `archived=all|included|excluded`. `campaign=none` o `lot=none` seleccionan registros sin esa relación. `archived=included` selecciona fichas archivadas.

`POST /api/v1/history/import` recibe un objeto `{ "archive": { ... }, "acknowledge": true }` con el JSON de historial. Las rutas requieren la sesión local del operador.
