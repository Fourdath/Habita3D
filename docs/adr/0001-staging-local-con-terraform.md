# ADR 0001: staging preliminar local con Terraform y Docker

- **Fecha:** 2026-09-26
- **Estado:** aceptada para EP1
- **Responsable:** equipo Habita3D

## Contexto

La EP1 exige infraestructura preliminar reproducible con proveedor, recursos, variables, salidas, `fmt`, `validate` y `plan`, además de describir staging. El equipo todavía no ha elegido ni habilitado un proveedor cloud. Ya existe Docker Compose para desarrollo, pero reutilizar los mismos contenedores y puertos no separaría ambientes.

## Decisión

Utilizar el proveedor `kreuzwerker/docker` fijado en la configuración de Terraform para modelar un **staging local aislado**: tres redes, un volumen PostgreSQL, cuatro imágenes y cuatro contenedores con nombres, puerto y estado independientes del Compose de desarrollo. Planificar en GitHub Actions y reservar `apply` para aprobación manual cuando las imágenes y migraciones sean desplegables.

## Alternativas consideradas

1. **Proveedor cloud ahora:** permitiría una URL remota, pero faltan cuenta, región, credenciales, límites de costo y diseño de estado remoto. Elegirlo sin esos datos produciría una configuración especulativa que el equipo no podría validar con `plan`.
2. **Solo Docker Compose:** útil para desarrollo, pero no satisface la definición y validación de infraestructura mediante Terraform ni establece un staging separado.

## Consecuencias

- La EP1 puede demostrar un plan real sin contratar servicios externos. Los recursos son ejecutables en un host Docker con el repositorio presente.
- El entorno no es público, no tiene alta disponibilidad y depende del host local. Para EP2 se decidirá si migrar a un proveedor remoto y un backend de estado cifrado.
- El estado local contiene atributos sensibles de Docker y debe permanecer fuera de Git con acceso restringido.
- Un plan exitoso no demuestra que la aplicación haya arrancado. El backend todavía necesita generación de Prisma, migraciones e integración de servicios antes de aplicar todo el staging.

## Actualización de implementación, 28-09-2026

La consecuencia anterior describe el estado al aprobar el ADR. Desde entonces, el
Dockerfile de NestJS genera el cliente Prisma, ejecuta migraciones al iniciar y el
flujo de vista previa conecta Angular, NestJS, FastAPI y PostgreSQL en Compose.
La decisión de staging local no cambia: CI valida su `plan` y todavía no se ha
ejecutado `terraform apply`.
