# Habita3D

Habita3D permite explorar una vivienda en 3D y comparar terminaciones y costos. Esta
versión de EP1 incluye un visor web adaptable a pantallas móviles, una vista previa que conecta Angular,
NestJS, FastAPI y PostgreSQL, autenticación básica en la API, CI y un plan de staging
local con Terraform. Las estimaciones y recomendaciones usan **valores de
demostración**: todavía no consultan precios ni disponibilidad de tiendas web y no
constituyen cotizaciones.

## Definición del proyecto para EP1

- **Problema:** una vivienda terminada y sus costos son difíciles de anticipar
  cuando planos, terminaciones y precios se consultan por separado.
- **Usuarios:** clientes que exploran una vivienda; más adelante, operadores que
  administrarán proyectos y catálogos.
- **Objetivo y alcance:** navegar un modelo 3D, comparar terminaciones y mostrar
  una estimación inicial. EP1 entrega la base integrada y un flujo demostrativo;
  la consulta de precios reales y la aplicación móvil nativa quedan para etapas
  posteriores.
- **Fuente web considerada:** el
  [catálogo de materiales de construcción de Sodimac Chile](https://www.sodimac.cl/sodimac-cl/lista/CATG10731/Materiales-de-Construccion).
  Es una candidata que requiere revisión de condiciones de acceso y calidad; la
  aplicación de EP1 no extrae datos de este sitio.
- **Capacidad adaptativa propuesta:** ordenar materiales por presupuesto,
  preferencias de estilo y necesidades, con precio, disponibilidad, procedencia
  y explicación de cada sugerencia. La comparación actual solo utiliza cifras
  ilustrativas según superficie y presupuesto.

## Tecnologías y estructura

| Carpeta | Responsabilidad |
| --- | --- |
| `frontend/` | Ionic, Angular, TypeScript y visor 3D; Capacitor está configurado, sin plataformas nativas añadidas. |
| `backend/` | API NestJS, validación, autenticación básica y persistencia con Prisma. |
| `python-service/` | FastAPI: salud y comparación demostrativa de terminaciones según superficie y presupuesto. |
| `infrastructure/terraform/staging/` | Infraestructura preliminar y aislada en Docker local, validada con `terraform plan`. |
| `docs/` | Arquitectura, modelo de datos, decisiones y guía de demostración de EP1. |
| `.github/workflows/ci.yml` | Calidad, seguridad, compilación, integración con Compose y plan Terraform. |

PostgreSQL es la base de datos. NestJS es el único servicio de aplicación que la
administra; el navegador llama a NestJS por `/api` y NestJS consulta FastAPI por la
red interna. El [diseño](DESIGN.md) y los [diagramas](docs/architecture/overview.md)
explican los límites y decisiones.

## Requisitos para ejecutarlo

- Docker Desktop o Docker Engine con Docker Compose.
- Para ejecutar las verificaciones locales: `curl` y Python 3.
- Para desarrollo sin contenedores: Node.js 24.20.0 (véase `.nvmrc`), npm y Python 3.14.

Las variables de Compose están documentadas en [.env.example](.env.example):

| Variable | Uso |
| --- | --- |
| `POSTGRES_PASSWORD` | Obligatoria: reemplace el valor de ejemplo por una contraseña local única, apta para una URL. |
| `POSTGRES_USER`, `POSTGRES_DB` | Opcionales: usuario y base de datos; predeterminado `habita3d`. |
| `POSTGRES_PORT`, `BACKEND_PORT`, `PYTHON_SERVICE_PORT`, `FRONTEND_PORT` | Puertos del host; predeterminados 5432, 3000, 8000 y 8080. |
| `NODE_ENV` | Entorno de NestJS; predeterminado `development` en Compose. |

Compose construye `DATABASE_URL` y `PYTHON_SERVICE_URL` para el backend, por lo
que no hay que agregar esas variables al `.env` de la raíz. En GitHub Actions,
`STAGING_FRONTEND_PORT` es una **Variable** opcional para el plan Terraform.
El análisis de secretos usa el `GITHUB_TOKEN` que GitHub entrega al workflow;
el plan de PR usa una contraseña ficticia y no consume un Secret de staging.
Un despliegue posterior necesitará un secreto protegido fuera de los jobs de PR.

## Inicio con Docker Compose

Desde la raíz del repositorio:

```sh
cp .env.example .env
# Edite .env y reemplace POSTGRES_PASSWORD por una contraseña local única.
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
migraciones y ejecuta pruebas HTTP de la API; las pruebas de autenticación usan
un sustituto de Prisma, mientras la prueba de humo de Compose comprueba la
persistencia real.
Terraform recibe verificaciones de formato, configuración y plan. La protección
de `main` y sus checks obligatorios requieren configuración por una persona con
permisos de administración en GitHub; **siguen pendientes** y no se establecen
por archivos del repositorio.

## Alcance de EP1 y siguientes etapas

- El formulario de inicio solicita `POST /api/projects/preview`. NestJS consulta
  `POST /recommendations/compare` en FastAPI y, tras recibir una respuesta válida,
  guarda el proyecto en PostgreSQL. Una respuesta inválida o un servicio Python
  inaccesible produce un error controlado y no crea el proyecto.
- La API ofrece registro, inicio de sesión, consulta de sesión y cierre de sesión.
  Las rutas de proyectos siguen siendo públicas en esta versión; no hay aún cuentas
  de proyecto, roles ni autorización por propietario.
- El visor, el presupuesto del navegador y la comparación de FastAPI usan datos
  locales de demostración. Integrar fuentes web autorizadas, precios actuales,
  disponibilidad y recomendaciones productivas corresponde a una etapa posterior.
- Terraform define un staging local independiente de Compose. Su plan se verifica
  en CI; **no se ha ejecutado `terraform apply`** ni existe despliegue público.
- **Figma:** falta incorporar al repositorio el enlace verificable al prototipo del
  equipo antes de la entrega. No se incluye una URL de ejemplo.

Véanse la [arquitectura](docs/architecture/overview.md), el
[modelo de datos](docs/architecture/data-model.md), la
[guía de staging](infrastructure/terraform/README.md) y los
[ADR](docs/adr/0001-staging-local-con-terraform.md).
