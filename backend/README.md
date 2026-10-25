# Backend de Habita3D

API NestJS y PostgreSQL/Prisma del bloque 2 de EP2. Administra catálogo e historial,
proyectos privados, habitaciones y presupuestos con los últimos precios guardados.
FastAPI adquiere/procesa los datos y calcula las cantidades; Angular consumirá estas APIs.

- [Manual de endpoints y contratos](../docs/ep2/bloque-2-backend.md).
- [Modelo de datos](../docs/architecture/data-model.md).
- [Arranque local y despliegue Windows](../docs/ep2/bloque-2-staging.md).
- [Evidencias y límites](../docs/ep2/evidencias/bloque-2-validacion.md).

## Desarrollo

Usar Node de `.nvmrc` y una base PostgreSQL propia de desarrollo. Configurar
`DATABASE_URL`, `PYTHON_SERVICE_URL` y la credencial interna `MATERIALS_API_TOKEN`
fuera de Git. El programador permanece desactivado salvo que el operador establezca
`MATERIALS_SCHEDULE_ENABLED=true` en la instalación encargada de capturar.

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

`/api/health` comprueba liveness y `/api/health/ready` comprueba PostgreSQL y FastAPI.
Las rutas EP2 privadas usan la sesión Bearer; catálogo e historial son de lectura.
Capturar/importar exige `X-Materials-Token`. No enviar esa credencial al navegador.

## Verificación

```sh
npm run lint
npm test
npm run test:e2e
npm run build
```

Para las pruebas de persistencia real, aplicar las migraciones en una base
**desechable de prueba** y establecer `RUN_DATABASE_TESTS=true` antes del comando
e2e. CI lo configura en su propio PostgreSQL. Ninguna prueba determinista consulta
a las tiendas; el smoke con FastAPI real se ejecuta desde la raíz del repositorio.
