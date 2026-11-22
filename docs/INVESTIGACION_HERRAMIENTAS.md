# Investigación de herramientas

Los datos de mantenimiento, licencia declarada y release se comprobaron en los repositorios oficiales. Los once figuraban sin archivar. La presencia de un release o binario Windows acredita distribución, no validación local. Las licencias indicadas corresponden al proyecto principal. Para distribución o uso de reglas, proveedores y bases externas, revisar los términos del recurso concreto.

| Candidato y versión | Licencia, entorno y forma de integración | Decisión y riesgo |
| --- | --- | --- |
| [Subfinder v2.17.0](https://github.com/projectdiscovery/subfinder/releases/tag/v2.17.0) | MIT. Binarios Windows, CLI Go. Las fuentes externas pueden requerir claves y tienen cuotas | Captura manual primero. Un resultado pasivo aporta una pista de titularidad, no confirmación |
| [WappalyzerGo v0.3.11](https://github.com/projectdiscovery/wappalyzergo/releases/tag/v0.3.11) | MIT. Biblioteca Go, sin binario Windows de esa versión. Requiere otro runtime o un wrapper | Registrar tecnología solo con una fuente atribuible. Las huellas pueden estar desactualizadas |
| [MDN HTTP Observatory v1.7.2](https://github.com/mdn/mdn-http-observatory/releases/tag/v1.7.2) | MPL-2.0. Servicio de evaluación HTTP. Sin binario Windows de esa versión | Criterio de referencia para el fixture. Consultar el servicio implicaría una evaluación del destino |
| [HTTPx v1.12.0](https://github.com/projectdiscovery/httpx/releases/tag/v1.12.0) | MIT. Binarios Windows, CLI Go | Integración activa fuera de alcance. El producto solo usa un destino sintético fijo |
| [OSV-Scanner v2.7.1](https://github.com/google/osv-scanner/releases/tag/v2.7.1) | Apache-2.0. Binarios Windows, JSON y procedencia SLSA. [Modo offline y caché](https://google.github.io/osv-scanner/usage/offline-mode/) | Candidato para SCA defensivo, con examen de esquema y del flujo de datos. Por ahora npm audit para este lockfile |
| [Semgrep CE v1.186.0](https://github.com/semgrep/semgrep/releases/tag/v1.186.0) | LGPL-2.1. La [edición CE admite Windows](https://semgrep.dev/blog/2025/semgrep-community-edition-fall-release-2025). CLI y reglas con licencias separadas | Candidato para revisar código propio. Los resultados pueden incluir fragmentos privados |
| [Gitleaks v8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) | MIT. Binarios Windows y CLI. El costo depende del historial y tamaño del repositorio | Candidato para controles internos. Conservar solo identificadores y referencias redactadas |
| [Trivy v0.76.2](https://github.com/aquasecurity/trivy/releases/tag/v0.76.2) | Apache-2.0. Binarios Windows, CLI y bases locales o descargables | Diferido por amplitud y consumo de disco. Seleccionar módulos y verificar procedencia antes de instalar |
| [Nuclei v3.11.1](https://github.com/projectdiscovery/nuclei/releases/tag/v3.11.1) | MIT. Binarios Windows, CLI. Las plantillas se distribuyen aparte y su comportamiento es variable | Integración activa fuera de alcance |
| [ZAP v2.17.0](https://github.com/zaproxy/zaproxy/releases/tag/v2.17.0) | Apache-2.0. Windows requiere [Java 17 o superior](https://www.zaproxy.org/pdf/ZAPGettingStartedGuide-2.17.pdf). Interfaz, proxy y API | Integración activa fuera de alcance |
| [Juice Shop v20.4.0](https://github.com/juice-shop/juice-shop/releases/tag/v20.4.0) | MIT. App de entrenamiento Node/contenedor, sin exponer a terceros | Fixture integrado cubre la validación de configuración pedida con menor costo operativo |

No se midieron RAM ni CPU de herramientas sin instalar. La selección actual reutiliza el laboratorio fijo y agrega un contrato inerte para trasladar resultados defensivos redactados. Esto evita ampliar los permisos del proceso o incorporar binarios a la aplicación.

## Skill de revisión instalada

review-agent, muestra oficial del repositorio openai/codex, fijada al commit 83a418783707f4446aa832b2799d6cacfef75011. Se inspeccionaron SKILL.md y agents/openai.yaml. El directorio contiene esos dos archivos. La invocación implícita está deshabilitada en sus metadatos. Usala explícitamente al cerrar un ciclo.

- SKILL.md SHA-256: 07079efd0dc76f05fade424e5dfb048dce1de2df7626e1a4f56292a4f3f92228
- agents/openai.yaml SHA-256: 4d867a46d15e36ac880176484aae160f59855340c6059b2ea6ab9fbc9af084de

[Fuente fijada](https://github.com/openai/codex/tree/83a418783707f4446aa832b2799d6cacfef75011/codex-rs/skills/src/assets/samples/review-agent)
