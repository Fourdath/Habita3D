# ADR 0003 — Persistencia y actualización de pisos para EP2

- Fecha: 24/10/2026.
- Estado: aceptado para la implementación del bloque 2.

## Contexto

El equipo aprobó hasta diez publicaciones de cerámica y laminado por Sodimac/Easy,
con comuna La Florida, precios comprobados a las 08/12/16 de Chile, historial
informativo y presupuestos siempre actuales. La demo se ejecutará localmente en
Windows sin pagos ni tarjeta. El bloque 1 ya normaliza datos y calcula cajas/costos
en FastAPI; su caché de evidencia no puede sustituir la base de la aplicación.

## Decisión

1. NestJS es dueño de Prisma/PostgreSQL y del programador del conjunto integrado.
   FastAPI conserva la adquisición/normalización/cálculo y una caché local persistente
   para la muestra y evidencia. Angular consume NestJS.
2. Guardar publicación actual, resultado importado inmutable, observaciones de
   precio/envase y trabajo de captura por separado. Reservar franjas de forma durable
   e importar de forma idempotente bajo bloqueos PostgreSQL distintos.
3. Mantener las selecciones en habitaciones con propietario del proyecto. Leer un
   snapshot coherente de precios al calcular, sin congelar versiones del presupuesto.
4. Programador desactivado por defecto en desarrollo/CI, y activado expresamente
   por el operador en el host de demo. No usar un segundo programador Python a la vez.
5. Operaciones de captura/importación con token interno; proyectos con sesión y
   autorización por propietario. GET de catálogo/proyecto no contacta tiendas.
6. Conservar EP1 como demo explícita compatible; su vista previa pública no se
   presenta como presupuesto real ni crea proyectos privados.
7. Preparar despliegue desde CI aprobada de main a un runner Windows dedicado,
   con Terraform/estado protegido, backup previo, migraciones y readiness. El equipo
   registrará ese runner después; no se afirma un despliegue allí todavía.

## Consecuencias

Las capturas no se repiten por navegar o reiniciar dentro de una franja ya intentada.
El historial no duplica precios inalterados y las caídas conservan datos anteriores.
El operador puede recuperar un intento de forma manual y limitada. Los trabajos
interrumpidos se cierran sin repetir solicitudes automáticamente.

La actualización depende de que el computador esté encendido y no suspendido, de
Internet y del acceso permitido a las tiendas. No se promete stock real cuando la
fuente no lo demuestra. Las consultas presupuestarias dependen de FastAPI; si falla,
se devuelve error y las selecciones siguen guardadas. Los backups y el rollback
deben considerar que una migración de esquema no se deshace cambiando solo la imagen.

## Verificación

Pruebas de contratos/seguridad, migraciones en PostgreSQL desechable, importación
repetida, cambios de precio, fallos, reinicios y smoke con FastAPI real. Ver
[evidencias](../ep2/evidencias/bloque-2-validacion.md). La ejecución nativa y el primer
despliegue con el runner del compañero se validarán en ese equipo posteriormente.
