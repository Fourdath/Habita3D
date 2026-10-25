# Staging local con Terraform (EP1 y EP2)

Este directorio define un **staging local reproducible** en un host con Docker. El desarrollo local sigue utilizando `docker-compose.yml`; staging usa recursos, redes, volumen, nombres y puerto propios administrados por Terraform. La decisión está registrada en [ADR 0001](../../docs/adr/0001-staging-local-con-terraform.md).

La configuración [staging/](staging/) planifica 13 recursos reales: tres redes, dos volúmenes (PostgreSQL y evidencia de adquisición), cuatro imágenes y cuatro contenedores. Solo el frontend publica `127.0.0.1:18080`; Nginx entrega Angular y reenvía `/api/` a NestJS. PostgreSQL y FastAPI no publican puertos al host. El flujo y los límites se muestran en la [arquitectura](../../docs/architecture/overview.md).

## Estado actual EP2

El [manual de staging EP2](../../docs/ep2/bloque-2-staging.md) describe los scripts Windows,
la actualización coordinada por NestJS y el workflow de despliegue controlado después de CI.
El runner Windows debe registrarse y validarse en el computador del integrante; ese paso
externo no se considera ejecutado por la existencia del workflow.

La configuración añade `TF_VAR_materials_api_token` (sensible, mínimo 24 caracteres),
`materials_schedule_enabled` (`false` inicialmente), un volumen de evidencia Python y
readiness que comprueba PostgreSQL y FastAPI. El estado de Terraform contiene ambos
secretos en texto claro; protegerlo y guardarlo fuera del clon del runner.

### Validación local EP2 — 25/10/2026

Se ejecutó un `terraform apply` real sobre Docker Desktop en macOS, con contenedores
Linux arm64 y estado fuera del repositorio: **13 recursos creados, 0 cambios y 0 eliminaciones**.
La prueba usó el prefijo aislado `habita3d-ep2-tfcheck` y el puerto `58180`; son valores
utilizados para validar, no la dirección definitiva del computador Windows del equipo.
Solo el frontend publicó un puerto al host. Readiness confirmó PostgreSQL y FastAPI.

Una captura real protegida persistió **40 publicaciones**, diez por tienda/categoría.
Reimportar la misma ejecución devolvió `replayed: true`, conservando **40 publicaciones,
40 observaciones iniciales y una ejecución**, sin duplicados. El presupuesto también se
comprobó a través de NestJS y FastAPI con esos datos persistidos. Véase el
[manual de backend del bloque 2](../../docs/ep2/bloque-2-backend.md) y las
[evidencias de EP2](../../docs/ep2/evidencias/).

Esta validación local no acredita que el runner Windows esté instalado ni que GitHub ya
haya desplegado al equipo del compañero. Esos pasos siguen pendientes de su configuración
externa y comprobación; el [manual de staging](../../docs/ep2/bloque-2-staging.md) los detalla.

## Evidencia histórica de EP1

- `terraform fmt -check -recursive ..`, `terraform init -backend=false`, `terraform validate` y `terraform plan` funcionan en la configuración de staging con Docker Desktop activo.
- El plan inicial contiene **12 altas, 0 cambios y 0 eliminaciones**. El job `Terraform staging plan` de GitHub Actions repite estas comprobaciones y detiene el workflow si alguna falla.
- **En la validación de EP1 no se ejecutó `terraform apply`**. Un plan válido define la infraestructura, pero no demuestra que Habita3D ya esté desplegada. El Dockerfile actual genera el cliente Prisma y aplica migraciones antes de iniciar NestJS. El arranque y la integración se verifican por separado con Docker Compose y [la prueba de humo](../../scripts/ep1-smoke.sh).

## Requisitos y variables

- Terraform 1.6 o posterior, compatible con la restricción de `staging/versions.tf`; CI usa 1.16.0.
- Docker Desktop o Docker Engine en ejecución, con acceso al socket Docker.
- Aproximadamente 2 GB libres para los cuatro contenedores, además de espacio para imágenes y datos.
- `TF_VAR_database_password`: obligatorio, al menos 16 caracteres. Se obtiene fuera del repositorio. Terraform lo marca como sensible, pero **el estado local lo guarda en texto claro**; quien acceda al estado o al Docker host puede leerlo.
- `TF_VAR_materials_api_token`: obligatorio, al menos 24 caracteres; compartir únicamente entre NestJS y FastAPI.
- Opcionales: `materials_schedule_enabled`, `name_prefix`, `image_tag`, `frontend_port`, `database_name`, `database_user`. Sus valores y validaciones están en [variables.tf](staging/variables.tf); [terraform.tfvars.example](staging/terraform.tfvars.example) contiene solo ejemplos no sensibles.
- `DOCKER_HOST`: use el socket del contexto Docker activo si no existe `/var/run/docker.sock` (habitual en macOS).

En GitHub Actions, `STAGING_FRONTEND_PORT` es una **Variable** opcional. El job de PR y push usa siempre una contraseña ficticia para planificar, incluso si hay secretos configurados en GitHub. Nunca la aplica a una base de datos. El despliegue controlado de EP2 recibe credenciales propias desde el environment protegido, fuera del job que ejecuta código de PR.

## Validar y planificar

Desde la raíz del repositorio:

```sh
cd infrastructure/terraform/staging
export DOCKER_HOST="$(docker context inspect --format '{{ .Endpoints.docker.Host }}')"
terraform fmt -check -recursive ..
terraform init -backend=false -input=false -lockfile=readonly
terraform validate -no-color
TF_VAR_database_password=ep1-plan-only-placeholder TF_VAR_materials_api_token=ep2-plan-only-token-no-access terraform plan -input=false -no-color
```

La contraseña del último comando es **solo para revisar el plan**. Para una aplicación real, establezca `TF_VAR_database_password` desde un gestor de secretos o una entrada segura de la terminal. No guarde credenciales en `terraform.tfvars`, el historial de shell, un archivo de plan o Git. El archivo `.terraform.lock.hcl` sí debe versionarse para fijar el proveedor. Si cambia el código de la aplicación, use `TF_VAR_image_tag` con un nuevo identificador de commit al planificar y aplicar para que Terraform construya imágenes nuevas; CI ya utiliza `github.sha`.

## Aplicación controlada y operación

El workflow `CI` revisa y planifica sin aplicar infraestructura. El workflow separado
`Deploy local staging` puede aplicarla después de una CI aprobada del mismo commit de
`main`, con un runner Windows y un environment protegidos. Permanece deshabilitado hasta
que el equipo configure `LOCAL_STAGING_ENABLED=true`; no ejecuta código de PR en el host.
El script de despliegue conserva el estado fuera del clon y respalda PostgreSQL antes
de aplicar migraciones a una instalación existente. Para preparar ese host, seguir el
[manual del bloque 2](../../docs/ep2/bloque-2-staging.md).

La versión aplicada debe verificarse con los contenedores, `GET /api/health/ready` y
una consulta funcional. `GET /api/health` conserva el liveness; readiness comprueba
PostgreSQL y FastAPI. La prueba `scripts/ep2-smoke.py` es de solo lectura por defecto.
Su modo `--disposable-fixtures` se reserva a bases de prueba desechables, nunca al staging
con datos reales. La [prueba EP1](../../scripts/ep1-smoke.sh) también sigue disponible,
pero crea cuentas/proyectos de demostración y no sustituye la prueba de datos reales.

El volumen `habita3d-staging-postgres-data` persiste los datos. Antes de reemplazar o eliminar staging debe existir una copia de seguridad. Los logs se consultan con `docker logs <nombre-del-contenedor>` y los contenedores tienen health checks. EP2 añade logs estructurados, correlación de solicitudes y estado de las capturas; no se despliega una plataforma externa de observabilidad.

El estado de Terraform y los `.tfvars` locales están excluidos de Git. Como el estado puede contener `DATABASE_URL` y la contraseña de PostgreSQL, guárdelo solo en un equipo controlado con permisos restringidos. Antes de mover staging a un host compartido o cloud se deberá seleccionar un backend remoto cifrado y una estrategia de recuperación del estado.

## Límite del staging de EP1

Este staging se ejecuta únicamente en el host Docker que contiene el repositorio y queda expuesto en su loopback. No ofrece una URL pública ni alta disponibilidad. La EP1 pidió su definición preliminar; EP2 añade el workflow de despliegue y el manual del host Windows. Su ejecución real debe comprobarse en ese host.
