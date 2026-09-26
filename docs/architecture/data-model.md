# Modelo inicial de datos

**Estado:** base implementada en el commit `97be109`; ampliación conceptual propuesta para las siguientes entregas. NestJS es dueño del esquema PostgreSQL mediante Prisma. Python no modifica sus tablas directamente.

## Tabla implementada

| Tabla | Clave | Atributos | Evidencia |
| --- | --- | --- | --- |
| `Project` | `id` entero autoincremental | `name` obligatorio, `createdAt`, `updatedAt` | [schema.prisma](../../backend/prisma/schema.prisma) y [migración inicial](../../backend/prisma/migrations/20260915050607_init_projects/migration.sql) |

La relación implementada hoy es solo `Project`; no existen aún tablas de usuarios, materiales, ofertas o recomendaciones. La API de proyectos expone creación y consulta. El despliegue debe ejecutar la migración antes de usar esta API; ese paso todavía no está automatizado.

## Modelo lógico propuesto

```mermaid
erDiagram
    USER ||--o{ PROJECT : owns
    PROJECT ||--o{ PROJECT_SELECTION : contains
    MATERIAL ||--o{ PROJECT_SELECTION : selected_for
    SUPPLIER ||--o{ MATERIAL_OFFER : publishes
    MATERIAL ||--o{ MATERIAL_OFFER : has
    PROJECT ||--o{ RECOMMENDATION : receives

    USER {
        uuid id PK
        string email UK
        string password_hash
        string role
    }
    PROJECT {
        int id PK
        uuid user_id FK
        string name
        datetime created_at
        datetime updated_at
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
        string source_url
    }
    MATERIAL_OFFER {
        uuid id PK
        uuid material_id FK
        uuid supplier_id FK
        decimal price_clp
        string availability
        datetime retrieved_at
    }
    PROJECT_SELECTION {
        uuid id PK
        int project_id FK
        uuid material_id FK
        decimal quantity
    }
    RECOMMENDATION {
        uuid id PK
        int project_id FK
        string explanation
        datetime created_at
    }
```

Este diagrama **no corresponde a migraciones existentes**. Sirve para justificar el crecimiento del modelo: ofertas separadas de materiales permiten guardar precio, disponibilidad y fecha por proveedor; selecciones relacionan terminaciones con un proyecto; recomendaciones conservan una explicación. Antes de implementarlo se revisarán cardinalidades, permisos, restricciones e índices con los contratos finales de la API y la fuente web elegida.
