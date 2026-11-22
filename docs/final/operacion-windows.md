# Habita3D en Windows

## Arranque para desarrollo

Desde PowerShell, abre el clon de la versión que quieres verificar. Usa la versión de Node indicada en `.nvmrc` y Docker Desktop con contenedores Linux. Ejecuta `docker info --format '{{.OSType}}'` y comprueba que devuelva `linux`.

```powershell
./scripts/start-local.ps1
./scripts/verify-local.ps1 -BaseUrl http://127.0.0.1:8080
```

El entorno Compose publica el sitio en `http://127.0.0.1:8080` por defecto. La dirección del staging Terraform/CD es `http://127.0.0.1:18080` por defecto. Conserva los volúmenes y los archivos de configuración de cada instalación. El manual de EP2 describe cómo preparar un [runner exclusivo para el staging](../ep2/bloque-2-staging.md#4-preparar-el-despliegue-desde-github-al-windows-del-compañero).

## Verificación de la demo

1. En el navegador, entra en **Mis proyectos**. Registra una cuenta ficticia e inicia sesión. Crea un proyecto con presupuesto y sube un SVG de CubiCasa de hasta 1 MB en **Plano de tu proyecto**. El visor se abre con ese archivo. Un proyecto vacío incorpora sus recintos y superficies. Si ya hay habitaciones, vincúlalas desde el editor de cada habitación.
2. Comprueba que aparezcan las sugerencias de la API, revisa los motivos, las cajas y el costo. Cambia la preferencia de tienda o tipo y verifica que se actualicen las tarjetas. Si el costo cambió, confirma el nuevo monto antes de guardar. Prueba descartar una opción y desactivar las sugerencias. El catálogo y el presupuesto deben seguir disponibles.
3. Abre **Ver proyecto en 3D** y toca un piso para seleccionar su recinto. En **Cambiar producto del catálogo**, guarda la misma publicación en toda la casa o una distinta en la habitación seleccionada. La opción de toda la casa crea los recintos que falten en el proyecto y conserva las áreas registradas. El costo se calcula en cajas completas por habitación con precios guardados de las tiendas. Recarga para comprobar la selección.
4. En el visor libre carga un SVG y luego abre el visor del proyecto. Comprueba que el piso corresponda al recinto del plano de ejemplo y vuelve al visor libre. En móvil comprueba los controles táctiles y la vista general con gestos.
5. Instala la PWA, espera que termine la primera carga y prueba el visor de ejemplo sin red. Comprueba el aviso de los flujos que requieren servidor y reintenta al reconectar. En Android instala el APK de depuración y repite inicio de sesión, habitaciones, sugerencias, presupuesto y visor en el mismo staging.

En el visor, prueba los estilos **Mediterráneo** y **Contemporáneo** con sus fachadas. Abre **Color de muros interiores** para pintar el recinto seleccionado o toda la casa. Pulsa **Planchas** para ver las caras de yeso-cartón ST, yeso-cartón RH y fibrocemento, con una cuadrícula del formato comercial. El precio de planchas y revestimientos es demostrativo. Sus cantidades proceden del plano.

El precio estima cajas completas. El visor representa cada publicación con un material aproximado según su categoría y los acabados reconocibles en su nombre. Los cambios de **Apariencia del piso** duran mientras se usa el visor. Guardar un producto del catálogo conserva la selección y el presupuesto del proyecto. La disponibilidad «sin confirmar» indica que la fuente no confirmó el stock. La muestra está limitada a cerámica y laminado de Sodimac y Easy para La Florida.

## Ensayo local de despliegue antes del push

Usa PowerShell 7.2 o posterior, Docker Desktop en modo Linux y Terraform. Ejecuta desde el checkout del commit que quieres probar. Crea un directorio de estado dedicado fuera del repositorio, con acceso limitado al operador. Utiliza credenciales distintas a las del staging del equipo. Conserva esas credenciales durante todo el ensayo para poder repetir el despliegue y verificar su respaldo.

```powershell
$estadoEnsayo = Join-Path ([IO.Path]::GetTempPath()) 'Habita3D-cd-rehearsal'
New-Item -Path $estadoEnsayo -ItemType Directory -Force | Out-Null
$env:TF_VAR_database_password = Read-Host 'Contraseña de la base del ensayo (mínimo 16 caracteres)' -MaskInput
$env:TF_VAR_materials_api_token = Read-Host 'Token interno del ensayo (mínimo 24 caracteres)' -MaskInput
$versionEnsayo = (git rev-parse HEAD).Trim()
./scripts/deploy-windows.ps1 -Rehearsal -StateDirectory $estadoEnsayo -Version $versionEnsayo
```

Abre `http://127.0.0.1:18083` y prueba el flujo de la demo. El ensayo usa contenedores, imágenes, redes, volúmenes y estado propios. La comprobación mide el tiempo de readiness y emite un aviso por encima de 2000 ms. `last-successful-deployment.json` registra la SHA, los servicios y el ID de solicitud para consultar los logs.

Repite el comando de despliegue con la misma SHA para comprobar el respaldo previo de la base existente. Verifica el archivo en un contenedor PostgreSQL desechable:

```powershell
./scripts/verify-staging-backup.ps1 -StateDirectory $estadoEnsayo -PassThru
```

`last-verified-restore.json` registra el SHA-256 del respaldo y los conteos de la base restaurada. Conserva el estado y los archivos `.dump` en el directorio protegido. Usa los reportes JSON de verificación como evidencia del ensayo.

## Staging por GitHub Actions

Coordina con Fourdath el environment `habita3d-local`, el runner `self-hosted` Windows x64 con etiqueta `habita3d-staging` y los Secrets/Variables del [manual de staging](../ep2/bloque-2-staging.md#4-preparar-el-despliegue-desde-github-al-windows-del-compañero). El workflow de CD solo despliega el `main` actual si la CI de push para esa SHA aprobó y el environment permite el despliegue. Usa una instalación local del runner con acceso a Docker Desktop y al directorio protegido de estado de Terraform. El registro del runner se hace con el token temporal emitido por el repositorio. Libera el puerto asignado antes del primer CD si la demo de Compose lo está usando. La configuración de Android debe apuntar al puerto que se elija para staging.

En el host ejecuta la verificación con la SHA completa que GitHub Actions registró:

```powershell
./scripts/verify-local.ps1 -BaseUrl http://127.0.0.1:18080 -ExpectedVersion '<SHA completa>'
```

El resumen de GitHub Actions y el reporte local `last-successful-deployment.json` registran los enlaces de CI y CD, la SHA, la URL local, la salud y la latencia de readiness. La Variable de GitHub `STAGING_READINESS_WARNING_MS` permite ajustar el umbral del aviso. El operador ejecuta la captura manual acotada coordinada con Cris y anota el identificador, la fecha, el resultado por tienda y el conteo. Las consultas del catálogo y del recomendador usan datos persistidos.

Para consultar el log de NestJS asociado a una comprobación, usa el directorio del entorno que verificaste:

```powershell
$estado = 'C:\Habita3D-staging'
$evidencia = Get-Content -Raw (Join-Path $estado 'last-successful-deployment.json') | ConvertFrom-Json
docker logs "$($evidencia.prefix)-backend" | Select-String -SimpleMatch $evidencia.health.readinessRequestId
```

## Ensayo de recuperación

Coordina con Cris la versión estable, el respaldo, el momento del ensayo y qué entorno se interrumpe. Ejecuta `verify-staging-backup.ps1` con el directorio de estado protegido para comprobar el último respaldo generado por CD y restaurarlo en un contenedor aislado. Compara los conteos del reporte con los de la base al momento del respaldo.

Para el ensayo de Python en una copia Compose, abre un proyecto con un piso elegido y detén solo el servicio Python del proyecto Compose de prueba. Comprueba el aviso del presupuesto o de sugerencias, recarga el proyecto y verifica el piso guardado. Inicia de nuevo Python, comprueba readiness con `verify-local.ps1` y vuelve a consultar presupuesto y sugerencias. Anota el resultado antes, durante y después del fallo.

Para revertir el staging, conserva el respaldo, consulta `previous-successful-commit.txt` y comprueba con Cris la compatibilidad del esquema con la versión estable. Si el equipo decide revertir código, el commit de reversión pasa por CI en `main` y por el mismo CD protegido. Registra la SHA recuperada, la salud del entorno y el estado de los datos. [Procedimiento de rollback](../ep2/bloque-2-staging.md#rollback)
