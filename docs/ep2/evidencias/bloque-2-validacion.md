# Validación del bloque 2

Cierre local: **25/10/2026**. Núcleo de backend probado:
`47893106e828073f9345236f782e6044eaf5259b`.
Las configuraciones y esta evidencia se integran en los commits siguientes de la
misma rama; GitHub Actions verifica el SHA final de la pull request.

## Resultado local

| Comprobación | Resultado |
| --- | --- |
| Migraciones PostgreSQL | Tres migraciones aplicadas correctamente; segunda ejecución sin pendientes. |
| Backend: lint y build | Aprobados con Node 24; build de producción también aprobado en Docker. |
| Backend: pruebas unitarias | **118 aprobadas**. |
| Backend: pruebas HTTP e integración PostgreSQL | **39 aprobadas**, con `RUN_DATABASE_TESTS=true`; seis verifican la base real, bloqueos y reinicios. |
| Python: ruff y pytest | **281 aprobadas**, sin consultas a tiendas en esas pruebas. |
| Contrato FastAPI | OpenAPI regenerado; admite franja horaria protegida enviada desde NestJS. |
| Docker Compose | Cuatro imágenes construidas, servicios saludables y smoke EP1 aprobado. |
| Smoke EP2 | Importación idempotente, historial, retención, propiedad, habitaciones y presupuesto con FastAPI real aprobados; datos sintéticos explícitos. |
| PowerShell | Tres scripts analizados con PowerShell 7.5.12; `verify-local.ps1` ejecutado contra el conjunto Docker real. |
| Terraform | fmt/init/validate/plan aprobados; **apply real: 13 altas, 0 cambios y 0 bajas**, en un staging local aislado. |
| Captura real en ese staging | **40 publicaciones**, diez por cada tienda/categoría. |
| Reimportación de la captura real | `replayed=true`; permanecen **40 publicaciones, 40 observaciones iniciales y una captura**, sin duplicados. |
| Reinicio del backend | Readiness recuperada y las 40 publicaciones continúan en PostgreSQL. |
| Seguridad | Semgrep con cero hallazgos en sus reglas y fallo controlado bloqueado; Gitleaks sin secretos tras clasificar únicamente identificadores públicos conocidos; cuatro imágenes sin hallazgos CRITICAL en el escaneo local. |

Los resultados de pruebas dependen del commit/configuración ejecutados. Las pruebas
con dobles no se presentan como capturas reales: se distinguen del ensayo siguiente.

## Captura real y calidad

La [evidencia JSON](bloque-2-verificacion-real.json) registra ejecución, grupos,
fechas reales, conteos, presupuesto, reimportación y reinicio. Se efectuó en
Docker Desktop/Linux arm64, accediendo por el proxy de staging de Terraform.
El programador permaneció desactivado: se inició una captura manual protegida;
reimportarla y navegar después no volvieron a consultar las tiendas.

| Fuente / categoría | Recuperados | Válidos del alcance | Excluidos | Seleccionados |
| --- | ---: | ---: | ---: | ---: |
| Sodimac / cerámica | 48 | 38 | 10 | 10 |
| Sodimac / laminado | 49 | 33 | 16 | 10 |
| Easy / cerámica | 40 | 30 | 10 | 10 |
| Easy / laminado | 40 | 38 | 2 | 10 |
| **Total** | **177** | **139** | **38** | **40** |

Sin rechazos de formato ni duplicados en estas páginas. Validez del alcance:
139/177 = **78,53 %**; duplicados: 0/177 = **0 %**. Es una muestra acotada en esa
fecha, no una medición de todo el catálogo. Las cuarenta publicaciones mantienen
**disponibilidad desconocida**: el ensayo no demuestra inventario físico local.

### Presupuesto sobre una publicación capturada

- Publicación Easy: [piso flotante Classic Touch Aquapro Ferrara](https://www.easy.cl/piso-flotante-classic-touch-aquapro-ferrara-wildlife-7-mm-304-m2-1392714/p).
- Comprobación del ensayo: **25/10/2026 01:20**, America/Santiago.
- Precio observado por caja: **$41.010 CLP**; cobertura: **3,04 m²**.
- Habitación: 10 m²; margen 10 %; compra requerida 11 m².
- Cajas: techo(11/3,04) = **4**; superficie comprada 12,16 m².
- Costo: 4 × $41.010 = **$164.040 CLP**, contra un presupuesto ficticio de $500.000.

El precio corresponde a esa comprobación y puede cambiar. La cuenta/proyecto de
validación son ficticios. El cálculo se obtuvo desde NestJS leyendo PostgreSQL y
llamando a `/floors/budget`; no se tomó de la comparación demostrativa EP1.

## Seguridad e infraestructura

El [resumen de seguridad](bloque-2-seguridad.json) conserva versiones, imágenes,
base del escáner y límites. Se actualizó la base Nginx y se construyó una imagen
PostgreSQL que utiliza `su-exec` en sus scripts de entrada. No se añadieron exclusiones
CVE para hacer pasar el escáner. Los identificadores SHA-256 de publicaciones no son
credenciales y solo se excluyen de Gitleaks por ruta y valor exactos conocidos.

El umbral del pipeline es **CRITICAL**, no ausencia total de vulnerabilidades:
`npm audit` registra cero críticas y 13 altas en cada proyecto Node. Los escaneos
locales son Linux arm64; CI reconstruye y analiza Linux amd64. Un análisis de hoy
no garantiza que una base de vulnerabilidades futura produzca el mismo resultado.

El estado/plan Terraform de verificación y las credenciales temporales están fuera
de Git. Solo se publicó el frontend en loopback; Python y PostgreSQL no tienen
puertos del host en ese staging. Este apply local no equivale al despliegue de CD
en el computador Windows del compañero.

## Pendientes que requieren al equipo

1. El compañero instalará y registrará el runner Windows, como acordó el usuario.
2. Configurar el environment, Variables/Secrets y habilitar el workflow según
   [staging](../bloque-2-staging.md); comprobar su primer despliegue en ese equipo.
3. Fourdath debe mantener los checks obligatorios e incorporar el nuevo análisis
   estático cuando corresponda. `main` indica protección activa; la cuenta con push
   no pudo leer la configuración detallada de checks, por lo que no se certifica aquí.
4. Implementar el bloque 3 con las nuevas APIs, completar diseño/prototipo y demo,
   y etiquetar la versión final de EP2 después de verificar la entrega completa.

Estos pendientes permanecen visibles en el [plan](../plan-de-trabajo.md). El bloque
2 entrega código y comprobación local; no acredita por sí solo toda la EP2.
