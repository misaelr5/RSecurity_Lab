# Revisión inicial del ciclo de prospección

Se aplicó la skill review-agent al árbol local, incluidos los archivos aún sin seguimiento, y se contrastaron los hallazgos con las llamadas y los tests.

- **P1 · Proteger la API operativa.** apps/api/src/app.ts verificaba origen y Host, pero carecía de identidad y permitía que cualquier proceso local leyera o modificara una base de operación.
- **P1 · Aislar la custodia.** apps/api/src/storage-paths.ts resolvía todas las bases bajo el repositorio. Un .gitignore protege contra inclusiones accidentales, pero no establece permisos ni una política de conservación.
- **P2 · Preservar la decisión de contacto al transferir.** El CSV de cartera recuperaba mensaje original y omitía borradores revisados dentro del Lab. El flujo de intercambio necesita autorización editorial y una previsualización antes de crear el archivo.
- **P2 · Clasificar aplicaciones con fuente.** La búsqueda no tenía campo de tipo de aplicación. La señal comercial debe guardarse con referencia verificable y distinguirse de tecnología detectada o vulnerabilidades.
