# Codex y la prospección

## Integración disponible

| Opción | Resultado | Decisión |
| --- | --- | --- |
| Codex CLI | En Windows 11 se verificó `codex-cli 0.167.0`, estado de sesión ChatGPT y disponibilidad de `exec`, eventos JSONL y salida con JSON Schema. Una interpretación sintética concluyó en el entorno real | Usar el ejecutable instalado como intérprete opcional de filtros |
| Codex SDK | OpenAI publica `@openai/codex-sdk` para Node.js. El SDK integra el flujo programático del harness. Este repositorio usa la CLI y evita una dependencia adicional | Reconsiderar si se requieren hilos persistentes o streaming en la interfaz |
| Codex app-server | El comando y el transporte stdio están disponibles en la CLI. La sesión sintética ejecutada corresponde a `exec` | Evaluar para una integración persistente con ciclo completo de sesión y cancelación |
| Manual | El formulario y la API pueden aceptar filtros explícitos. La interpretación local reconoce unos patrones y tipos comerciales comunes | Alternativa predeterminada, sin consumo de IA |

[Modo no interactivo](https://learn.chatgpt.com/docs/non-interactive-mode) · [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) · [Codex como plataforma](https://developers.openai.com/blog/codex-as-a-platform) · [Codex en Windows](https://learn.chatgpt.com/docs/windows)

## Usar la sesión existente

Verificá el estado en la misma terminal que usás para el backend.

~~~powershell
codex --version
codex login status
~~~

En Windows, el proceso oficial puede aprovechar su propia sesión guardada de ChatGPT. Si el perfil no tiene sesión, ejecutá el flujo oficial de inicio de sesión para Codex. La app consulta únicamente el estado de la CLI y acepta sesión ChatGPT. Las llaves de API del entorno no se heredan. El proveedor queda disponible al iniciarlo explícitamente con `REAC_CODEX_ENABLED=1`. Si la CLI falla, informá el error y usá filtros manuales o la importación validada desde Orca.

El proveedor prefiere el binario instalado en `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe`. La copia anterior de WinGet encontrada en el PATH reportó 0.130.0 y rechazó el valor `default` de la configuración de usuario. La instalación preferida reportó 0.167.0 y `Logged in using ChatGPT`. Un turno sintético devolvió los filtros de Córdoba Capital, cantidad 4 y aplicación Reservas. Una prueba bajo el sandbox externo falló al abrir el turno. La comprobación real se ejecutó con autorización de la sesión usando el mismo código y su sandbox interno de solo lectura.

Si el lote termina con `unavailable`, verificá la versión del ejecutable. Para `not_authenticated`, iniciá sesión desde la CLI oficial. Para `usage_limit`, consultá el uso de tu plan y volvé a intentar cuando esté disponible o desactivá Codex y cargá filtros explícitos. Los límites de ChatGPT pueden variar por cuenta y tiempo. La aplicación omite las llaves de API al iniciar la CLI. [Documentación oficial de OpenAI](https://developers.openai.com/blog/codex-as-a-platform)

ChatGPT Plus da acceso a superficies de Codex compatibles y tiene límites de uso sujetos al plan, modelo, tamaño de tarea y cuenta. Una invocación real consume la cuota disponible. Revisá el consumo en el cliente oficial. La app no solicita ni compra créditos y no cambia a una cuenta de API ante un límite. La API facturada y el flujo OAuth de una app propia se administran por separado. [Precios y límites de Codex](https://learn.chatgpt.com/docs/pricing) · [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source)

## Alcance del intérprete

- El backend despacha una consulta de hasta 1500 caracteres, por stdin. La consulta llega como dato en JSON. No se envían fichas, páginas, direcciones, expedientes ni contenido de fuentes al intérprete. Evitá pegar datos privados en el campo de búsqueda.
- Se usa un directorio temporal ajeno al proyecto, sandbox de solo lectura, aprobación de comandos desactivada, ejecución efímera, configuración de usuario ignorada, MCP vacío y desactivación de herramientas de shell, web, apps, navegador, hooks, plugins, memorias y subagentes. Se admite la versión local verificada. Tras actualizar la CLI, probá de nuevo esta configuración antes de ampliar ese conjunto.
- El adaptador rechaza eventos de herramientas, exige finalización y valida de nuevo los filtros en el backend. El resultado tiene cantidad, región, ciudad, rubro y tipo de aplicación. Nunca concede permiso de escritura o auditoría. El catálogo y las importaciones son procesos posteriores con sus propias reglas.
- Una interpretación concurrente por proveedor, 45 segundos para el turno, cinco segundos para cada comprobación local y 128 KiB sobre stdout y stderr. La cancelación termina el proceso local. El uso ya consumido se rige por el proveedor.
- Errores distinguibles incluyen sesión ausente, cupo, timeout, cancelación y formato inválido. El adaptador devuelve códigos y mensajes breves. La salida interna de Codex no se incorpora al registro comercial.

[Configuración oficial de Codex](https://learn.chatgpt.com/docs/config-file/config-reference)

## Verificación ejecutada

- En el CLI Windows 0.167.0, la sesión guardada informó ChatGPT.
- Una consulta sintética pidió 7 empresas de turismo en Córdoba Capital con reservas. El proveedor devolvió esos cuatro filtros y una ciudad vacía en el formato requerido. El verificador de eventos aceptó el turno completo con las herramientas restringidas.
- El estado de sesión, el turno sintético y el esquema se comprobaron sin visitar empresas, tocar SQLite ni habilitar compras.
