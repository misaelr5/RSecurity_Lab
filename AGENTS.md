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
