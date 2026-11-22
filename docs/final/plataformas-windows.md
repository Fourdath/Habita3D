# PWA y Android en Windows

La dirección prevista del staging es `http://127.0.0.1:18080`. El navegador usa el mismo origen para `/api`. La PWA necesita un origen seguro y funciona en el loopback del PC. El APK de depuración accede al mismo puerto mediante el alias `10.0.2.2` del emulador. Mantener el proxy de staging enlazado al loopback de Windows. [Red del emulador](https://developer.android.com/studio/run/emulator-networking-address)

El 22 de noviembre de 2026 se completó un ensayo manual con el checkout `57c423252fcaf6ca914719e01533478e371de89c`. Para la entrega, repetir la validación de plataformas cuando se despliegue por CD la SHA elegida en `main`. La sección de evidencias conserva las pruebas de ese ensayo y el estado de CD de la integración. [Evidencia en Windows](evidencias-windows.md)

## PWA

1. Abrir el staging en Chrome o Edge y esperar que se active el service worker. En Herramientas de desarrollo, **Application → Service Workers** muestra su estado y **Manifest** permite revisar el nombre, el modo independiente y los iconos.
2. Instalar Habita3D desde la barra de direcciones o el menú de aplicaciones del navegador. Abrir la ventana instalada y volver al inicio.
3. Desconectar la red desde **Application → Service Workers → Offline**. Recargar la aplicación y abrir el visor libre desde el inicio. Verificar el plano de ejemplo, la vista general y la interacción con el visor. Las tipografías tienen alternativas del sistema cuando Google Fonts queda fuera de alcance.
4. Abrir Proyectos, comprobar el aviso de conexión y volver al inicio. Reactivar la red, reintentar y comprobar acceso con una cuenta de prueba.
5. Al desplegar un nuevo build, abrir otra vez la aplicación para que consulte su versión. Cuando aparezca el aviso, guardar el trabajo y pulsar **Actualizar**. La recarga cambia el conjunto de archivos estáticos como una unidad. [Actualizaciones del service worker](https://angular.dev/ecosystem/service-workers/communications)

El service worker precarga el inicio, el código del visor y los recursos públicos de la demo después de la primera visita. Proyectos, precios, sugerencias, sesiones y llamadas a `/api` requieren el servidor. La primera instalación del worker depende de que termine la descarga de los recursos de la demo. [Configuración de caché](https://angular.dev/ecosystem/service-workers/config)

En el ensayo manual, Chrome instaló y abrió Habita3D en una ventana independiente. El inicio y el plano de ejemplo se abrieron sin red. Proyectos mostró el aviso de sesión sin conexión y recuperó el proyecto al reconectar y reintentar. Un build anterior, probado de forma aislada, verificó el aviso de actualización y su recarga. Las capturas quedaron en `.local/platform/evidence/`.

## Android con Capacitor

### Requisitos del proyecto nativo

- Node de `.nvmrc`, JDK 21, Android SDK Platform 36, Platform-Tools, Emulator y una imagen Android 36 con aceleración disponible en Windows. Android Studio puede proporcionar el SDK y su propio JDK compatible. [Entorno Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup) · [Aceleración del emulador](https://developer.android.com/studio/run/emulator-acceleration)
- Configurar `JAVA_HOME` y `ANDROID_HOME` en la sesión o abrir `frontend/android` en Android Studio con el SDK configurado.
- Iniciar un dispositivo virtual en **Device Manager**. El emulador debe poder abrir `http://10.0.2.2:18080/api/health` en su navegador antes de probar el APK.

En el PC de la demo se prepararon el JDK, el SDK y el dispositivo `Habita3D_API_36` dentro de `.local/platform/`, sin cambiar las variables globales de Windows. Para abrir ese dispositivo sin Android Studio, ejecutar desde la raíz del clon en una sesión dedicada de PowerShell.

```powershell
$platform = (Resolve-Path .\.local\platform).Path
$env:JAVA_HOME = (Get-ChildItem -LiteralPath (Join-Path $platform 'jdk') -Directory | Select-Object -First 1 -ExpandProperty FullName)
$env:ANDROID_HOME = Join-Path $platform 'android-sdk'
$env:ANDROID_USER_HOME = Join-Path $platform 'android-user'
$env:ANDROID_AVD_HOME = Join-Path $env:ANDROID_USER_HOME 'avd'
$env:GRADLE_USER_HOME = Join-Path $platform 'gradle'
& (Join-Path $env:ANDROID_HOME 'emulator\emulator.exe') -avd Habita3D_API_36
```

El emulador mantiene ocupada esa terminal mientras está abierto. Para compilar desde una segunda terminal, definir allí las variables anteriores.

Desde PowerShell, en la raíz del repositorio

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd run android:sync
Set-Location android
.\gradlew.bat :app:assembleDebug
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
& $adb devices
& $adb -e install -r .\app\build\outputs\apk\debug\app-debug.apk
& $adb -e shell am start -n com.habita3d.app/.MainActivity
```

El APK queda en `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. El perfil `android-staging` compila la interfaz dentro del APK y usa el puente HTTP nativo de Capacitor para llegar al staging. La excepción HTTP del manifiesto de depuración admite exclusivamente `10.0.2.2`. Si cambia el puerto de staging, ajustar el origen de `frontend/src/environments/environment.android-staging.ts` y volver a sincronizar. Este perfil es para el emulador y cuentas ficticias de la demo. [Instalación de Android con Capacitor](https://capacitorjs.com/docs/android) · [HTTP nativo](https://capacitorjs.com/docs/apis/http)

En el emulador, probar inicio de sesión, proyecto, habitación, sugerencias, presupuesto, visor y rotación de pantalla. Verificar la operación táctil en primera persona y la vista general con gestos.

El 22 de noviembre, un APK inicial se compiló con Gradle y se instaló en el emulador API 36. La aplicación abrió sesión contra la demo de Windows, creó un proyecto y una habitación, guardó un piso y mostró cinco cajas por $85.405. Al recargar conservó el piso y lo aplicó al recinto del plano en el visor. Se probó el recorrido en primera persona con arrastre y avance táctil, el retorno a la vista general y el giro de pantalla. En esa primera prueba la pantalla de sugerencias mostró el aviso de servicio no disponible, ya que los endpoints adaptativos aún no estaban integrados en la demo.

En el ensayo posterior con el contrato integrado, `Habita3D_API_36` mostró sugerencias del catálogo persistido, guardó un laminado de Easy de seis cajas por $201.456 y conservó el piso al recargar. Las capturas y el hash del APK de ese ensayo están inventariados en las evidencias de Windows. [Resultados del ensayo](evidencias-windows.md)

### Evidencia de la versión final

Registrar fecha, navegador o dispositivo, API de Android, SHA del código de cada cliente y SHA que informa `/api/health/ready` en staging. Guardar el resultado y las capturas de cada recorrido, incluida la apertura sin red de la PWA y una sugerencia guardada después de recargar en Android. Calcular el SHA-256 del APK que se instaló con `Get-FileHash -Algorithm SHA256` y asociarlo al emulador y al resultado.
