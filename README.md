# Habita3D

Habita3D permite explorar una vivienda en 3D y comparar pisos y costos. Para EP2
están implementados **los bloques 1 y 2**: adquisición/procesamiento en Python,
catálogo e historial en PostgreSQL, proyectos privados por habitación y presupuesto
calculado con los últimos precios persistidos. El **bloque 3 de Angular/3D** integra
sesión, proyectos, habitaciones, catálogo, historial y suelos orientativos por habitación.
La demo libre EP1 conserva sus datos demostrativos, separados del presupuesto EP2.

## Estado de la EP2

- [Acuerdos y plan de trabajo](docs/ep2/README.md): alcance, reparto y pendientes.
- [Bloque 1: datos y FastAPI](docs/ep2/bloque-1-datos.md): fuentes reales, normalización,
  cálculo compartido, métricas y restricciones de acceso.
- [Bloque 2: backend y APIs](docs/ep2/bloque-2-backend.md): persistencia, catálogo/filtros,
  historial, autenticación, habitaciones, captura coordinada y observabilidad.
- [Bloque 2: staging y Windows](docs/ep2/bloque-2-staging.md): ejecución local gratuita,
  Terraform, CI/CD y configuración del runner que el compañero hará posteriormente.
- [Validación del bloque 2](docs/ep2/evidencias/bloque-2-validacion.md): pruebas y límites.
- [Bloque 3: interfaz integrada y revisión antes del push](docs/ep2/bloque-3-interfaz.md):
  rutas, selección persistida, visor por habitación y comprobación local en Windows.

La demo se ejecutará en el computador Windows del equipo, sin costo ni tarjeta.
La configuración y primer despliegue de su runner requieren validación allí.
El cierre integral de EP2 requiere además la CI de la rama y los pendientes operativos
del equipo; el ensayo local no sustituye el primer despliegue automático del runner.

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
| `backend/` | API NestJS, autorización por propietario, catálogo, captura coordinada y persistencia con Prisma. |
| `python-service/` | FastAPI: adquisición y normalización de pisos, métricas y presupuestos por cajas; conserva la demo EP1. |
| `infrastructure/terraform/staging/` | Staging aislado en Docker local, plan validado y despliegue Windows preparado. |
| `docs/` | Arquitectura, modelo de datos, guía de EP1 y acuerdos/planificación de EP2. |
| `.github/workflows/ci.yml` | Calidad, seguridad, compilación, integración con Compose y plan Terraform. |

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
| `MATERIALS_API_TOKEN` | Credencial interna de al menos 24 caracteres para captura/importación; compartida por NestJS y FastAPI. |
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

## Alcance de EP1 y siguientes etapas

- El formulario de inicio solicita `POST /api/projects/preview`. NestJS consulta
  `POST /recommendations/compare` en FastAPI y, tras recibir una respuesta válida,
  guarda el proyecto en PostgreSQL. Una respuesta inválida o un servicio Python
  inaccesible produce un error controlado y no crea el proyecto.
- La API ofrece registro, inicio de sesión, consulta de sesión y cierre de sesión.
  Las rutas EP2 de proyectos y habitaciones requieren sesión y autorizan por propietario; la vista previa demostrativa EP1 continúa pública.
- El visor, el presupuesto del navegador y la comparación de FastAPI usan datos
  locales de demostración. La API EP2 ya integra fuentes y precios persistidos; mostrarlos en las pantallas y el visor corresponde al bloque 3. El motor adaptativo completo es posterior.
- Terraform define un staging local independiente de Compose. Su plan se verifica
  en CI; para EP2 se aplicaron y comprobaron 13 recursos en un staging local aislado.
  El despliegue del runner Windows y la demo completa siguen pendientes; no hay URL pública.
- **Figma:** falta incorporar al repositorio el enlace verificable al prototipo del
  equipo antes de la entrega. No se incluye una URL de ejemplo.

Véanse la [arquitectura](docs/architecture/overview.md), el
[modelo de datos](docs/architecture/data-model.md), la
[guía de staging](infrastructure/terraform/README.md) y los
[ADR](docs/adr/0001-staging-local-con-terraform.md).
