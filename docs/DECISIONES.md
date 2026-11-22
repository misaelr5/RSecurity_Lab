# Decisiones

- **Reutilizar** React, Vite, Fastify, Zod, csv-parse y Playwright desde npm. Las versiones directas quedan fijadas y npm ci verifica la integridad del lockfile.
- **Integrar** node:sqlite (Node 24) y consultas preparadas. El esquema pequeño permite migraciones explícitas y evita un ORM o driver nativo adicional. La aplicación sirve el bundle y la API desde un solo origen de loopback.
- **Adaptar** los 18 encabezados de CSV de `reac-leads/src/domain.js` consultados en su rama main. El CSV del CRM conserva su contrato. El XLS/CSV seguro se entrega con fórmulas neutralizadas. Los prospectos originales permanecen en el sistema fuente.
- **Construir** flujo pasivo, registro de revisión, reportes y fixture único del proceso. El laboratorio valida una configuración sintética con un HEAD de destino fijo. La API carece de transporte a clientes. No se integran binarios, proveedores de red ni adaptadores ejecutables externos.
