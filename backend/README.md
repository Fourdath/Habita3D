# Backend de Habita3D

NestJS administra catálogo e historial, proyectos privados, habitaciones y
preferencias en PostgreSQL. FastAPI adquiere y valida datos, calcula presupuestos
y ordena sugerencias usando los últimos precios guardados. Angular consulta NestJS.

- [Sugerencias y confirmación de costo](../docs/final/contrato-sugerencias.md).
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
La credencial X-Materials-Token se usa en captura, importación y las llamadas
internas de procesamiento desde NestJS a FastAPI. La interfaz usa su sesión Bearer.
Swagger está disponible en /api/docs y OpenAPI en /api/docs-json.
Si un cliente llama desde otro origen, configurar API_ALLOWED_ORIGINS con una
lista explícita de orígenes permitidos separados por comas.

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
