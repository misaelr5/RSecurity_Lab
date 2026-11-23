# Reglas del agente para Reac Security Lab

Aplican al agente Codex y a subagentes dentro de este proyecto.

1. Prioridad: protección de terceros, seguridad del usuario, trazabilidad, mantenibilidad y funcionalidad demostrada.
2. Antes de editar, inspeccionar archivos existentes. No modificar `misaelr5/reac-leads` durante la primera implementación ni borrar bases/archivos de prospectos.
3. No ejecutar análisis activo ni automatizaciones sobre infraestructuras de terceros. Prospección = OSINT y procesamiento de fuentes públicas permitido por sus términos.
4. Solo analizar técnicamente `127.0.0.1`/fixtures en `LAB_LOCAL`, o activos de `AUDITORIA_AUTORIZADA` que hayan pasado `ScopePolicy` con aprobación humana verificable. Deny-by-default.
5. Ejecutar herramientas con `spawn`/`execFile` y arrays, jamás concatenar comandos del usuario para shell. Rate-limit, timeout, size limits, cancelación y redacción de secretos.
6. Clasificar los resultados con niveles de verificación; no inventar vulnerabilidades, versiones, CVE, clientes, contactos o métricas.
7. Toda instalación/release debe provenir de repositorios y documentación oficial, con versión, licencia, checksum cuando disponible, y registro de decisión.
8. Mantener pruebas negativas sobre bloqueos fuera de alcance, SSRF, redirects, DNS, expiración, opt-out, CSV injection y HTML injection.
9. Interfaz local por defecto, backend escuchando exclusivamente en `127.0.0.1`; no introducir credenciales compartidas ni exposición WAN.
10. Sin deploy, envío de emails, cambios en sistemas ajenos, pagos ni acciones irreversibles sin autorización explícita del humano.
11. Registrar en `docs/ESTADO.md` cada avance, sus pruebas reales, errores y próximos pasos.
12. Si una tarea tiene riesgo o ambigüedad de autorización, elegir una alternativa local/sintética y continuar con el resto del producto.
13. Trabajar un ciclo a la vez según `docs/CICLOS_IMPLEMENTACION.md`. Antes de cerrar, revisar el diff contra los criterios de aceptación y registrar las pruebas realmente ejecutadas.
14. Para una solicitud comercial desde Orca, usá `scripts/research.ps1` contra la instancia local. Si requiere fuentes nuevas, cotejá los datos del negocio en fuentes públicas permitidas y procesá un lote JSON mediante la API de investigación. Confirmá únicamente lo que pudiste verificar. Guardá los lotes fuera de Git. El turno de Codex en el dashboard interpreta filtros y usa el catálogo privado configurado. Ver `docs/PROSPECCION_AUTOMATICA.md`.
15. En V4, usá `scripts/research.ps1 -Mode update` para preparar actualizaciones con evidencia y `scripts/history.ps1` para exportar mediante la API. Conservá IDs, exclusiones e historial. El archivo JSON comercial sigue la política de minimización. Una copia SQLite privada conserva el estado operativo completo.
