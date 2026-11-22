# Operación del bloque 1 en staging Windows

La instalación, etiquetas del runner y restricciones del entorno están en el
[manual del bloque 2](../ep2/bloque-2-staging.md#4-preparar-el-despliegue-desde-github-al-windows-del-compañero).
Mantener Docker Desktop en modo Linux, el equipo encendido y PowerShell 7.2+
disponible para el runner. La aplicación de staging se sirve en loopback.
Coordinar con el propietario del repositorio el runner dedicado y el entorno
habita3d-local. Usar una cuenta ficticia para el recorrido de la demo.

## Activar y comprobar CD

| Configuración GitHub | Función |
| --- | --- |
| Variable LOCAL_STAGING_ENABLED | Habilita el despliegue automático cuando es true. |
| Variables STAGING_STATE_DIRECTORY y STAGING_FRONTEND_PORT | Estado y copias protegidas fuera del checkout, y puerto local. |
| Secrets STAGING_DATABASE_PASSWORD y STAGING_MATERIALS_API_TOKEN | Credenciales de PostgreSQL y de los servicios internos, en el entorno habita3d-local. |
| Variable STAGING_MATERIALS_SCHEDULE_ENABLED | Activa las tres franjas de captura en el único host designado. |
| Variable STAGING_API_ALLOWED_ORIGINS | Orígenes exactos del cliente cuando llama desde otra plataforma. Lista separada por comas. Vacía para la web de mismo origen. |

CI tiene sus propios datos sintéticos y termina antes de CD. El workflow de
despliegue verifica una CI exitosa de push para el commit actual de main.
El runner aplica Terraform, conserva un respaldo antes de migrar una base
existente y ejecuta la comprobación del commit desplegado.

En Windows, repetir la comprobación de solo lectura y guardar un informe local.
El valor de ExpectedVersion debe coincidir con la SHA desplegada.
ReadinessWarningMs ajusta el umbral de advertencia para la latencia de disponibilidad.
El comando devuelve un error si una comprobación requerida falla.

~~~powershell
./scripts/verify-local.ps1 -BaseUrl http://127.0.0.1:18080 -ExpectedVersion $sha -PassThru | ConvertTo-Json -Depth 4
~~~

El informe contiene disponibilidad, conteo de publicaciones, latencia y un
identificador de solicitud para correlacionar con los logs, además del estado de
la última captura. El diagnóstico GET /api/health/recommendations
ejecuta una entrada sin candidatos por NestJS y FastAPI. La prueba completa
usa una cuenta ficticia y el catálogo real de staging.

## Verificar respaldo y recuperación

Ensayar la restauración con el respaldo generado y la imagen que lo produjo.
El siguiente script usa un contenedor separado sin red, sin puertos publicados
y sin montar volúmenes de staging. Comprueba las tablas restauradas y devuelve
sus conteos. La ruta del respaldo y la etiqueta de imagen corresponden a
archivos y valores del entorno de operación.

~~~powershell
./scripts/verify-postgres-backup.ps1 -BackupPath $rutaRespaldo -Image "habita3d/postgres:$sha"
~~~

Para ensayar rollback de la aplicación, identificar el commit previo sano
en previous-successful-commit.txt y revisar compatibilidad de esquema.
Preparar y revisar una reversión en su propia rama, ejecutar CI y desplegar
la reversión desde main. Conservar la evidencia de versión, salud y recorrido
posterior. Si una migración es incompatible, probar la restauración en una
base nueva antes de decidir cómo recuperar los datos del entorno. Las copias
y el estado Terraform se conservan en almacenamiento protegido.

## Preparar datos y evaluación de la demo

Realizar una [captura acotada](../ep2/bloque-2-backend.md#coordinación-de-capturas)
desde el host designado. Guardar ejecución, procedencia, conteos de válidos,
excluidos y duplicados, fechas de última comprobación y limitaciones de
disponibilidad. Las horas de captura son 08:00, 12:00 y 16:00 en America/Santiago.
Abrir el catálogo o una recomendación consulta datos existentes.

Para comparar el orden base y el recomendado, crear dos o tres casos con
presupuestos y preferencias de prueba. El siguiente comando lee un proyecto
existente con la sesión ficticia, compara ambas listas sobre los mismos precios
por caso y guarda un informe de costos, cantidades, ajuste y razones.
Obtener la sesión fuera de la salida publicada y conservarla solo en el
ambiente del proceso.

~~~powershell
python scripts/suggestion_evaluation.py --base-url http://127.0.0.1:18080 --case $caso1 --case $caso2 |
  Set-Content -Encoding utf8 evaluacion-staging.json
~~~

Cada caso tiene formato ID_PROYECTO:UUID_HABITACIÓN. Configurar
HABITA_EVALUATION_ACCESS_TOKEN con una sesión ficticia válida y cerrar
esa sesión después. Las comparaciones de CI usan datos marcados como
sintéticos y se publican como artefactos del job integral.

Para el fallo controlado, usar el entorno de ensayo y detener temporalmente
FastAPI. Comprobar que las sugerencias devuelven 503 y que el proyecto conserva
el piso. Reiniciar FastAPI, verificar salud y repetir la consulta. Registrar
estas comprobaciones y el alcance de la vista móvil con la versión evaluable.
