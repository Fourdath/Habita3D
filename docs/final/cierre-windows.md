# Cierre de Habita3D en Windows

**Responsable operativo: Matías Prado (`Fourdath`).** El repositorio ya contiene
el visor, el catálogo, las sugerencias, la PWA, Android y los workflows. El
objetivo es dejar una versión identificable, desplegada por GitHub Actions y
probada en el PC que se usará en clases. El staging ocupa
`http://127.0.0.1:18080` en ese equipo.

## 1. Preparar la versión y el runner

- [ ] Integrar los cambios que van a entregar y confirmar en GitHub la SHA
  completa del último commit de `main`. Si agregas Figma y el tablero al
  README antes del despliegue, esa actualización también debe quedar en `main`.
- [ ] Abrir Docker Desktop en modo de contenedores Linux. Comprobar que el
  usuario del runner tenga acceso a Docker y a PowerShell 7.2 o posterior.
  Mantener el equipo encendido, con red y sin suspensión durante CD.
- [ ] Crear o comprobar el environment `habita3d-local` y el runner
  autohospedado **Windows x64**, con la etiqueta `habita3d-staging`.
  Reservar el runner para el workflow de despliegue. Las pruebas de PR usan
  runners de GitHub.
- [ ] Crear una carpeta protegida para el estado de staging, fuera del clon,
  por ejemplo `C:\Habita3D-staging`. Mantenerla separada de los ensayos locales.
  Si la demo de Compose ocupa el puerto `18080`, detener ese proyecto Compose
  conservando sus datos antes de arrancar el staging Terraform. El APK del
  emulador usa `10.0.2.2:18080`.
- [ ] Configurar `STAGING_DATABASE_PASSWORD` y `STAGING_MATERIALS_API_TOKEN`
  como Secrets del environment. La contraseña requiere al menos 16 caracteres
  y el token, 24. Revisar las Variables de puerto, directorio y programación
  según el manual. Activar la Variable de **repositorio**
  `LOCAL_STAGING_ENABLED=true` cuando esté listo el runner.

[Configuración del runner, variables y secrets](../ep2/bloque-2-staging.md#4-preparar-el-despliegue-desde-github-al-windows-del-compañero) · [Workflow de CD](../../.github/workflows/deploy-local.yml)

## 2. Desplegar el commit aprobado

1. Confirmar que pasó la CI de **push a `main`** para la SHA que se va a
   entregar. El CD se activa al completarse esa CI. Si la ejecución quedó
   omitida mientras el entorno estaba deshabilitado, usar **Run workflow → main**
   en **Deploy local staging** después de configurarlo. El workflow comprueba
   la CI del commit exacto antes de usar el runner local.
2. Esperar el resultado exitoso del despliegue. Abrir el resumen de Actions y
   cotejar la SHA completa con el campo `commit` de
   `last-successful-deployment.json` en la carpeta protegida.
3. Desde PowerShell, comprobar el mismo staging. Copiar la SHA del resumen en
   `$sha` antes de ejecutar.

```powershell
$base = 'http://127.0.0.1:18080'
./scripts/verify-local.ps1 -BaseUrl $base -ExpectedVersion $sha -PassThru
Invoke-RestMethod "$base/api/health/recommendations"
```

**Resultado esperado.** GitHub Actions muestra CD exitoso, la salud informa
la misma SHA, PostgreSQL y FastAPI están disponibles y el diagnóstico del
recomendador responde `ok`. Conservar los enlaces de CI y CD, la latencia y el
identificador de la solicitud. Si falla una comprobación, corregir la causa y
repetir el despliegue antes de seguir.

[Manual de operación](operacion-windows.md#staging-por-github-actions) · [Verificación posterior al despliegue](../../scripts/verify-local.ps1)

## 3. Cargar el catálogo y comprobar la aplicación

- [ ] Ejecutar una [captura acotada](../ep2/bloque-2-backend.md#coordinación-de-capturas)
  desde el staging con la credencial de operador. Usar Sodimac y Easy, cerámica
  y laminado, y comenzar con dos publicaciones por combinación en La Florida.
  Registrar ID de la captura, fecha, estado, resultados por tienda, cantidad
  válida y limitaciones de disponibilidad. Si se habilita la programación,
  mantener un solo host para las franjas de 08:00, 12:00 y 16:00 de Chile.
- [ ] Preparar una cuenta ficticia y un proyecto con un **SVG compatible de
  CubiCasa ya guardado** y sus habitaciones vinculadas. Desde un recinto,
  consultar sugerencias, variar una preferencia y revisar cómo cambia el
  orden. Aplicar un piso y comprobar la textura orientativa, costo por cajas
  y persistencia al recargar. Dejar ese proyecto listo para abrirlo en clase.
- [ ] Repetir la comprobación breve en PWA instalada y Android en el emulador.
  En PWA, abrir el visor de ejemplo sin conexión tras la primera carga y
  comprobar que Proyectos se recupera al reconectar. En Android, probar acceso
  a la API del staging, sugerencia, presupuesto y recorrido con controles
  táctiles. Registrar SHA del código, dispositivo/API y hash de ese APK.
- [ ] Repetir dos o tres comparaciones entre el catálogo y el recomendador con
  los mismos precios, superficie y presupuesto. Usar el evaluador de solo
  lectura y registrar qué cambia y cuántas opciones caben en el límite.

| Caso de prueba | Resultado que debe observarse |
| --- | --- |
| Habitación de 12 m² con 10 % de margen y un presupuesto que admita las alternativas, sin preferencia declarada. | Registrar el primer piso del catálogo, las primeras sugerencias y el costo por cajas. |
| Misma habitación, mismos precios y presupuesto. Seleccionar un tipo de piso y una tienda presentes en la muestra. | La preferencia puede cambiar el orden de las publicaciones elegibles. Verificar que la razón coincida y que el piso guardado se conserve hasta aceptar. |
| Misma habitación con el límite por debajo del costo de la alternativa elegible más barata. | La primera opción minimiza el exceso y lo muestra explícitamente. |

[Manual de PWA y Android](plataformas-windows.md) · [Evaluación con datos de staging](operacion-bloque-1.md#preparar-datos-y-evaluación-de-la-demo)

## 4. Confirmar recuperación y conservar la evidencia

- [ ] Ensayar la indisponibilidad de FastAPI en una copia de prueba. Comprobar
  que la app muestra el aviso, devuelve `503` al consultar la recomendación y
  conserva el piso elegido. Reiniciar FastAPI y comprobar salud, sugerencias
  y presupuesto. Registrar la SHA y los resultados antes, durante y después.
- [ ] Verificar un respaldo del staging en un PostgreSQL aislado cuando exista
  una copia previa. Registrar restauración y conteos, y revisar qué versión
  estable puede recuperarse. Mantener el ensayo de rollback separado de la
  demo y conservar los volúmenes y respaldos del catálogo.
- [ ] Guardar un resumen con SHA, enlaces CI/CD, fecha, salud, captura,
  resultados de navegador/PWA/Android y recuperación. Usar solo cuentas y
  datos de proyecto ficticios. Mantener fuera de Git Secrets, estado y planes
  Terraform, archivos de respaldo, APK y sesiones. Publicar únicamente el
  resumen o evidencia revisada que pueda consultar la profesora.

[Recuperación y respaldo](operacion-windows.md#ensayo-de-recuperación) · [Evidencias de Windows](evidencias-windows.md)

## 5. Completar los enlaces y publicar la versión evaluable

- [ ] Enlazar en el README el **prototipo Figma** y el **tablero de gestión**.
  Comprobar que la profesora pueda abrirlos con el acceso previsto. Si los
  enlaces se agregan mediante un cambio que entra a `main` después del primer
  despliegue, validar la nueva SHA por CI/CD antes de etiquetarla.
- [ ] Compartir al equipo la SHA verificada y el resumen de evidencias.
  Coordinar con Cris la creación del tag o release sobre esa **misma SHA**.
  Adjuntar al release los enlaces de Actions y la evidencia para evitar
  cambiar el commit evaluable después de comprobarlo.
- [ ] Abrir en el PC de clases el staging con el plano precargado y comprobar
  que el proyecto, el catálogo real y las sugerencias están disponibles.
  Tener accesibles las ejecuciones de Actions, las pruebas, el estado de
  salud y la comprobación del fallo controlado.
