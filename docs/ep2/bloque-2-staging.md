# Bloque 2: ejecución local, infraestructura y despliegue

## Alcance y estado

La demo prevista utiliza el computador Windows de un integrante: Docker Desktop con
contenedores Linux, PostgreSQL, NestJS, FastAPI y Angular servido por Nginx. No requiere
proveedor cloud, cuenta de pago ni tarjeta. VS Code edita el código; Figma sirve como
referencia visual y no ejecuta los servicios.

Se entregan la configuración reproducible, los scripts y el workflow de despliegue.
**El registro del runner y la comprobación en el Windows del compañero quedan pendientes
de realizar allí.** Las pruebas en CI o en otro computador no acreditan ese despliegue.
El bloque 3 sigue pendiente: tener las APIs no significa que Angular ya use todo el catálogo.

### Validación técnica local realizada el 25/10/2026

Además del plan, se aplicó la infraestructura Terraform en un entorno aislado de
Docker Desktop sobre macOS/Linux arm64: **13 recursos creados, 0 cambios y 0 eliminaciones**.
Se verificó readiness de PostgreSQL y FastAPI y una captura real de **40 publicaciones**
(diez por tienda/categoría). La reimportación de la misma ejecución fue idempotente:
40 publicaciones, 40 observaciones iniciales y una ejecución. Se comprobó además un
presupuesto de NestJS → FastAPI utilizando precios guardados, sin volver a consultar tiendas.
Los detalles se conservan en el [manual de backend](bloque-2-backend.md) y las
[evidencias](evidencias/).

El prefijo `habita3d-ep2-tfcheck` y puerto `58180` identifican esa prueba técnica local.
No sustituyen el runner Windows ni certifican un despliegue remoto desde GitHub: esos
pasos continúan pendientes de preparar el computador del compañero.

Hay dos alternativas independientes:

| Uso | Administración | URL predeterminada | Persistencia |
| --- | --- | --- | --- |
| Desarrollo/demo manual | Docker Compose | `http://127.0.0.1:8080` | Volúmenes del proyecto Compose |
| Staging identificado por commit | Terraform y CD | `http://127.0.0.1:18080` | Volúmenes `habita3d-staging-*` |

No ejecutar ambos administradores sobre los mismos recursos ni intercambiar sus estados.
Las URLs son locales al computador que los ejecuta; sirven para proyectar la demo en clase.
No son URLs públicas accesibles desde los equipos de otras personas.

## 1. Arranque manual en Windows

Requisitos: Git; Docker Desktop iniciado en modo Linux; una versión actual de PowerShell.
Los contenedores incluyen Node/Python y aplican las migraciones al iniciar NestJS. Para
desarrollar sin contenedores, usar además Node de `.nvmrc` y Python 3.12+ según los manuales.

Desde PowerShell, en la raíz del clon actualizado:

```powershell
git pull --ff-only
./scripts/start-local.ps1
```

La primera ejecución crea `.env` a partir del ejemplo y genera credenciales aleatorias
localmente. No imprime sus valores. Si `.env` ya existe, se conserva: añadir las variables
nuevas del ejemplo, reemplazar los marcadores y conservar la contraseña de la base existente.
Cambiar `POSTGRES_PASSWORD` en un archivo no cambia automáticamente la contraseña guardada
en un volumen PostgreSQL que ya existe.

Para activar las tres franjas únicamente en el host encargado:

```powershell
./scripts/start-local.ps1 -EnableSchedule
```

La selección temporal del script no modifica `.env`. Para mantenerla en siguientes arranques,
establecer `MATERIALS_SCHEDULE_ENABLED=true` en ese archivo. NestJS coordina 08:00, 12:00 y
16:00 en `America/Santiago`. **No ejecutar además `python -m app.capture --schedule`:**
son dos programadores distintos y el de la aplicación es NestJS.

Activar el programador en una sola instalación: Compose o Terraform, nunca ambas a la vez.
El equipo debe permanecer encendido, conectado y sin suspensión durante las franjas.
No se prometen capturas mientras esté apagado. Las consultas de catálogo, historial y
presupuesto leen PostgreSQL y no lanzan solicitudes a las tiendas.

```powershell
./scripts/verify-local.ps1
docker compose ps
docker compose logs --tail 100 backend python-service
docker compose stop
```

`stop` conserva los volúmenes. Evitar `down -v` en la demo: elimina datos persistidos.

## 2. Variables y credenciales

| Nombre | Dónde se usa | Tipo / propósito |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `.env` de Compose | Credencial local; generar y conservar fuera de Git |
| `MATERIALS_API_TOKEN` | NestJS y FastAPI | Token interno compartido de al menos 24 caracteres; nunca Angular |
| `MATERIALS_SCHEDULE_ENABLED` | NestJS | `false` inicialmente; `true` solo en el host que captura |
| `APP_VERSION` / `IMAGE_TAG` | Compose | Commit que identifica la aplicación y sus imágenes |
| `TF_VAR_database_password` | Terraform | Credencial exclusiva del staging, mínimo 16 caracteres |
| `TF_VAR_materials_api_token` | Terraform | Token interno sensible, mínimo 24 caracteres |
| `TF_VAR_materials_schedule_enabled` | Terraform | Activar/desactivar las franjas de captura |

El endpoint `POST /api/captures` inicia una adquisición explícita con `X-Materials-Token`.
`POST /api/materials/import` importa una captura procesada con la misma protección. No
poner el token en una URL, una captura de pantalla, los logs ni el frontend. El historial
no contiene contraseñas o tokens. No se necesita contratar una API de pago.

La caché Python usa un volumen para conservar evidencia y la muestra estable. La base de
datos de la aplicación sigue siendo PostgreSQL, administrada por NestJS. Eliminar la caché
no debe usarse como mecanismo habitual para cambiar la muestra de publicaciones.

## 3. CI y pruebas de seguridad

El workflow `CI` mantiene los nombres anteriores de checks y añade:

- Migraciones y pruebas de persistencia contra PostgreSQL real del runner.
- Integración Docker con FastAPI real para el presupuesto y capturas **sintéticas de prueba**.
- Semgrep CE con reglas locales versionadas: ejecución de texto, SQL inseguro y TLS desactivado.
- Trivy sobre las cuatro imágenes runtime (incluida PostgreSQL); cualquier vulnerabilidad crítica, incluso sin
  corrección publicada, hace fallar el job. La base de vulnerabilidades se actualiza en cada
  ejecución; un resultado aprobado hoy no garantiza el de una ejecución futura.
- Un fallo controlado demuestra que el detector de secretos y el de código inseguro bloquean.

La imagen PostgreSQL conserva el motor y el flujo de arranque oficiales, sustituyendo
las llamadas al auxiliar `gosu` por `su-exec` y eliminando el binario anterior para retirar la vulnerabilidad crítica encontrada por el scanner.
El cambio verifica la bajada de privilegios durante el build; la base conserva su ruta
y formato originales. No se ignora el hallazgo.

Las reglas locales de SAST son una primera cobertura explícita, no una auditoría completa.
El job conserva auditorías npm/pip, Gitleaks, lint, pruebas, builds y Terraform. No se ocultan
hallazgos con `continue-on-error`; la instalación/descarga fallida de un scanner también
impide aprobar su job. El propietario debe exigir el nuevo check de SAST en la protección
de `main`, además de los que ya tenía configurados.

La prueba `scripts/ep2-smoke.py` es de solo lectura por defecto:

```powershell
python scripts/ep2-smoke.py --base-url http://127.0.0.1:8080
```

El modo `--disposable-fixtures` **solo se utiliza en una base desechable de pruebas**. Importa
fixtures marcados, simula variaciones y caídas, registra usuarios ficticios y prueba
aislamiento entre propietarios y presupuesto. No usarlo en el staging real ni presentarlo
como una comprobación en vivo de las tiendas. CI no accede a Sodimac o Easy.

Referencias de las herramientas: [Semgrep CE](https://semgrep.dev/docs/semgrep-ci/sample-ci-configs),
[opciones y códigos de salida](https://docs.semgrep.dev/cli-reference),
[Trivy Action](https://github.com/aquasecurity/trivy-action/tree/ed142fd0673e97e23eac54620cfb913e5ce36c25).

## 4. Preparar el despliegue desde GitHub al Windows del compañero

Esta preparación se hace **después** de integrar el bloque 2, con el propietario del
repositorio. No está realizada automáticamente por estos archivos.

1. Instalar Docker Desktop y Terraform 1.16.0; abrir Docker con el usuario que ejecutará el runner.
2. Crear `C:\Habita3D-staging` fuera del repositorio (ruta absoluta; el script rechaza rutas
   relativas o dentro del clon) y limitar su acceso en las propiedades de
   seguridad de Windows al operador y administradores. Contendrá estado, backups y referencias
   de despliegue: el estado de Terraform contiene credenciales en texto claro.
3. Crear en GitHub el environment **`habita3d-local`**, permitir únicamente la rama protegida
   `main` y configurar revisión/confirmación del responsable antes del despliegue.
4. En ese environment, crear los Secrets `STAGING_DATABASE_PASSWORD` y
   `STAGING_MATERIALS_API_TOKEN`. Deben ser credenciales propias del staging y mantenerse
   estables entre despliegues. Crear Variables opcionales `STAGING_STATE_DIRECTORY`
   (`C:\Habita3D-staging`), `STAGING_FRONTEND_PORT` (`18080`) y
   `STAGING_MATERIALS_SCHEDULE_ENABLED` (`false` al principio).
5. Registrar un runner **self-hosted Windows x64**, siguiendo las instrucciones que entrega
   GitHub en Settings → Actions → Runners. Añadir la etiqueta **`habita3d-staging`**. No guardar
   su token de registro en Git. Usar una sesión interactiva con PowerShell 7 y acceso a Docker
   Desktop; un servicio de Windows puede no acceder al Docker del usuario conectado.
6. Mantener ese runner dedicado exclusivamente a este despliegue. Los checks de PR se
   ejecutan en runners de GitHub; nunca asignar PR externos al computador personal.
7. Habilitar la Variable **del repositorio** `LOCAL_STAGING_ENABLED=true` cuando todo esté listo.
   Mientras falte o no sea `true`, CD queda omitido y no espera indefinidamente a un runner.

### Qué hace CD

`Deploy local staging` se dispara al terminar correctamente el workflow `CI` de un **push
de `main` del propio repositorio**. También acepta ejecución manual desde `main`, comprobando
que el mismo SHA tiene CI de push aprobada. Rechaza commits que ya no sean la cabeza de `main`.
No recibe artefactos o código de un PR no confiable.

Tras superar esa comprobación y la protección del environment, obtiene el SHA exacto,
construye las imágenes con esa etiqueta, revisa Terraform, respalda una base existente, aplica los cambios, deja que
NestJS aplique migraciones y espera salud. `verify-local.ps1` comprueba el frontend,
readiness de PostgreSQL/FastAPI, contrato de catálogo y estado de capturas. Solo entonces
registra `last-successful-commit.txt` fuera del clon.

El workflow no inicia una captura de las tiendas para verificar un despliegue: activar las
franjas o hacer una captura manual protegida es una decisión del operador. Un catálogo vacío
puede tener infraestructura saludable, pero no constituye evidencia de la demo con datos reales.

El acceso a GitHub del agente actual no equivale a permiso de administración de Fourdath
ni a acceso al equipo Windows. Hasta instalar el runner, las credenciales y probar un
despliegue allí, ese paso debe figurar como **pendiente externo**.

Referencias: [runner autohospedado](https://docs.github.com/en/actions/hosting-your-own-runners/adding-self-hosted-runners),
[eventos `workflow_run`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).

## 5. Operación, persistencia y recuperación

- Staging solo publica Nginx en loopback. PostgreSQL queda en red Docker interna; Python
  accede a las tiendas por la red de servicios, sin conectarse a la base.
- `GET /api/health` es liveness; `GET /api/health/ready` comprueba PostgreSQL y FastAPI.
  Un error de readiness bloquea el despliegue. `GET /api/captures/status` y
  `GET /api/materials/status` permiten ver intentos/fallos sin iniciar adquisición.
- Consultar los logs de los contenedores con `docker logs --tail 100 <nombre>` y seguir
  `X-Request-ID` entre NestJS y FastAPI. No publicar logs completos sin revisarlos.
- Conservar el estado de Terraform y las credenciales del staging. No compartir archivos
  `.tfstate`, `.tfvars`, planes o `.env` por GitHub ni como artefactos del workflow.
- El despliegue genera un backup `pg_dump -Fc` antes de migrar una base existente,
  comprueba que su índice es legible y lo copia al directorio protegido `backups/`. Si
  falla, detiene el despliegue. Si existe un volumen sin su contenedor, pide intervención
  para respaldarlo. La comprobación del índice no sustituye probar periódicamente una
  restauración en otra base. El volumen Docker no es un backup.

### Rollback

`previous-successful-commit.txt` permite identificar la última versión estable. Un fallo
de salud no ejecuta una reversión destructiva automática: conservar los logs y la base,
revisar si la migración aplicada es compatible y corregir o preparar un commit de reversión
en `main`. Ese commit debe superar CI y el mismo despliegue controlado.

Las migraciones son incrementales; no se ejecutan migraciones inversas inventadas ni
`prisma migrate reset` contra staging. Si se requiere restaurar el backup, hacerlo como
operación separada y autorizada, explicando qué datos posteriores se perderían. El rollback
de imágenes no implica que el esquema de la base haya retrocedido.

## 6. Evidencia que el equipo debe completar en Windows

- SHA desplegado, ejecución CI y ejecución CD aprobadas.
- Captura real manual/programada con resultado por fuente y última comprobación persistida.
- Reinicio conservando el catálogo, habitaciones, selección e historial.
- URL local mostrada en clase, readiness y una petición correlacionada en logs.
- Recorrido Angular integrado cuando termine el bloque 3; el health check no lo sustituye.
