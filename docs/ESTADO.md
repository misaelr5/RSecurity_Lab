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
