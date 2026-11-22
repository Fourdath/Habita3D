# Habita3D en Windows

## Arranque para desarrollo

Desde PowerShell, abre el clon de la versión que quieres verificar. Usa la versión de Node indicada en `.nvmrc` y Docker Desktop con contenedores Linux. Ejecuta `docker info --format '{{.OSType}}'` y comprueba que devuelva `linux`.

```powershell
./scripts/start-local.ps1
./scripts/verify-local.ps1 -BaseUrl http://127.0.0.1:8080
```

El entorno Compose publica el sitio en `http://127.0.0.1:8080` por defecto. La dirección del staging Terraform/CD es `http://127.0.0.1:18080` por defecto. Conserva los volúmenes y los archivos de configuración de cada instalación. El manual de EP2 describe cómo preparar un [runner exclusivo para el staging](../ep2/bloque-2-staging.md#4-preparar-el-despliegue-desde-github-al-windows-del-compañero).

## Verificación de la demo

1. En el navegador, entra en **Mis proyectos**. Registra una cuenta ficticia e inicia sesión. Crea un proyecto con presupuesto y una habitación con superficie. Vincula la habitación a un recinto del plano de ejemplo.
2. Comprueba que aparezcan las sugerencias de la API, revisa los motivos, las cajas y el costo. Cambia la preferencia de tienda o tipo y verifica que se actualicen las tarjetas. Si el costo cambió, confirma el nuevo monto antes de guardar. Prueba descartar una opción y desactivar las sugerencias. El catálogo y el presupuesto deben seguir disponibles.
3. Abre **Ver proyecto en 3D**. En **Apariencia del piso**, prueba un acabado y un color en el recinto vinculado. En **Cambiar producto del catálogo**, selecciona y guarda una publicación para actualizar el piso del proyecto y su presupuesto. Vuelve al proyecto y recarga para verificar la selección.
4. En el visor libre carga un SVG y luego abre el visor del proyecto. Comprueba que el piso corresponda al recinto del plano de ejemplo y vuelve al visor libre. En móvil comprueba los controles táctiles y la vista general con gestos.
5. Instala la PWA, espera que termine la primera carga y prueba el visor de ejemplo sin red. Comprueba el aviso de los flujos que requieren servidor y reintenta al reconectar. En Android instala el APK de depuración y repite inicio de sesión, habitaciones, sugerencias, presupuesto y visor en el mismo staging.

El precio estima cajas completas. El visor representa cada publicación con un material aproximado según su categoría y los acabados reconocibles en su nombre. Los cambios de **Apariencia del piso** duran mientras se usa el visor. Guardar un producto del catálogo conserva la selección y el presupuesto del proyecto. La disponibilidad «sin confirmar» indica que la fuente no confirmó el stock. La muestra está limitada a cerámica y laminado de Sodimac y Easy para La Florida.

## Staging por GitHub Actions

Coordina con Fourdath el environment `habita3d-local`, el runner `self-hosted` Windows x64 con etiqueta `habita3d-staging` y los Secrets/Variables del [manual de staging](../ep2/bloque-2-staging.md#4-preparar-el-despliegue-desde-github-al-windows-del-compañero). El workflow de CD solo despliega el `main` actual si la CI de push para esa SHA aprobó y el environment permite el despliegue. Usa una instalación local del runner con acceso a Docker Desktop y al directorio protegido de estado de Terraform. El registro del runner se hace con el token temporal emitido por el repositorio.

En el host ejecuta la verificación con la SHA completa que GitHub Actions registró:

```powershell
./scripts/verify-local.ps1 -BaseUrl http://127.0.0.1:18080 -ExpectedVersion '<SHA completa>'
```

Registra los enlaces de CI y CD, la SHA, el resultado de readiness y la URL local. El operador ejecuta la captura manual acotada coordinada con Cris y anota el identificador, la fecha, el resultado por tienda y el conteo. Las consultas del catálogo y del recomendador usan datos persistidos.

## Ensayo de recuperación

Coordina con Cris la versión estable, el respaldo, el momento del ensayo y qué entorno se interrumpe. Comprueba el respaldo con `pg_restore --list`. Restaura en una base separada mediante `pg_restore --exit-on-error` y compara el número de proyectos, habitaciones, selecciones y publicaciones con la base de origen. Conserva el staging original mientras se comprueba el respaldo.

Para el ensayo de Python en una copia Compose, abre un proyecto con un piso elegido y detén solo el servicio Python del proyecto Compose de prueba. Comprueba el aviso del presupuesto o de sugerencias, recarga el proyecto y verifica el piso guardado. Inicia de nuevo Python, comprueba readiness con `verify-local.ps1` y vuelve a consultar presupuesto y sugerencias. Anota el resultado antes, durante y después del fallo.

Para revertir el staging, usa el [procedimiento de rollback](../ep2/bloque-2-staging.md#rollback) con la versión estable acordada. Comprueba compatibilidad de migraciones antes de desplegar. Registra la SHA recuperada, la salud del entorno y el estado de los datos.
