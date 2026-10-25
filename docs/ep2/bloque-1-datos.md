# Bloque 1 EP2: datos, Python y FastAPI

Este manual explica cómo ejecutar el bloque de datos en el computador Windows que se usará
para la demostración. Las decisiones funcionales están en [los acuerdos EP2](acuerdos.md).
La implementación está en [`python-service/`](../../python-service).

**Actualización 25/10/2026:** la integración NestJS/PostgreSQL del bloque 2 ya está
implementada; consultar el [manual de backend](bloque-2-backend.md). Las referencias
a ese trabajo en el texto original describen su responsabilidad; la interfaz del
bloque 3 y la puesta en marcha en el Windows del compañero siguen pendientes.

## 1. Alcance y relación con la aplicación

El bloque incluye adaptadores de **Sodimac y Easy**, normalización y deduplicación, una muestra
estable de hasta **diez publicaciones por categoría y tienda**, cálculo de compras de pisos,
capturas manuales/programadas, métricas y evidencia local. Las categorías son cerámica para
piso (`ceramic`) y piso flotante laminado (`laminate`); se excluyen vinílicos/SPC y terceros.
La ubicación solicitada es La Florida, Región Metropolitana. No se eligió una sucursal física.

El servicio puede ejecutarse y probarse sin Figma, Angular, NestJS ni PostgreSQL. Figma contiene
el diseño; la aplicación que muestra las pantallas se ejecuta desde el código del repositorio.
Visual Studio Code sirve para editar ese código y abrir las terminales.

La demostración local prevista usa el computador del compañero, sin contratar un proveedor
cloud. Para mantener procesos y capturas debe permanecer encendido y sin suspensión.
La integración de datos con NestJS/PostgreSQL corresponde al **bloque 2** y su uso en las
pantallas/visor corresponde al **bloque 3**. El visor anterior conserva sus datos demostrativos
hasta que se conecten esos bloques; agregar este servicio no actualiza automáticamente la UI.

## 2. Preparación en Windows y PowerShell

Requisitos: repositorio descargado, conexión a Internet para instalar dependencias y realizar
capturas, y **Python 3.14**, versión utilizada por CI. `tzdata`, incluido en las dependencias,
proporciona la zona `America/Santiago` también en Windows.

En una terminal PowerShell de VS Code, reemplazar la primera ruta por la ubicación real:

```powershell
Set-Location "C:\ruta\Habita3D\python-service"
py -3.14 --version
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
```

Si PowerShell impide activar el entorno, pueden ejecutar cada comando con
`.\.venv\Scripts\python.exe` en lugar de `python`; no hace falta cambiar la política del equipo.

### Configuración local y token

Crear `.env` desde el ejemplo únicamente si no existe y sustituir el token de ejemplo por uno
generado localmente:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
python -c "from pathlib import Path; import secrets; p=Path('.env'); t=p.read_text(encoding='utf-8'); t=t.replace('replace-with-your-own-local-token-at-least-24-characters', secrets.token_urlsafe(32)); p.write_text(t, encoding='utf-8')"
```

El archivo contiene `MATERIALS_API_TOKEN` y `MATERIALS_DATA_DIR=data/materials`. El token debe
tener al menos 24 caracteres y no comenzar por `replace-`. `.env` y `python-service/data/`
están excluidos de Git; no se debe subir el token ni una copia del archivo al repositorio.
El token protege las operaciones HTTP de captura y consulta de estado, no es un usuario
de la aplicación ni una credencial de las tiendas.

## 3. Levantar FastAPI

Desde `python-service/`, con el entorno virtual activo:

```powershell
python -m uvicorn app.main:app --reload --env-file .env --host 127.0.0.1 --port 8000
```

- Documentación interactiva: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).
- Salud: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health).
- `Ctrl+C` detiene el servidor.

El comando escucha en el propio computador. Para la demo en ese equipo no se requiere exponer
el servicio a Internet. Abrir otra terminal para ejecutar las capturas sin detener FastAPI.

## 4. Captura manual desde la terminal

Los siguientes comandos **consultan las tiendas reales**. Revisar primero la documentación de
[Sodimac](sodimac-acceso.md) y [Easy](easy-acceso.md), que registra acceso, procedencia y límites.

```powershell
python -m app.capture --limit 10 --output data/captura.json
```

Intenta las dos categorías en ambas tiendas. `--limit` admite de 1 a 10; el máximo inicial
es cuarenta publicaciones. Para una comprobación pequeña o una única fuente:

```powershell
python -m app.capture --source sodimac --category ceramic --limit 2 --output data/prueba-sodimac.json
python -m app.capture --source easy --category laminate --limit 2 --output data/prueba-easy.json
```

Las opciones `--source` y `--category` se pueden repetir. Los valores admitidos son
`sodimac`/`easy` y `ceramic`/`laminate`. `--data-dir` permite seleccionar explícitamente la
carpeta de evidencia:

```powershell
python -m app.capture --data-dir data/materials --limit 10 --output data/captura.json
```

La CLI lee variables del entorno del proceso y sus argumentos; **no carga `.env`
automáticamente**. Su carpeta predeterminada coincide con la del ejemplo, `data/materials`.
Si se cambia `MATERIALS_DATA_DIR` en `.env`, usar la misma carpeta en la CLI con `--data-dir`
para que servidor y capturador compartan evidencia. La ejecución local de la CLI no necesita
el token HTTP.

### Cómo interpretar el resultado

La terminal muestra `run_id`, estado, cantidades actualizadas/conservadas y resultados por
grupo. `data/captura.json` contiene el contrato completo, incluidas publicaciones y fechas.

| Estado | Significado |
| --- | --- |
| `complete` | Todos los grupos solicitados obtuvieron una muestra utilizable sin publicaciones previas faltantes ni fallos de acceso. No significa que se haya capturado todo el catálogo de las tiendas. |
| `partial` | Se actualizaron publicaciones, pero algún grupo falló o parte de la muestra previa no se encontró. |
| `failed` | No se pudo actualizar ninguna publicación del intento. Los datos anteriores permanecen disponibles con sus fechas. |

El código de salida es `0` para captura completa y `2` para parcial/fallida. Una configuración
o un archivo local inválido produce salida `1`. Un proceso que ya está capturando produce
`skipped` con `capture_already_running`.

La primera captura elige una muestra determinista y prioriza publicaciones calculables.
Después intenta reencontrar **esa misma muestra** para mantener comparaciones e historial.
Una publicación que desaparece no se sustituye silenciosamente por otra. `--limit` determina
la muestra inicial de cada grupo; reducirlo después no elimina publicaciones ya conservadas
en esa carpeta de evidencia. Para ensayar otro tamaño sin alterar la muestra de la demo,
usar un `--data-dir` de prueba distinto.

## 5. Programación a las 08:00, 12:00 y 16:00

En una terminal dedicada, dentro de `python-service/`:

```powershell
python -m app.capture --schedule --limit 10 --data-dir data/materials --output data/captura.json
```

El proceso revisa cada minuto las tres franjas en **`America/Santiago`**, con ajuste de horario
de verano mediante la base de zonas horarias. La ventana de inicio abarca los primeros quince
minutos de cada hora: 08:00–08:14, 12:00–12:14 y 16:00–16:14. Una captura puede finalizar
después de esa ventana; el horario mostrado corresponde a la comprobación real.

Para una ejecución puntual que solo actúe dentro de una franja pendiente:

```powershell
python -m app.capture --due --limit 10 --data-dir data/materials --output data/captura.json
```

Fuera de ventana, o si esa franja ya se intentó en la misma carpeta de evidencia, devuelve
`skipped` y `no_pending_slot` sin consultar las tiendas. También se marca la franja si el
intento terminó con fallo: no se inicia otra tanda automática para esa misma franja. Esto
evita múltiples ejecuciones al mantener el proceso abierto o reiniciarlo dentro de la ventana.
El historial local recuerda hasta las mil ejecuciones y franjas más recientes.

El equipo debe tener hora correcta, conexión y el proceso abierto. Si está apagado, suspendido
o sin Internet, no podrá actualizar los precios. No recupera automáticamente franjas cuya
ventana ya pasó; puede hacerse una captura manual cuando vuelva la conexión. Abrir la app,
consultar un presupuesto o recordar una selección **no dispara capturas**. Cada tanda puede
requerir varias peticiones; tres tandas al día no equivale a tres peticiones HTTP.

## 6. API disponible para integrar los siguientes bloques

Los nuevos endpoints no llevan prefijo `/api`; dicho prefijo pertenece al backend NestJS.

| Método y ruta | Uso | Acceso y efectos |
| --- | --- | --- |
| `POST /materials/normalize` | Validar registros canónicos y eliminar duplicados del lote | Operación pura; no consulta tiendas ni guarda archivos. |
| `POST /materials/captures` | Ejecutar una captura explícita | Requiere `X-Materials-Token`; consulta fuentes y actualiza evidencia local. |
| `GET /materials/status` | Ver cantidades y estado del último intento | Requiere `X-Materials-Token`; no consulta tiendas ni devuelve un catálogo de aplicación. |
| `POST /floors/budget` | Calcular pisos por habitación y presupuesto global | Operación pura sobre los snapshots recibidos; no busca precios actuales. |

### Captura protegida desde PowerShell

En otra terminal, leer el token local sin imprimirlo y enviar la solicitud:

```powershell
$tokenLine = Get-Content .env | Where-Object { $_ -match '^MATERIALS_API_TOKEN=' } | Select-Object -First 1
$token = $tokenLine -replace '^MATERIALS_API_TOKEN=', ''
$headers = @{ 'X-Materials-Token' = $token }
$body = @{ sources = @('sodimac', 'easy'); categories = @('ceramic', 'laminate'); limit_per_category = 10 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/materials/captures' -Headers $headers -ContentType 'application/json' -Body $body
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/materials/status' -Headers $headers
```

En `/docs`, usar **Try it out** y completar `x-materials-token` en las operaciones protegidas.
Una credencial incorrecta devuelve `401`; token del servidor sin configurar, `503`; captura
simultánea, `409`; entrada que incumple el esquema, `422`.

### Normalización de registros

`POST /materials/normalize` recibe un objeto con `records` (1–200 diccionarios canónicos) y
`checked_at` ISO 8601 con zona, por ejemplo `2026-10-18T11:00:00Z`. Los campos canónicos son
los que entregan los adaptadores: `source`, `external_id`, `sku`, `seller`, `name`, `category`,
`product_url`, `currency`, `package_price`, `coverage_m2`, `sale_unit` y `availability`, más
metadatos opcionales de marca, imagen, promoción y evidencia.

La respuesta separa `publications`, `rejected` (índice y motivo) y `duplicate_records`.
No certifica que un dato enviado manualmente provenga de una captura real: la procedencia
debe conservarse desde el proceso de extracción.

### Números, precios y fechas

- Moneda única: CLP. `price_per_box_clp` y los costos son enteros JSON en pesos.
- Superficies y precios comparables por m² se calculan con `Decimal` y se serializan como
  cadenas decimales. Para consumirlos, evitar cálculos con cadenas o redondeos prematuros.
- El texto chileno `"15.980"` en un precio significa 15980 CLP; `"2.000"` en cobertura significa
  2 m², no 2000. Una dimensión de la pieza no permite inventar cobertura por caja.
- `price_per_m2_clp` se calcula dividiendo precio de caja por cobertura; puede diferir unos
  pesos del `reported_price_m2_clp` publicado y redondeado por la tienda.
- `comparable=false` indica cobertura/unidad insuficiente para comparar costo por superficie.
  Un precio inválido o ausente se rechaza; no se sustituye por cero ni por una cifra ficticia.
- `availability` es `available`, `unavailable` o `unknown`. Tener precio no confirma stock.
- `checked_at` conserva la fecha real con zona. `last_checked_display` usa
  **DD/MM/AAAA HH:MM**, 24 horas, en Chile. El presupuesto usa el campo `last_check_display`
  para su presentación equivalente.

### Presupuesto: contrato y ejemplo

El endpoint espera `rooms` (1–100 habitaciones con identificadores únicos) y un límite global
opcional `budget_clp`. Cada habitación admite área directa **o** largo y ancho, una publicación,
`waste_percent` de 0 a 100 (predeterminado 10) y límite de gasto opcional.

La publicación del presupuesto es un **subconjunto** del registro normalizado. Enviar solo
`publication_key`, `source`, `price_per_box_clp`, `coverage_per_box_m2`, `currency`, `price_type`,
`checked_at` y `availability`: el esquema rechaza campos extra. En el bloque 2, NestJS debe
seleccionar los últimos valores guardados con éxito y preparar este objeto.

**Ejemplo ficticio de contrato**, no corresponde a un SKU, precio capturado o disponibilidad
real. Puede pegarse en `POST /floors/budget` de `/docs` para comprobar el cálculo:

```json
{
  "budget_clp": 150000,
  "rooms": [
    {
      "room_id": "habitacion-demo",
      "area_m2": "12",
      "waste_percent": "10",
      "budget_clp": 150000,
      "publication": {
        "publication_key": "EJEMPLO-FICTICIO-REEMPLAZAR-POR-CLAVE-CAPTURADA",
        "source": "sodimac",
        "price_per_box_clp": 10000,
        "coverage_per_box_m2": "2",
        "currency": "CLP",
        "price_type": "public",
        "checked_at": "2026-10-18T11:00:00Z",
        "availability": "unknown"
      }
    }
  ]
}
```

Con esos valores ficticios: área necesaria 13,2 m², siete cajas, 14 m² comprados y costo
70000 CLP. La fórmula es:

```text
área necesaria = área × (1 + desperdicio / 100)
cajas = techo(área necesaria / cobertura por caja)
costo = cajas × precio por caja
```

El alcance es solo la compra de cajas de piso: no incluye instalación, adhesivos, transporte
ni otros materiales. Si falta precio o cobertura, la habitación devuelve `uncalculable` y
sus motivos. Si alguna habitación no es calculable, se entrega `calculable_subtotal_clp`,
pero el total final y el veredicto global de presupuesto quedan en `null`. No se muestra un
subtotal incompleto como si fuera el costo de todo el proyecto. La disponibilidad se informa
por separado y no se infiere del cálculo.

## 7. Evidencia local, historial y fallos

La carpeta configurada contiene `state.json`, un **caché de evidencia local**, no la base de
datos de producción de la aplicación. Conserva publicaciones, historial de precios/pack,
último intento y los identificadores recientes de ejecución/franja. La escritura usa archivo
temporal y reemplazo atómico. Un bloqueo `capture.lock` impide dos capturas simultáneas.

- Primer precio comprobado: crea un evento inicial de historial.
- Precio y envase iguales: actualiza la comprobación sin duplicar el historial de precios.
- Cambio de precio, cobertura real o unidad: agrega un evento; `2`, `2.0` y `2.000` de
  cobertura se consideran el mismo valor.
- Falla una fuente o falta una publicación: conserva sus valores **y fecha anteriores**.
  Puede actualizar las otras publicaciones exitosas; el resultado identifica las retenidas.
- El mismo `run_id` no se guarda otra vez dentro del registro reciente de ejecuciones.

`publications` del resultado puede contener tanto datos actualizados como retenidos;
`updated_publication_keys` y `retained_publication_keys` los distinguen. No usar el horario
del último intento para afirmar que todos los productos fueron comprobados en ese instante.
Este historial es de precios, **no versiones históricas de presupuestos**.

Si se interrumpe abruptamente el proceso y queda un bloqueo, comprobar primero que no hay
otra captura en ejecución. El archivo indica PID y fecha de inicio. Solo tras confirmarlo
corresponde retirar el bloqueo residual; no borrarlo mientras otro proceso trabaja.

## 8. Acceso acotado y trazabilidad

El cliente HTTP identifica el proyecto, admite únicamente HTTPS hacia los dos hosts acordados,
consulta `robots.txt` y respeta prohibiciones y pausas. Mantiene al menos cinco segundos entre
intentos del mismo host, incluso reintentos y robots. No cambia identidad para eludir rechazos,
no conserva sesiones personales y no sigue redirecciones automáticas.

Hay un máximo de **tres intentos por solicitud** ante errores temporales (dos reintentos),
con `Retry-After` para respuestas 429/5xx. Una espera indicada superior a 120 segundos difiere
la captura. Un 403 detiene el acceso al host durante ese intento de captura; no se reintenta
ni se elude. Si no puede comprobar robots, se detiene ese acceso. Cada respuesta está limitada
a 8 MiB y cada captura a ochenta solicitudes; cada grupo tienda/categoría consulta como máximo
tres páginas y se detiene antes si completa la muestra objetivo.

Las rutas observadas son usadas por los sitios y pueden cambiar; no se presentan como API
contractual para terceros. Los documentos de [Sodimac](sodimac-acceso.md) y
[Easy](easy-acceso.md) registran las condiciones revisadas y límites. Se conservan hechos
puntuales, precios y procedencia; no se descargan archivos de imágenes ni se redistribuyen
catálogos completos. La accesibilidad técnica o robots no equivale a una licencia de uso.

Los registros HTTP incluyen duración y `request_id`; la respuesta devuelve `X-Request-ID`.
Los resultados por grupo conservan páginas, URLs, advertencias y errores, sin mostrar tokens.

## 9. Métricas de calidad

Se calculan por grupo sobre las entradas realmente recibidas de las páginas consultadas:

| Campo | Definición |
| --- | --- |
| `retrieved_records` | Entradas recibidas antes de filtrar, incluidas las excluidas. |
| `excluded_records` | Fuera de categoría/vendedor admitido. |
| `rejected_records` | Candidatos que no cumplen la normalización. |
| `valid_records` | Candidatos válidos antes de deduplicar. |
| `duplicate_records` | Repeticiones de una publicación válida dentro del grupo. |
| `comparable_records` | Candidatos válidos con cobertura calculable, antes de deduplicar. |
| `selected_records` | Publicaciones distintas elegidas/reencontradas para actualizar. |

`validity_percent = valid_records × 100 / retrieved_records` y
`duplicates_percent = duplicate_records × 100 / retrieved_records`. Si no hubo registros,
los porcentajes son `null`. Por ejemplo, cinco recibidos con dos excluidos, uno rechazado
y dos válidos de los cuales uno se repite dan 40 % de validez, 20 % de duplicados y una
publicación seleccionada. Para un total global, **sumar primero los conteos de los grupos y
recalcular los porcentajes**; no promediar porcentajes con distintos denominadores.

Son medidas de validación técnica de una muestra acotada. No prueban inventario físico,
vigencia futura, cobertura total del catálogo ni precisión/exhaustividad de un buscador
contra un conjunto etiquetado.

## 10. Pruebas y evidencia de entrega

Desde `python-service/`, en el entorno virtual:

```powershell
python -m ruff check .
python -m pytest
python -m pip install pip-audit==2.10.1
python -m pip_audit -r requirements.txt
```

Las pruebas unitarias usan fixtures recortados y clientes/adaptadores falsos sin red: no
consultan tiendas al ejecutar `pytest`. Incluyen contratos, normalización, redondeo a cajas,
fallos y retención, historial, métricas, programación y protecciones del cliente HTTP. La
comprobación en vivo se ejecuta aparte con la CLI y conserva fechas reales.

Para registrar la evidencia de cada entrega, guardar o referenciar:

1. Commit probado, versiones del entorno y resultados de lint/pruebas/auditoría.
2. Fecha, comuna y resultado real por fuente/categoría; cantidades seleccionadas y retenidas.
3. Métricas del intento y limitaciones observadas, incluidos stock desconocido o acceso fallido.
4. Ejemplo de presupuesto con snapshots efectivamente capturados, distinto del ejemplo ficticio
   de este manual.
5. Enlace a la ejecución CI de ese commit, una vez terminada.

El número final de pruebas, el tamaño real capturado y el estado de CI deben anotarse con los
resultados de esa ejecución. La existencia de este manual no acredita por sí sola una captura
completa, una CI aprobada ni la integración pendiente de los bloques 2 y 3.

## Evidencia real de la validación inicial

La [medición versionada](evidencias/bloque-1-calidad.json) conserva identificadores,
fechas reales de las dos capturas manuales, conteos, cuatro ejemplos de procedencia
y una prueba del presupuesto FastAPI sobre esos precios capturados.

| Fuente / categoría | Recuperados | Válidos del alcance | Excluidos | Seleccionados |
| --- | ---: | ---: | ---: | ---: |
| Sodimac / cerámica | 48 | 38 | 10 | 10 |
| Sodimac / laminado | 49 | 31 | 18 | 10 |
| Easy / cerámica | 40 | 30 | 10 | 10 |
| Easy / laminado | 40 | 38 | 2 | 10 |
| **Total** | **177** | **137** | **40** | **40** |

No hubo rechazos de formato ni duplicados en esas páginas. Validez del alcance:
137/177 = 77,40 %; duplicados: 0/177 = 0 %. No son métricas de todo el catálogo ni
implican que un producto excluido esté mal publicado. Las cuarenta publicaciones
seleccionadas tenían precio y cobertura calculables; la disponibilidad local sigue
desconocida. Las condiciones/promociones se conservan separadas del precio público.

Se verificaron localmente 276 pruebas automatizadas, lint y el recorrido de los
datos capturados hacia `/floors/budget`. El contrato OpenAPI también se versiona en
[`python-service/contracts/openapi.json`](../../python-service/contracts/openapi.json).
La ejecución nativa en el computador Windows del compañero debe comprobarse allí;
la configuración horaria se probó con horario de verano e invierno de Chile.
