# Staging local con Terraform (EP1)

Este directorio define un **staging preliminar y reproducible** en un host con Docker. El desarrollo local sigue utilizando `docker-compose.yml`; staging usa recursos, redes, volumen, nombres y puerto propios administrados por Terraform. La decisión está registrada en [ADR 0001](../../docs/adr/0001-staging-local-con-terraform.md).

La configuración [staging/](staging/) planifica 12 recursos reales: tres redes, un volumen PostgreSQL, cuatro imágenes y cuatro contenedores. Solo el frontend publica `127.0.0.1:18080`; Nginx entrega Angular y reenvía `/api/` a NestJS. PostgreSQL y FastAPI no publican puertos al host. El flujo y los límites se muestran en la [arquitectura](../../docs/architecture/overview.md).

## Estado comprobado para EP1

- `terraform fmt -check -recursive ..`, `terraform init -backend=false`, `terraform validate` y `terraform plan` funcionan en la configuración de staging con Docker Desktop activo.
- El plan inicial contiene **12 altas, 0 cambios y 0 eliminaciones**. El job `Terraform staging plan` de GitHub Actions repite estas comprobaciones y detiene el workflow si alguna falla.
- **No se ha ejecutado `terraform apply`**. Un plan válido define la infraestructura, pero no demuestra que Habita3D ya esté desplegada. El Dockerfile actual genera el cliente Prisma y aplica migraciones antes de iniciar NestJS. El arranque y la integración se verifican por separado con Docker Compose y [la prueba de humo](../../scripts/ep1-smoke.sh).

## Requisitos y variables

- Terraform 1.6 o posterior, compatible con la restricción de `staging/versions.tf`; CI usa 1.16.0.
- Docker Desktop o Docker Engine en ejecución, con acceso al socket Docker.
- Aproximadamente 2 GB libres para los cuatro contenedores, además de espacio para imágenes y datos.
- `TF_VAR_database_password`: obligatorio, al menos 16 caracteres. Se obtiene fuera del repositorio. Terraform lo marca como sensible, pero **el estado local lo guarda en texto claro**; quien acceda al estado o al Docker host puede leerlo.
- Opcionales: `name_prefix`, `image_tag`, `frontend_port`, `database_name`, `database_user`. Sus valores y validaciones están en [variables.tf](staging/variables.tf); [terraform.tfvars.example](staging/terraform.tfvars.example) contiene solo ejemplos no sensibles.
- `DOCKER_HOST`: use el socket del contexto Docker activo si no existe `/var/run/docker.sock` (habitual en macOS).

En GitHub Actions, `STAGING_FRONTEND_PORT` es una **Variable** opcional. El job de PR y push usa siempre una contraseña ficticia para planificar, incluso si hay secretos configurados en GitHub. Nunca la aplica a una base de datos. Un despliegue manual futuro deberá recibir una contraseña propia y fuerte desde un mecanismo protegido, fuera del job que ejecuta código de PR.

## Validar y planificar

Desde la raíz del repositorio:

```sh
cd infrastructure/terraform/staging
export DOCKER_HOST="$(docker context inspect --format '{{ .Endpoints.docker.Host }}')"
terraform fmt -check -recursive ..
terraform init -backend=false -input=false -lockfile=readonly
terraform validate -no-color
TF_VAR_database_password=ep1-plan-only-placeholder terraform plan -input=false -no-color
```

La contraseña del último comando es **solo para revisar el plan**. Para una aplicación real, establezca `TF_VAR_database_password` desde un gestor de secretos o una entrada segura de la terminal. No guarde credenciales en `terraform.tfvars`, el historial de shell, un archivo de plan o Git. El archivo `.terraform.lock.hcl` sí debe versionarse para fijar el proveedor. Si cambia el código de la aplicación, use `TF_VAR_image_tag` con un nuevo identificador de commit al planificar y aplicar para que Terraform construya imágenes nuevas; CI ya utiliza `github.sha`.

## Aplicación controlada y operación futura

Si el equipo decide aplicar este staging después de EP1, debe revisar un plan con imágenes etiquetadas con un commit identificable, proporcionar una contraseña propia fuera de Git y autorizar manualmente `terraform apply` en un host controlado. **No hay `apply` automático en CI durante EP1**. La versión aplicada deberá registrarse y verificarse con `terraform output`, el estado de los contenedores, `GET /api/health` y la misma prueba de integración apuntada a la URL de staging: `bash scripts/ep1-smoke.sh http://127.0.0.1:18080`. Esta prueba crea un proyecto de demostración en PostgreSQL. El health check de NestJS solo comprueba que responde; no certifica por sí solo PostgreSQL ni Python.

El volumen `habita3d-staging-postgres-data` persiste los datos. Antes de reemplazar o eliminar staging debe existir una copia de seguridad. Los logs se consultan con `docker logs <nombre-del-contenedor>` y los contenedores tienen health checks; la observabilidad completa corresponde a etapas posteriores.

El estado de Terraform y los `.tfvars` locales están excluidos de Git. Como el estado puede contener `DATABASE_URL` y la contraseña de PostgreSQL, guárdelo solo en un equipo controlado con permisos restringidos. Antes de mover staging a un host compartido o cloud se deberá seleccionar un backend remoto cifrado y una estrategia de recuperación del estado.

## Límite del staging de EP1

Al aplicarse, este staging se ejecutaría únicamente en el host Docker que contiene el repositorio y quedaría expuesto en su loopback. No ofrece una URL pública ni alta disponibilidad. El despliegue automático y la demostración accesible de staging son entregables posteriores; la EP1 solicita su definición preliminar, variables, salidas y plan reproducible.
