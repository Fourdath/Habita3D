# Validación del bloque 1

Para las comprobaciones posteriores a la integración, consultar las
[evidencias de Windows y GitHub Actions](evidencias-windows.md).

Comprobaciones realizadas el 22/11/2026 sobre una copia de trabajo basada en
main d4b1ebc. Se usó Docker Compose con una base PostgreSQL desechable,
FastAPI real y datos sintéticos identificados. Las capturas de tiendas
permanecieron desactivadas durante las pruebas.

| Comprobación | Resultado local |
| --- | --- |
| Python | Ruff aprobado y 319 pruebas aprobadas. El contrato OpenAPI fue regenerado. |
| NestJS y PostgreSQL | Lint y compilación de producción aprobados, 133 pruebas unitarias y 42 pruebas HTTP/integración aprobadas. PostgreSQL aplicó las cuatro migraciones. |
| Docker Compose | Los cuatro servicios construidos y saludables. Pasaron la demo EP1 y la prueba integral de catálogo, presupuesto, recomendación y confirmación de precio. |
| Contratos | Swagger y OpenAPI atendidos por NestJS a través del mismo origen. 23 rutas, incluidas sugerencias y aceptación autenticadas. Se preservó la precisión de largos, anchos y margen con hasta 20 decimales en el área de compra. |
| Fallo controlado de FastAPI | Al detener Python solamente en el entorno aislado, la ruta privada de sugerencias devolvió 503. El piso guardado siguió en el proyecto. Al recuperar FastAPI volvieron las sugerencias. |
| Seguridad | El límite de login devolvió 429 al superar 12 solicitudes por minuto. FastAPI rechazó con 401 una operación de procesamiento sin la credencial interna. |
| Terraform | Formato, inicialización, validación y plan aprobados. El plan de un staging nuevo muestra 13 altas y ningún cambio o eliminación. |
| Respaldo | pg_dump y pg_restore completados en un PostgreSQL separado, sin red y descartable. Coincidieron los conteos de publicaciones, proyectos, habitaciones y migraciones. |
| Actualización de Docker | El motor 29.9.3 conservó los volúmenes y los cuatro contenedores. Se reiniciaron, el catálogo de prueba conservó ambas publicaciones y volvieron a pasar Swagger, la recuperación de FastAPI y Terraform. |

## Comparación reproducible

La prueba [integral](../../scripts/ep2-smoke.py) genera un JSON con
superficie, margen, presupuesto, orden previo y sugerencias de cada caso.
Los dos productos de la muestra son sintéticos. El proyecto de prueba
consulta ambos órdenes sobre los mismos precios en cada caso.

| Límite de la habitación | Primer piso del catálogo estable | Primera sugerencia | Opciones dentro del límite, catálogo / sugerencias |
| --- | --- | --- | --- |
| $78.000 | Cerámica, $72.000 | Cerámica, $72.000 | 1 de 2 / 1 de 1 |
| $90.000 | Cerámica, $72.000 | Laminado preferido, $80.000 | 2 de 2 / 2 de 2 |
| $50.000 | Cerámica, $72.000 | Cerámica, $72.000, exceso $22.000 | 0 de 2 / 0 de 2 |

El caso de confirmación conserva la selección anterior al cotizar
$80.000 y recibir un costo actualizado de $84.000. La publicación se
guarda después de confirmar el costo actualizado.

La comparación técnica ilustra el ajuste a presupuesto y preferencias en los
casos observados. El alcance de dos tiendas y una comuna limita su
generalización. Las evidencias en Windows documentan un ensayo posterior con
datos reales y la [guía de cierre](cierre-windows.md) describe cómo repetir las
comprobaciones sobre la versión evaluable.

## Dependencias y operación

La actualización compatible del backend redujo las entradas de severidad
alta de 14 a 7 en el árbol completo de npm y de 10 a 3 en dependencias de
ejecución, con cero críticas en la auditoría local. Las tres entradas de
ejecución restantes corresponden a Prisma, su módulo de configuración y
una dependencia de ese módulo. La corrección propuesta por la auditoría
implica un cambio mayor; se conserva Prisma 7 en esta entrega y se
mantiene el escaneo de imágenes y dependencias en CI.

Tras la detección de cuatro vulnerabilidades críticas por Trivy en la imagen
del frontend, se reconstruyó con [Nginx 1.30.7](https://nginx.org/news.html).
La imagen local inicia con la versión corregida. El mismo escaneo sigue
aplicándose a las cuatro imágenes del entorno.

El ensayo local acredita el flujo de backend, la prueba de recuperación de
la base aislada y el plan Terraform. El despliegue mediante el runner Windows,
el rollback de la aplicación en ese staging y la validación con el frontend
final se registran en la integración del equipo.
