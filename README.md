# Habita3D

Habita3D ayuda a elegir pisos para una vivienda, previsualizarlos en 3D y
comparar el costo de compra antes de decidir. Permite cargar un plano SVG
compatible de CubiCasa, recorrer la vivienda, seleccionar un recinto y guardar
un piso por habitación. El presupuesto usa cajas completas y los últimos
precios comprobados de Sodimac y Easy para La Florida.

El recomendador considera el saldo del proyecto, el límite de la habitación, la
superficie, el margen y las preferencias opcionales de tipo de piso y tienda.
Muestra hasta tres opciones con sus razones y permite descartar una opción,
aceptarla o desactivar las sugerencias por proyecto. Si la cotización cambió,
solicita confirmación antes de guardar. La muestra abarca cerámicas y laminados.
Las texturas son orientativas y el costo de pisos cubre la compra del material.
La vista de planchas y revestimientos ofrece una estimación demostrativa.

## Entrega final

| Elemento | Enlace o estado |
| --- | --- |
| Documentación técnica | [Índice de la entrega final](docs/final/README.md), [arquitectura](docs/architecture/overview.md) y [modelo de datos](docs/architecture/data-model.md). |
| API | [Contrato vigente de sugerencias v1](docs/final/contrato-sugerencias-v1.md). Swagger en `/api/docs`, especificación general en `/api/docs-json` y especificación de sugerencias en `/api/projects/suggestions/openapi.json`. |
| Evidencias | [Pruebas de integración con datos de prueba y ensayos en Windows](docs/final/evidencias-windows.md). |
| Staging de la demo | `http://127.0.0.1:18080` en el PC Windows de Matías. La comprobación del despliegue de la versión evaluable está pendiente. Véase la [guía de cierre](docs/final/cierre-windows.md). |
| Tag o release evaluable | Pendiente de la validación en Windows. Se publica sobre la SHA desplegada y comprobada. |
| Figma y tablero | Matías incorporará ambos enlaces y verificará su acceso para la revisión docente. |

### Aportes del equipo

| Integrante | Labores realizadas |
| --- | --- |
| **Matías Prado (`Fourdath`)** | Diseño funcional y desarrollo frontend en Angular e Ionic. Implementó la carga de SVG, el visor 3D, la selección de recintos y la previsualización de terminaciones. Integró catálogo, presupuesto y sugerencias con la API. Preparó PWA y Android con Capacitor. En CI/CD y seguridad incorporó auditorías de dependencias y Gitleaks, ajustó la CI de la integración final, actualizó Nginx y ensayó el despliegue en Windows. [Interfaz de EP2](https://github.com/Fourdath/Habita3D/pull/7) · [Controles iniciales](https://github.com/Fourdath/Habita3D/commit/3a8e46109c02d2fc5d691abbd85e24505e6df60a) · [Integración final](https://github.com/Fourdath/Habita3D/pull/10). |
| **Cris Dauros (`Crisss333`)** | Diseño e implementación de la extracción y normalización de precios de Sodimac y Easy. Desarrolló la mayor parte del backend NestJS y la persistencia PostgreSQL de catálogo, historial, proyectos y habitaciones. Implementó en FastAPI el cálculo por cajas y el motor de recomendación. Preparó Terraform. En CI/CD y seguridad amplió las pruebas de integración, incorporó Semgrep y Trivy y creó el workflow de CD que exige una CI aprobada antes de desplegar en staging. [Datos](https://github.com/Fourdath/Habita3D/pull/5) · [Backend y CI/CD](https://github.com/Fourdath/Habita3D/pull/6) · [Recomendador](https://github.com/Fourdath/Habita3D/pull/9). |
| **Carlos Ruz (`CarlosIgRuz`)** | Elaboró la especificación inicial del recomendador de pisos por habitación y sus criterios de evaluación. Revisó el cumplimiento de la pauta en todas las entregas y evaluó el recomendador con datos reales, comparando sus sugerencias con el orden base del catálogo. [Especificación inicial y revisión de EP2](https://github.com/Fourdath/Habita3D/pull/8). |

Los antecedentes de la propuesta y su evolución están en la [demo de EP1](docs/ep1-demo.md),
la [documentación de EP2](docs/ep2/README.md) y el [diseño preliminar de la adaptación](docs/ep2/diseno-adaptativo.md).

## Tecnologías y estructura

| Carpeta | Responsabilidad |
| --- | --- |
| `frontend/` | Ionic, Angular, visor 3D, PWA y proyecto Android con Capacitor. |
| `backend/` | API NestJS, autorización por propietario, catálogo, captura coordinada, cotizaciones y persistencia con Prisma. |
| `python-service/` | FastAPI: adquisición, normalización, cálculo de cajas y recomendación adaptativa, además del contrato demostrativo de EP1. |
| `infrastructure/terraform/staging/` | Staging aislado en Docker local, plan validado y despliegue Windows preparado. |
| `docs/` | Arquitectura, modelo de datos, decisiones y evidencia de las entregas. |
| `.github/workflows/ci.yml` | Calidad, seguridad, compilación, integración con Compose y plan Terraform. |
| `.github/workflows/deploy-local.yml` | Despliegue y comprobación del commit aprobado de `main` en staging Windows. |

PostgreSQL es la base de datos. NestJS es el único servicio de aplicación que la
administra; el navegador llama a NestJS por `/api` y NestJS consulta FastAPI por la
red interna. El [diseño](DESIGN.md) y los [diagramas](docs/architecture/overview.md)
explican los límites y decisiones.

## Requisitos para ejecutarlo

- Docker Desktop o Docker Engine con Docker Compose.
- Para ejecutar las verificaciones locales: `curl` y Python 3.
- Para desarrollo sin contenedores: Node.js 24.20.0 (véase `.nvmrc`), npm y Python 3.12+ (CI/Docker: 3.14).

Las variables de Compose están documentadas en [.env.example](.env.example):

| Variable | Uso |
| --- | --- |
| `POSTGRES_PASSWORD` | Obligatoria: reemplace el valor de ejemplo por una contraseña local única, apta para una URL. |
| `POSTGRES_USER`, `POSTGRES_DB` | Opcionales: usuario y base de datos; predeterminado `habita3d`. |
| `POSTGRES_PORT`, `BACKEND_PORT`, `PYTHON_SERVICE_PORT`, `FRONTEND_PORT` | Puertos del host; predeterminados 5432, 3000, 8000 y 8080. |
| `MATERIALS_API_TOKEN` | Credencial interna de al menos 24 caracteres para captura, procesamiento y recomendaciones, compartida por NestJS y FastAPI. |
| `MATERIALS_SCHEDULE_ENABLED` | `false` por defecto; activar expresamente para las franjas 08/12/16 de Chile. |
| `APP_VERSION`, `IMAGE_TAG` | Versión desplegada y etiqueta de imágenes; CI/CD usa el commit. |
| `NODE_ENV` | Entorno de NestJS; predeterminado `development` en Compose. |

Compose construye `DATABASE_URL` y `PYTHON_SERVICE_URL` para el backend, por lo
que no hay que agregar esas variables al `.env` de la raíz. En GitHub Actions,
`STAGING_FRONTEND_PORT` es una **Variable** opcional para el plan Terraform.
El análisis de secretos usa el `GITHUB_TOKEN` que GitHub entrega al workflow;
el plan de PR usa una contraseña ficticia y no consume un Secret de staging.
El despliegue local usa Secrets del entorno `habita3d-local`; sus nombres y configuración están en el manual de staging. No entran en jobs de PR.

## Inicio con Docker Compose

Desde la raíz del repositorio:

```sh
cp .env.example .env
# Edite .env: reemplace POSTGRES_PASSWORD y MATERIALS_API_TOKEN por valores locales propios.
docker compose up --build -d --wait --wait-timeout 180
bash scripts/ep1-smoke.sh
```

El backend genera el cliente Prisma durante la construcción de su imagen y ejecuta
`prisma migrate deploy` antes de iniciar NestJS. Compose espera la salud de PostgreSQL,
FastAPI, NestJS y el frontend. La prueba de humo crea un proyecto de ejemplo; puede
repetirse y dejará más registros de demostración en la base local. El 28-09-2026
se verificaron localmente la construcción, el arranque con `--wait`, la prueba de
humo, el formulario en el navegador y la navegación al visor 3D.

| Servicio | Dirección local |
| --- | --- |
| Aplicación web y API por el mismo origen | http://127.0.0.1:8080 y http://127.0.0.1:8080/api/health |
| NestJS directo, para diagnóstico | http://127.0.0.1:3000/api/health |
| FastAPI directo, para diagnóstico | http://127.0.0.1:8000/health |
| PostgreSQL, solo loopback del host | `127.0.0.1:5432` |

Los puertos se pueden cambiar en `.env`. Para detener los servicios sin borrar los
datos: `docker compose down`. No use `down -v` si desea conservar la base de datos.
El procedimiento completo de demostración, incluidas pruebas de error y seguridad,
está en [docs/ep1-demo.md](docs/ep1-demo.md).

## Desarrollo y pruebas

El servidor Angular de desarrollo usa [proxy.conf.json](frontend/proxy.conf.json)
para dirigir `/api` a NestJS en el puerto 3000. Para ejecutar servicios por separado,
configure `DATABASE_URL`, genere el cliente Prisma y aplique las migraciones antes de
arrancar el backend; Compose es la ruta recomendada para verificar la integración.
La URL ficticia del siguiente comando solo satisface la generación del cliente;
estas verificaciones no conectan a esa base de datos.

```sh
(cd frontend && npm ci && npm run lint && npm test -- --configuration=ci && npm run build)
(cd backend && npm ci && DATABASE_URL='postgresql://demo:demo@localhost:5432/demo' npx prisma generate && npm run lint && npm test && npm run build)
(cd python-service && python -m pip install -r requirements-dev.txt && ruff check . && pytest)
```

La [CI](.github/workflows/ci.yml) ejecuta estos controles, auditorías de dependencias,
análisis de secretos, construcción de imágenes, arranque de Compose y la prueba de
humo entre servicios. El job de backend inicia PostgreSQL desechable, aplica
migraciones y ejecuta pruebas HTTP y de persistencia real con `RUN_DATABASE_TESTS=true`; usa un especialista HTTP simulado sin tiendas. El smoke de Compose comprueba además el cálculo con FastAPI real. Los datos de prueba están identificados como sintéticos.
Terraform recibe verificaciones de formato, configuración y plan. La protección
de `main` está activa según la consulta a GitHub del 24/10/2026. Los administradores deben mantener los checks obligatorios del equipo; el nuevo análisis estático también debe exigirse al actualizar esa configuración.

## Uso, plataformas y despliegue

En **Mis proyectos**, ingresa con una cuenta ficticia y abre un proyecto con su
SVG guardado. Selecciona una habitación para consultar sugerencias, comprobar
precio y disponibilidad, previsualizar el piso y guardar la elección. El visor
libre conserva un plano de ejemplo. Para preparar el entorno, instalar la PWA o
ejecutar el APK de depuración, consulta los manuales del equipo.
[Operación en Windows](docs/final/operacion-windows.md) · [PWA y Android](docs/final/plataformas-windows.md)

La [CI](.github/workflows/ci.yml) usa datos sintéticos para automatizar pruebas y
escaneos. El [CD](.github/workflows/deploy-local.yml) aplica Terraform en el
runner Windows una vez aprobada la CI del commit actual de `main`. El catálogo
real se comprueba desde ese staging y las consultas de la aplicación usan la
información persistida. [Guía de staging](infrastructure/terraform/README.md) · [Fuentes y calidad de datos](docs/ep2/fuentes-web.md)
