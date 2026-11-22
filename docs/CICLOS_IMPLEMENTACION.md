# Ciclos de implementación

Tomar un ciclo por vez. Antes de editar, leer el alcance y el diff. Después de implementar, revisar el cambio contra la evidencia, ejecutar la puerta del ciclo y registrar resultado en ESTADO.md. La siguiente instrucción de trabajo se deriva de los resultados, no de un calendario.

| Ciclo | Fases del plan | Instrucción de trabajo | Criterio de salida |
| --- | --- | --- | --- |
| 1. Línea base | 1 y 14 | Inspeccionar archivos y SQLite. Ejecutar pruebas, build y audit. Registrar hallazgos reproducibles | Auditoría inicial y pruebas reales |
| 2. Confianza de datos | 3, 6, 10, 13 y 14 | Vincular las revisiones al contenido y al documento. Revisar separación y recuperación de bases | Cambios obsoletos rechazados, evidencia antigua preservada, restore comprobado |
| 3. Herramientas | 2, 6 y 7 | Verificar fuentes oficiales. Elegir componentes defensivos compatibles con la aplicación. Mantener el fixture aislado | Matriz con instalación, compatibilidad y decisión |
| 4. Cartera y datos públicos | 4, 5, 9 y 11 | Implementar activos pasivos con fuente, fecha, confianza, estado e historial. Validar exclusiones y deduplicación | Validaciones y regresiones sobre datos ficticios |
| 5. Informes y operación | 8, 10, 12, 13 y 16 | Consolidar hallazgos informativos y vista de trabajo. Mantener operación y pruebas reproducibles | Revisión humana y exportaciones consistentes |
| 6. Piloto | 15 | Validar hasta diez empresas con navegación ordinaria y fuentes publicadas, cuando los módulos estén listos | Datos atribuibles y borradores en revisión |

Para UI, conservar la identidad existente y verificar un estado real en el navegador. Para cambios significativos, usar review-agent como revisión de lectura antes del cierre. Evitar hallazgos especulativos y documentación duplicada. Las integraciones de escaneo activo quedan fuera del alcance implementable. Los controles defensivos, la revisión manual y el procesamiento inerte mantienen una vía útil para el producto.
