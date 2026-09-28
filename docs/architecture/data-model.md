# Modelo de datos de Habita3D

**Estado de EP1:** las tablas `Project`, `User` y `Session` están definidas en
[Prisma](../../backend/prisma/schema.prisma) y sus
[migraciones](../../backend/prisma/migrations/). NestJS es dueño del esquema
PostgreSQL; FastAPI no escribe directamente en la base. El contenedor de NestJS
ejecuta `prisma migrate deploy` antes de iniciar la API.

## Modelo implementado

| Tabla | Clave y relación | Datos principales | Uso en EP1 |
| --- | --- | --- | --- |
| `Project` | `id` entero autoincremental | `name`, `createdAt`, `updatedAt` | `GET/POST /api/projects`; la vista previa crea un proyecto después de recibir una comparación válida. |
| `User` | `id` entero autoincremental; `email` único | `email`, `passwordHash`, `createdAt`, `updatedAt` | Registro e inicio de sesión. La contraseña no se almacena en texto claro. |
| `Session` | `tokenHash` como clave primaria; `userId` referencia a `User` con eliminación en cascada | `createdAt`, `expiresAt` | Consulta y cierre de sesión con token Bearer; el token en claro no se guarda en la base. |

```mermaid
erDiagram
    USER ||--o{ SESSION : has
    USER {
        int id PK
        string email UK
        string passwordHash
        datetime createdAt
        datetime updatedAt
    }
    SESSION {
        string tokenHash PK
        int userId FK
        datetime createdAt
        datetime expiresAt
    }
    PROJECT {
        int id PK
        string name
        datetime createdAt
        datetime updatedAt
    }
```

`Project` **no tiene todavía `userId` ni relación con `User`**. Las rutas de
proyectos siguen siendo públicas; la autenticación básica de EP1 no equivale a
autorización por propietario. La recomendación calculada por FastAPI se devuelve
en la respuesta de vista previa, pero no se persiste.

## Evolución propuesta, sin migraciones todavía

```mermaid
erDiagram
    USER ||--o{ PROJECT : owns
    PROJECT ||--o{ PROJECT_SELECTION : contains
    MATERIAL ||--o{ PROJECT_SELECTION : selected_for
    SUPPLIER ||--o{ MATERIAL_OFFER : publishes
    MATERIAL ||--o{ MATERIAL_OFFER : has
    PROJECT ||--o{ RECOMMENDATION : receives

    USER {
        int id PK
        string email UK
    }
    PROJECT {
        int id PK
        int userId FK
        string name
        datetime createdAt
        datetime updatedAt
    }
    MATERIAL {
        uuid id PK
        string name
        string category
        string unit
    }
    SUPPLIER {
        uuid id PK
        string name
        string sourceUrl
    }
    MATERIAL_OFFER {
        uuid id PK
        uuid materialId FK
        uuid supplierId FK
        decimal priceClp
        string availability
        datetime retrievedAt
    }
    PROJECT_SELECTION {
        uuid id PK
        int projectId FK
        uuid materialId FK
        decimal quantity
    }
    RECOMMENDATION {
        uuid id PK
        int projectId FK
        string explanation
        datetime createdAt
    }
```

Este segundo diagrama expresa la dirección del producto, **no tablas existentes**.
Separar ofertas de materiales permitiría registrar proveedor, precio,
disponibilidad y fecha de captura. Las selecciones relacionarían terminaciones
con proyectos y las recomendaciones conservarían su explicación. Antes de
implementarlo deben definirse permisos, política de retención, restricciones,
índices y contratos con las fuentes web autorizadas.
