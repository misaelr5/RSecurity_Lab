# Autorizaciones documentales

1. Vinculá el registro a la organización y cargá titular, firmante, referencia documental, ventana con zona horaria, activo, métodos, límites, prohibiciones y emergencia.
2. Calculá la huella sobre el archivo firmado que custodiás fuera del proyecto. En PowerShell: Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\ruta\documento-firmado.pdf'. Cargá su campo Hash.
3. Abrí la versión registrada. La aprobación identifica el contenido de esa versión y exige atestación humana sobre titularidad y alcance.
4. Para cambiar documento o alcance elegí Crear nueva versión. Al guardar, la previa queda revocada y se conservan sus datos y quién la revisó. La nueva empieza pendiente.
5. Las aprobaciones del MVP que carecen de huella quedan en «Requiere nueva versión». La API las excluye de las vigentes.

La huella identifica los bytes del documento que revisó el operador. La verificación de firma, facultades y custodia corresponde al procedimiento del estudio. El registro documental está separado del ejecutor, cuyo único destino es el fixture interno.
