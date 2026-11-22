# Herramientas operativas

- Fixture HTTP incorporado en Node 24 para verificar presencia de encabezados de un destino interno fijo.
- npm audit para revisar avisos aplicables al lockfile del propio producto desde la terminal.
- Importación defensiva JSON v1 desde Auditorías > Resultados defensivos. Ver fixtures/resultados-defensivos-demo.json. El archivo es un resumen previamente redactado con el tipo de herramienta, versión, fecha, proyecto, identificadores de control, componente y referencia opcional suministrada por el operador. Se rechazan campos inesperados, rutas con navegación y archivos de más de 200 resultados.
- Los resultados entran pendientes. La revisión registra responsable y referencia de evidencia redactada. La corrección o aceptación de riesgo requiere confirmación previa. En el informe se separa la severidad sugerida del estado de revisión.
- No cargar fragmentos de código, valores de credenciales ni salidas crudas. Los identificadores CVE/CWE/GHSA cargados son referencias declaradas y requieren comprobación. Estos archivos no lanzan procesos ni peticiones.

[Evaluación de candidatos](INVESTIGACION_HERRAMIENTAS.md)
