# Bitácora · 22 de noviembre de 2026

## Fase 0 · inspección

- Windows build 26100, PowerShell 7.7.0, Node 24.15.0, npm 11.12.1, Git 2.54.0, gh 2.92.0, Codex 0.167.0, Orca 1.4.271, Python 3.14.4, Go 1.26.4 y WSL predeterminado v2. Docker ausente del PATH.
- El directorio del kit carecía de Git. Se creó reac-security-lab/ y se inicializó localmente. Durante el trabajo aparecieron concurrentemente los commits a3482da y 03991c8 y el origin/main de GitHub. Se dejó intacta la configuración Git y se avisó al usuario. Los pasos de esta sesión usaron Git para inicialización y lectura, sin commit, push ni publicación.
- Contrato CSV de Reac Leads leído con GitHub CLI y sin escribir en ese repositorio. Fuentes oficiales y versiones en FUENTES.md.
- npm install inicial informó nueve avisos. Se retiró el complemento de estáticos y se actualizó el linter. La resolución final y npm ci --ignore-scripts auditaron 182 paquetes y devolvieron cero vulnerabilidades conocidas.

## Fase 1 · prospección pasiva

- Dashboard, formularios, CRUD, filtros, SQLite, evidencias aportadas manualmente y observaciones revisables. Import/export CSV del CRM y JSON v1 nativo. Protección antifórmula en CSV y contra HTML inyectado en informes.
- Revisiones explícitas para borradores, bloqueo de contacto con exclusiones y seguimiento. Los informes vuelven a borrador si cambia el contenido evaluado.
- Dos pruebas detectaron saltos de línea mezclados en el CSV sintético. Se declaró el conjunto de delimitadores aceptados. El primer E2E observó que el filtro sin selección heredaba el estado Nuevo por defecto. Se separó la validación de filtros y se cubrió con una regresión de API.

## Fase 2 · laboratorio

- Registro documental con ventana, alcance y aprobación/revocación manual. ScopePolicy permite únicamente el HEAD al fixture fijo en loopback. El servidor rechaza el modo pasivo, hosts DNS, remotos y métodos y rutas por fuera del fixture. Se comprueba la ventana de vigencia al evaluar un alcance registrado.
- Corrida local con tope de 2 segundos, 1 operación por segundo, 1 concurrente, cancelación, ejecución sin redirects y evidencia mínima con SHA-256. El reporte describe presencia o ausencia de encabezados con severidad informativa.
- La demo de Windows inició con npm start en una sesión local tras el rechazo por política del intento de lanzamiento de fondo. La base dedicada sirve en 127.0.0.1:4320 y contiene 3 prospectos ficticios, 1 observación revisada, 1 borrador y 1 corrida completada. Chrome confirmó y capturó el dashboard y el informe en data/.

## Validación final

| Control | Resultado |
| --- | --- |
| npm ci --ignore-scripts | PASS · 177 paquetes instalados, 182 auditados |
| npm run lint | PASS |
| npm run typecheck | PASS |
| npm test | PASS · 11 pruebas, 0 fallas, 0 omitidas |
| npm run build | PASS · bundle Vite |
| npm run smoke | PASS · servidor real en loopback, SQLite, bundle, fixture e informe |
| npm run test:e2e | PASS · Chrome, 1 recorrido, importación, aprobación, corrida, exportación y viewport de 390 px |
| npm audit | PASS · 0 vulnerabilidades conocidas en el lockfile |
| Respaldo y restauración | PASS · SQLite verificado en archivo nuevo: 3 prospectos, 1 corrida, 1 borrador |
| CSV interoperable con los módulos de Reac Leads | PASS · se ejecutaron importCSV y toCSV de la rama main en una carpeta temporal con tres filas sintéticas y fetch desactivado. Se recuperaron teléfono +54 y una nota con apóstrofo literal |
| Docker y herramientas externas | OMITIDO · el fixture propio cubre el alcance técnico de esta fase |

## Límites y paso siguiente

Las autorizaciones guardan una referencia documental declarada por el operador. Persistencia y copias se apoyan en permisos del usuario de Windows. Para incorporar datos reales corresponde definir custodia, retención y acceso. La próxima validación es la ida y vuelta desde la interfaz de una instancia descartable de Reac Leads y el proceso de exclusión de contacto. Ver ROADMAP.md.

## Segunda iteración · ciclos del prompt maestro

- Línea base: 11 pruebas y 1 E2E. Informe en AUDITORIA_INICIAL.md. El diff previo se conservó. Orca confirmó un workspace de carpeta compartido y la implementación se concentró en una sola sesión para preservar el árbol local. Las pruebas independientes se ejecutaron en paralelo.
- Se instaló review-agent desde la muestra oficial de OpenAI, en un commit fijado. Se revisaron sus dos archivos y se registraron hashes y fuente en INVESTIGACION_HERRAMIENTAS.md.
- Se verificaron metadatos y releases de 11 herramientas. Sin binarios de seguridad nuevos. Análisis técnico por fixture fijo y por importación defensiva de resúmenes JSON previamente redactados.
- Las autorizaciones registran SHA-256, historial de reemplazos y revisión ligada a la versión. Se excluyen aprobaciones previas sin huella. Informes y borradores rechazan revisiones hechas sobre contenido que cambió.
- SQLite v2 agrega activos públicos e historial comercial. Respaldo previo y verificación del esquema. Copias aisladas por base y restauración exclusiva. Verificado desde demo migrada y copia separada.
- Se agregó captura manual de activos públicos trazables, coincidencias por identidad, regiones ampliables, prioridad comercial ponderada, pipeline y borrador de WhatsApp. La evidencia no pasa al transporte.
- Se incorporó API v1 con alias del MVP, revisión de resultados inertes e impresión del informe a PDF desde el navegador. El reporte de una operación bloqueada expresa que se detuvo antes del transporte.

### Resultados de verificación

| Comando o comprobación | Resultado |
| --- | --- |
| npm run lint | PASS |
| npm run build (incluye typecheck) | PASS |
| node --test --experimental-test-coverage tests/*.test.ts | PASS, 15/15, 95.00% de líneas, 86.48% de ramas en archivos medidos |
| npm run smoke | PASS |
| npm run test:e2e | PASS, 2/2 en Chrome. Incluye importación defensiva, revisión y PDF |
| npm audit | PASS, 0 vulnerabilidades conocidas |
| Restore desde la demo v2 | PASS, 3 prospectos, 1 activo y 1 evento de pipeline en base separada |
| git diff --check | PASS, árbol sin commit ni push de esta sesión |

### Entregas parciales y pendientes

El laboratorio conserva la comprobación HTTP de destino fijo. Los resultados SAST, SCA y de secretos se admiten únicamente como resúmenes inertes en formato v1. No se incorporaron ejecutores de DAST, ni adaptadores nativos o proveedores OSINT de red. El piloto con empresas reales sigue pendiente. La demo contiene exclusivamente datos ficticios. Antes de uso con datos reales quedan pendientes autenticación, acceso y retención operativa y el proveedor pasivo. El perfil sigue siendo de un operador en una máquina de confianza.

No se modificó Reac Leads, no se enviaron comunicaciones y no se publicaron cambios.

## Ciclo de prospección comercial

- Se aplicó review-agent al árbol existente. Los hallazgos se registraron en AUDITORIA_PROSPECCION.md. Tres subagentes aportaron fichas verificadas, matriz de proveedores y pulido visual. Los cambios se integraron sin sobrescribir el trabajo previo.
- Perfil privado Windows, verificador scrypt, recuperación DPAPI, sesión única mediante autorización de mismo origen, límites de intentos y cierre de sesión. ACL verificada para propietario, SYSTEM y administradores. El cifrado del volumen quedó sin comprobar. Política de revisión de fuentes a 180 días y copias a 90 días. La eliminación requiere decisión del operador.
- Directorios de Villa Dolores, Nono, Turismo de Córdoba e Innovab integrados como navegación manual. Lote JSON v1 con vista previa y confirmación. No se configuraron proveedores pagos ni automatización sobre terceros.
- Piloto independiente en 127.0.0.1:4324 con diez empresas: dos de Villa Dolores, cuatro de Traslasierra y cuatro de Córdoba Capital. Se comprobaron diez observaciones revisadas y diez borradores pendientes, con información empresarial y canales ya publicados. Mercado Pago se registró como mención de la fuente de TraslaMarket.
- CSV de traslado probado contra el importador original de Reac Leads de forma local y descartable. Diez aceptadas en la primera importación y diez duplicadas en la segunda. El piloto conserva los borradores pendientes fuera del CSV.
- Verificación final: npm run lint, npm test (17/17), npm run build (TypeScript y Vite), npm run smoke y npm run test:e2e (3/3 Chrome). npm audit: cero vulnerabilidades conocidas. Restauración de piloto: diez fichas y diez borradores. Chrome autenticado confirmó el piloto final. El código y las pruebas están en el árbol local.

El dossier, el CSV y las dos capturas del piloto se guardan en la carpeta privada. Las fichas de la demo permanecen independientes. No se enviaron comunicaciones, no se escanearon terceros y no se hicieron cambios remotos.

## V3 · 22 de noviembre de 2026

- El traspaso encontró la integración detenida con los módulos de Codex, investigación, historial, mapa y vista previa escritos. Se conectaron a la web y la API local. El árbol pasó de `4606da6` a `ed6ae28` por actividad concurrente. Se conservó el nuevo HEAD.
- Respaldo de código previo verificado con 103 entradas y SHA-256 `51f60ca6704ee94de5c586552b00e600ef4ba92ad7d3e1eb0a73de9ccd5c7df7`. Se verificó la huella de la copia SQLite v2 y se restauró a `reac-prospeccion-v3.sqlite` en el perfil privado. El arranque aplicó la migración v3. La base anterior se conservó.
- Dos agentes colaboraron con el cotejo de fuentes y la revisión comercial. Se aplicó `review-agent` desde la muestra oficial fijada en `INVESTIGACION_HERRAMIENTAS.md`. Se corrigió el contraste de encabezados en claro, la admisión de catálogo en demo, la pérdida de una revisión anterior cuando el lote alcanza su cupo y el consumo de una consulta de IA sin fuentes.
- La CLI 0.130.0 del PATH rechazó la configuración. El ejecutable oficial 0.167.0 de Windows reconoció la sesión de ChatGPT y respondió una consulta sintética con JSON. El lote operativo `e139f603-6e14-4ad5-b21d-db0ed59de15b` se ejecutó mediante `scripts/research.ps1 -UseCodex` e incorporó 14 fichas con evidencia corporativa. La repetición detectó 14 duplicadas y creó cero.
- Se verificaron 24 fichas en cartera, 24 empresas con observación revisada y 24 borradores pendientes. Las 14 nuevas tienen coordenadas aproximadas por localidad. El CSV y GeoJSON de cartera contienen 24 registros cada uno. El resumen del lote y los archivos se guardaron en la carpeta privada. El dashboard nuevo se mantiene en `#preview` con datos ficticios y capturas de Chrome en ambos temas.
- El dashboard admite el catálogo y archivos revisados. El descubrimiento de fuentes nuevas se hace desde Orca con consulta comercial pasiva. Sin proveedor web pago, envíos, escaneos de terceros ni acciones de publicación. La puesta en servicio local de V3 usa `127.0.0.1:4326` con autenticación.
- Validación final: ESLint, TypeScript, build, smoke HTTP y SQLite, 21/21 pruebas de Node y 5/5 recorridos Chrome. El primer E2E completo detectó dos enlaces que coincidían con «Prospectos» y se corrigió el selector de la prueba. El servidor efímero de Playwright requirió cierre manual en Windows; el proceso de pruebas devolvió código 0. Se reinició V3 con la versión final y se confirmó que exige autenticación. `git diff --check` pasó. Los cambios de esta sesión quedaron en el árbol local.

## V4 · 22 de noviembre de 2026

- Antes de editar se restauró el respaldo privado `reac-backup-93632a5c-84ae-4a95-a2b3-831cb755a34d.sqlite` con SHA-256 `83197e53702a34e590c86f8c6b3ad181d185c6732b5e91c95752801ae4442bbd`. La línea base pasó lint, TypeScript, build, smoke, 21 pruebas Node y 5 recorridos de Chrome.
- La operación V4 migró una copia separada. Se validaron `integrity_check` y `foreign_key_check` en V3 y V4. Ambas conservan 24 empresas, 24 borradores y 24 hitos comerciales. La fixture de migración comprueba preservación de datos y respaldos desde v1.
- P0 agrega reprospección sensible al historial y las exclusiones, actualización por lote, búsquedas guardadas, control de cancelación/reanudación, decisiones versionadas y exportación comercial reversible. P1 agrega campañas, enriquecimiento con aprobación por campo, prioridad explicable, nuevos hitos y mapa por campaña/región. P2 agrega simulación y métricas sobre resultados observados. Se aplicó la muestra oficial fijada de `review-agent`, con regresiones para cupo, aprobación obsoleta y replay incremental de un lote.
- En `127.0.0.1:4327`, `research.ps1` completó un turno de Codex real (`d894c2fe-a4f0-4c92-9123-68def4cb8eff`). El catálogo tenía 14 coincidencias conocidas, las 14 se clasificaron como duplicadas y la cartera no creció. La actualización `290e5d8d-5a0d-4e82-8ec5-be12a0133c1a` preparó cinco candidatas sin aplicar cambios a las fichas. La CLI de historial exportó nueve empresas de Córdoba Capital. Una instancia aislada reimportó nueve en la primera corrida y cero en la segunda.
- Pasaron `npm run lint`, TypeScript, `npm run build`, `npm run smoke`, 32/32 pruebas de reglas, API e integración (`npm test`) y 7/7 recorridos Playwright en Chrome (`npm run test:e2e`). Se generaron `campanas-v4-light.png` y `campanas-v4-dark.png` con una campaña claramente ficticia. La primera pasada V4 de Chrome detectó un selector de objetivo ambiguo en el test, que se corrigió. `git diff --check` pasó.
- La instancia protegida sigue activa con el primer bundle V4. El entorno bloqueó el comando de reinicio. El build final validado agrega filtros múltiples desde el formulario, el contador explícito de propuestas enviadas y el estado de descarte en enriquecimiento. Se cargará en el próximo inicio. El HEAD avanzó por actividad concurrente a `a714077` y se conservó. Las acciones de esta sesión fueron locales.

## Rediseño del dashboard y mapa de calles

- El dashboard operativo ahora muestra pendientes y seguimientos, evolución semanal con tabla accesible, presencia por región y resultados. Las cifras provienen de los endpoints de la cartera. Se agrupó la navegación y se verificó que el ancho móvil de 390 px conserve el contenido dentro del viewport.
- Leaflet 1.9.4 integra calles de OpenStreetMap y mantiene la geometría local de IDECOR como respaldo. Se permite seleccionar y agrupar puntos, ajustar la vista, acercar, arrastrar y confirmar coordenadas con una fuente HTTPS. Los 24 puntos que trajo la copia de V4 siguen clasificados como aproximados. El historial JSON y GeoJSON conservan el nivel de precisión.
- Vista previa autenticada en `127.0.0.1:4328`, con respaldo SQLite verificado y restaurado como `reac-mapa-preview.sqlite`. La instancia de cartera en 4327 permanece independiente. El navegador verificó 16 teselas de calles reales, el build final y cero errores de página. Se guardaron capturas de escritorio, mapa y móvil.
- Lint, TypeScript, build y smoke pasaron. Node pasó 33 pruebas y Chrome pasó 8 recorridos, incluida una caída simulada del proveedor de calles. El paquete de cartografía se divide del bundle inicial.

## Reanudación de Orca · 23 de noviembre de 2026

- Se comprobó en modo lectura la integridad y las relaciones de V3 y V4. Cada copia conserva 24 fichas y 24 borradores. Coincidió el SHA-256 de la copia v2 registrada antes de la primera modificación. El lote real V3 incorporó 14 fichas mediante Codex y su repetición detectó 14 duplicadas. No se repitió la carga.
- V4 retomó en 127.0.0.1:4327 con el catálogo privado y Codex CLI 0.167.0 autenticado mediante ChatGPT. La consulta autenticada devolvió 24 fichas y 24 geometrías. La aplicación conserva temas, mapa, historial y exportaciones. La nueva composición queda para aprobación en #preview.
- Se hallaron diez fichas precedentes con fecha de verificación posterior al reloj del entorno. Se conserva el dato histórico original. La vista comercial omite las fuentes futuras al calcular verificación, Configuración muestra las diez fichas para revisión y la importación de descubrimiento rechaza fechas futuras. El panel comercial registra 14 fichas verificadas temporalmente. Para actualizar una ficha histórica, volver a corroborar la fecha y registrar evidencia con la fecha efectiva.
- Pasaron lint, typecheck, build, smoke, 34/34 pruebas unitarias y de integración y 8/8 recorridos de Chrome. La primera ejecución E2E de la recuperación perdió un archivo de traza al cerrar un contexto. El reintento en una ruta aislada pasó. npm audit devolvió cero avisos y git diff --check pasó.
- Se regeneraron dashboard-v3-claro.png y dashboard-v3-oscuro.png en data/v3-review con datos ficticios. El descubrimiento web independiente del catálogo sigue a cargo de Orca. El dashboard automatiza el procesamiento de fuentes aportadas. No se hicieron cambios remotos, auditorías de terceros ni envíos.

## Pulido del dashboard y del mapa · 23 de noviembre de 2026

- La vista previa autenticada de 4328 abre la candidata pendiente y el borrador exacto por ID. Los lotes tienen enlaces a la ejecución y distinguen cifras actuales y cifras al cierre. El gráfico semanal se muestra desde la segunda semana con actividad.
- Los filtros secundarios del mapa se despliegan a pedido. Elegir una empresa abre su detalle, indica la precisión y centra la localidad o la dirección documentada. La traza de Chrome permitió corregir un error de Leaflet al retirar el fondo de calles y cambiar la ubicación. La API había guardado la operación. Al retirar primero la capa, Leaflet libera sus escuchas antes del siguiente cambio de zoom.
- El respaldo privado de la vista previa se restauró y verificó en reac-pulido-d1333502.sqlite. Pasaron lint, TypeScript, build, smoke HTTP, 34 pruebas de Node y 9 recorridos E2E. Se usó REAC_E2E_PORT=4386 para aislar la suite. Con la copia del piloto se verificaron además cuatro combinaciones de tema y tamaño (1440 y 390 px), cinco candidatas, 24 borradores, calles cargadas y navegación con teclado hasta ficha, mapa y mensaje. Las ocho capturas se guardaron en la carpeta privada de la conversación.
