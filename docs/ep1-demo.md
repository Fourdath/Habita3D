# Guía de demostración de EP1

Esta guía reúne evidencia reproducible para la entrega parcial 1. Use un equipo
con Docker y el repositorio actualizado. La comparación de terminaciones tiene
**precios ilustrativos**, sin consulta de disponibilidad o precios web.

## 1. Preparar el entorno y mostrar la aplicación

Desde la raíz del repositorio:

```sh
cp .env.example .env
# Reemplace POSTGRES_PASSWORD en .env por una contraseña local única.
docker compose config
docker compose up --build -d --wait --wait-timeout 180
bash scripts/ep1-smoke.sh
```

`docker compose config` comprueba la configuración; `up --wait` espera los
health checks. El script verifica que el frontend responde, registra un usuario,
consulta y cierra su sesión, obtiene una vista previa mediante
Nginx → NestJS → FastAPI → PostgreSQL, lee el proyecto persistido y
comprueba una solicitud inválida con HTTP 400. Al terminar debe imprimir:

```text
EP1 smoke test: frontend, NestJS, FastAPI, PostgreSQL, auth and validation passed.
```

La prueba crea usuarios y proyectos de demostración. Conserva el volumen de datos
entre ejecuciones. Para detener sin eliminarlo use `docker compose down`.
El 28-09-2026 se ejecutaron localmente la construcción, el arranque con `--wait`,
este script, el formulario real en el navegador y la navegación al visor 3D.

Abra <http://127.0.0.1:8080>. En la página de inicio ingrese, por ejemplo,
`Vivienda piloto`, `50` m² y `13000000` CLP. La vista previa debe mostrar un
proyecto guardado y nivel `standard`, costo estimado de `13000000` CLP y origen
demostrativo. Abra el visor 3D, cambie terminaciones y compruebe la página de
inicio y la navegación en un ancho de pantalla móvil. El recorrido en primera
persona del visor aún usa teclado y ratón. El presupuesto del visor se calcula localmente;
la vista previa de la página de inicio es el flujo HTTP integrado de EP1.

## 2. Mostrar fallos controlados

Una entrada inválida debe devolver 400 por la validación de NestJS:

```sh
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  --header 'content-type: application/json' \
  --data '{"name":"","areaM2":0,"budgetClp":-1}' \
  http://127.0.0.1:8080/api/projects/preview
```

Para comprobar la respuesta al fallo de la dependencia Python, deténgala
temporalmente, envíe una solicitud válida y vuelva a iniciarla:

```sh
docker compose stop python-service
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  --header 'content-type: application/json' \
  --data '{"name":"Prueba de error","areaM2":50,"budgetClp":13000000}' \
  http://127.0.0.1:8080/api/projects/preview
docker compose start python-service
```

La segunda respuesta debe ser 503. NestJS no guarda un proyecto si FastAPI no
entrega una comparación válida. Si desea repetir la prueba de humo tras la
recuperación, espere a que Python vuelva a estar sano y ejecute
`bash scripts/ep1-smoke.sh`.

## 3. Mostrar que el pipeline detiene un error

La [CI](../.github/workflows/ci.yml) ejecuta lint, pruebas, builds, auditorías
de dependencias, análisis de secretos, construcción y prueba integrada de
Compose, y `terraform fmt`, `validate` y `plan`. El control adicional
[`check-tracked-secrets.py`](../scripts/check-tracked-secrets.py) rechaza archivos
de credenciales versionados. Su prueba de fallo controlado crea un repositorio
temporal, agrega allí un `.env` ficticio y confirma que el control termina con
código de error:

```sh
python3 scripts/security-gate-self-test.py
```

La salida esperada es `Controlled failure passed: the security gate blocked a
tracked .env file.`. Esa prueba no añade secretos al repositorio Habita3D. En
GitHub, una verificación fallida solo impide integrar el cambio si `main` tiene
activada una regla que exija los checks de CI. La regla se configura en los
ajustes del repositorio; debe verificarse con la cuenta administradora antes
de la entrega.

## 4. Mostrar staging preliminar y cerrar la entrega

El [staging local](../infrastructure/terraform/README.md) define proveedor,
imágenes, redes, contenedores, volumen, variables y salidas. En CI se valida el
plan, sin `apply`. Para una revisión local, siga los comandos de esa guía con
Docker activo y una contraseña **ficticia solo para el plan**. No presente la
URL de salida como un despliegue existente: no se ha aplicado la infraestructura.

Antes de entregar, compruebe estos elementos fuera del código:

| Elemento | Evidencia que debe adjuntar o comprobar el equipo |
| --- | --- |
| Pull request revisada | Enlace a la PR, revisión de un integrante y checks verdes. |
| Protección de `main` | Regla que requiera PR y verificaciones de CI antes de integrar cambios. |
| Versión evaluable | Tag o release de GitHub que identifique exactamente el commit entregado. |
| Figma | Enlace real al prototipo del equipo; **aún no está en el repositorio**. |
| Demostración | Capturas o video del visor, formulario, resultado, error 400/503, CI y plan Terraform. |

Estos ajustes externos no se deducen de un `terraform plan` ni de un build verde;
verifique su estado en GitHub y en Figma antes de declarar la EP1 completa.
