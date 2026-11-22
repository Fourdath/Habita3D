const refs = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ 'application/json': { schema } });
const response = (description: string, schema: object) => ({
  description,
  content: json(schema),
});
const request = (name: string) => ({
  required: true,
  content: json(refs(name)),
});
const string = { type: 'string' };
const nonnegative = { type: 'integer', minimum: 0 };
const nullable = (type: string) => ({ type, nullable: true });
const boolean = { type: 'boolean' };
const dateTime = { ...string, format: 'date-time' };
const key = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const quoteId = {
  type: 'string',
  pattern: '^[A-Za-z0-9_-]{43}\\.[A-Za-z0-9_-]{43}$',
};
const category = { ...string, enum: ['ceramic', 'laminate'] };
const source = { ...string, enum: ['sodimac', 'easy'] };
const pathParameter = (name: string, schema: object) => ({
  name,
  in: 'path',
  required: true,
  schema,
});
const projectId = pathParameter('id', {
  type: 'integer',
  minimum: 1,
  maximum: 2147483647,
});
const roomId = pathParameter('roomId', { ...string, format: 'uuid' });
const basicProblems = {
  400: response('Entrada inválida', refs('Problem')),
  401: response('Sesión requerida o vencida', refs('Problem')),
  404: response('Proyecto o habitación inaccesible', refs('Problem')),
};
const engineProblems = {
  409: response('Preferencias o disponibilidad en conflicto', refs('Problem')),
  429: response('Límite de solicitudes alcanzado', refs('Problem')),
  503: response('Motor de sugerencias no disponible', refs('Problem')),
};
const object = (
  properties: Record<string, object>,
  required = Object.keys(properties),
) => ({ type: 'object', required, properties });

export const floorSuggestionsOpenApi = {
  openapi: '3.0.3',
  info: { title: 'Habita3D · Sugerencias de pisos', version: '1.0.0' },
  servers: [{ url: '/api' }],
  security: [{ session: [] }],
  paths: {
    '/projects/{id}': {
      get: {
        summary: 'Abrir un proyecto con configuración y preferencias',
        parameters: [projectId],
        responses: {
          200: response('Proyecto de la cuenta', refs('Project')),
          ...basicProblems,
        },
      },
    },
    '/projects/{id}/suggestions/settings': {
      patch: {
        summary: 'Activar o desactivar sugerencias del proyecto',
        parameters: [projectId],
        requestBody: request('Settings'),
        responses: {
          200: response('Ajuste persistido', refs('Settings')),
          ...basicProblems,
        },
      },
    },
    '/projects/{id}/rooms/{roomId}/suggestions/preferences': {
      patch: {
        summary: 'Guardar preferencias de una habitación',
        parameters: [projectId, roomId],
        requestBody: request('Preferences'),
        responses: {
          200: response('Habitación actualizada', refs('Room')),
          ...basicProblems,
        },
      },
    },
    '/projects/{id}/rooms/{roomId}/suggestions': {
      get: {
        summary: 'Consultar pisos sugeridos con precios persistidos',
        parameters: [
          projectId,
          roomId,
          {
            name: 'exclude',
            in: 'query',
            description: 'Clave de publicación descartada en esta habitación',
            style: 'form',
            explode: true,
            schema: {
              type: 'array',
              maxItems: 40,
              uniqueItems: true,
              items: key,
            },
          },
        ],
        responses: {
          200: response('Hasta tres sugerencias', refs('Suggestions')),
          ...basicProblems,
          ...engineProblems,
        },
      },
    },
    '/projects/{id}/rooms/{roomId}/suggestions/accept': {
      post: {
        summary: 'Guardar la sugerencia tras validar su cotización',
        parameters: [projectId, roomId],
        requestBody: request('Accept'),
        responses: {
          200: response('Piso guardado', refs('Accepted')),
          ...basicProblems,
          ...engineProblems,
          409: response(
            'Nueva cotización o sugerencia que dejó de estar disponible',
            {
              oneOf: [refs('PriceChanged'), refs('Problem')],
            },
          ),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      session: {
        type: 'http',
        scheme: 'bearer',
        description: 'Token opaco devuelto por /api/auth/login',
      },
    },
    schemas: {
      Settings: object({ suggestionsEnabled: boolean }),
      Preferences: object({
        preferredCategory: {
          ...category,
          nullable: true,
          enum: [...category.enum, null],
        },
        preferredSource: {
          ...source,
          nullable: true,
          enum: [...source.enum, null],
        },
      }),
      Project: object({
        id: nonnegative,
        name: string,
        budgetClp: nonnegative,
        suggestionsEnabled: boolean,
        createdAt: dateTime,
        updatedAt: dateTime,
        rooms: { type: 'array', items: refs('Room') },
      }),
      Room: {
        allOf: [
          refs('Preferences'),
          object({
            id: { ...string, format: 'uuid' },
            projectId: nonnegative,
            name: string,
            areaMode: { ...string, enum: ['area', 'dimensions'] },
            areaM2: nullable('string'),
            lengthM: nullable('string'),
            widthM: nullable('string'),
            wastePercent: string,
            budgetClp: nullable('integer'),
            sceneRoomId: nullable('string'),
            publicationKey: { ...key, nullable: true },
            lastSuggestedPublicationKey: { ...key, nullable: true },
            publication: nullable('object'),
            createdAt: dateTime,
            updatedAt: dateTime,
          }),
        ],
      },
      Suggestion: object({
        publicationKey: key,
        name: string,
        imageUrl: { ...nullable('string'), format: 'uri' },
        source,
        category,
        availability: { ...string, enum: ['available', 'unknown'] },
        checkedAt: dateTime,
        priceStale: boolean,
        boxes: { type: 'integer', minimum: 1 },
        totalClp: nonnegative,
        fitsBudget: boolean,
        budgetExcessClp: nonnegative,
        reasons: { type: 'array', items: string },
        quoteId,
      }),
      Suggestions: object({
        availableBudgetClp: nonnegative,
        provisionalBudget: boolean,
        emptyReason: {
          ...string,
          nullable: true,
          enum: [null, 'no_calculable_options', 'all_dismissed'],
        },
        suggestions: { type: 'array', maxItems: 3, items: refs('Suggestion') },
      }),
      Accept: object({ publicationKey: key, quoteId }),
      Accepted: object({
        status: { ...string, enum: ['accepted'] },
        room: refs('Room'),
      }),
      PriceChanged: object({
        status: { ...string, enum: ['price_changed'] },
        quote: refs('Suggestion'),
      }),
      Problem: object(
        {
          code: string,
          message: { oneOf: [string, { type: 'array', items: string }] },
        },
        ['message'],
      ),
    },
  },
};
