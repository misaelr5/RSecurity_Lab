# Herramientas evaluadas

Lectura de metadatos y releases de los repositorios oficiales con GitHub CLI en Windows, el 22 de noviembre de 2026. Los repositorios figuraban activos y sin archivar. Los tags son referencias observadas y el MVP no instala sus binarios.

| Proyecto | Licencia | Release observado | Decisión para el MVP |
| --- | --- | --- | --- |
| Subfinder | MIT | [v2.17.0](https://github.com/projectdiscovery/subfinder/releases/tag/v2.17.0) | Fuentes manuales y CSV cubren la primera versión sin proveedor externo |
| WappalyzerGo | MIT | [v0.3.11](https://github.com/projectdiscovery/wappalyzergo/releases/tag/v0.3.11) | Biblioteca Go. Se admite registrar tecnología con fuente aportada |
| MDN HTTP Observatory | MPL-2.0 | [v1.7.2](https://github.com/mdn/mdn-http-observatory/releases/tag/v1.7.2) | Referencia de configuración HTTP. Chequeo local propio de presencia |
| HTTPx de ProjectDiscovery | MIT | [v1.12.0](https://github.com/projectdiscovery/httpx/releases/tag/v1.12.0) | Fuera del MVP |
| Nuclei | MIT | [v3.11.1](https://github.com/projectdiscovery/nuclei/releases/tag/v3.11.1) | Fuera del MVP |
| OWASP ZAP | Apache-2.0 | [v2.17.0](https://github.com/zaproxy/zaproxy/releases/tag/v2.17.0) | Fuera del MVP |
| OSV-Scanner | Apache-2.0 | [v2.7.1](https://github.com/google/osv-scanner/releases/tag/v2.7.1) | Candidato para revisión de dependencias propias. Esta versión usa npm audit sobre su lockfile |
| Semgrep CE | LGPL-2.1 | [v1.186.0](https://github.com/semgrep/semgrep/releases/tag/v1.186.0) | Candidato para análisis defensivo de código propio |
| Gitleaks | MIT | [v8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) | Candidato para prevención de secretos en repos propios |
| OWASP Juice Shop | MIT | [v20.4.0](https://github.com/juice-shop/juice-shop/releases/tag/v20.4.0) | Se eligió un fixture pequeño con HTTP de Node. Docker no figura en PATH |
| Trivy | Apache-2.0 | [v0.76.2](https://github.com/aquasecurity/trivy/releases/tag/v0.76.2) | Fuera del MVP |

Los ejecutables, checksums, flags y requisitos por plataforma se revisarán en el contexto de una incorporación concreta. Esta fase solo usa paquetes npm fijados y herramientas ya presentes. La identidad y licencia de cada herramienta se tomaron de los metadatos oficiales.
