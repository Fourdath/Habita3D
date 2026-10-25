import { registerDecorator } from 'class-validator';

export const MAX_BUDGET_CLP = 1_000_000_000_000_000;

export const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Decimal strings preserve exact m² values across JSON, Prisma and FastAPI. */
export function ExactDecimal(max: number, allowZero = false) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'exactDecimal',
      target: object.constructor,
      propertyName,
      constraints: [max, allowZero],
      options: {
        message: `${propertyName} debe ser un decimal finito de hasta seis decimales entre ${allowZero ? 0 : '> 0'} y ${max}`,
      },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string' && typeof value !== 'number')
            return false;
          const text = String(value);
          if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(text)) return false;
          const number = Number(text);
          return (
            Number.isFinite(number) &&
            (allowZero ? number >= 0 : number > 0) &&
            number <= max
          );
        },
      },
    });
  };
}
