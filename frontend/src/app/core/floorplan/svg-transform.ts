import type { Point2 } from './floorplan.types';

/** 2D affine matrix in SVG order: [a c e; b d f]. */
export interface Matrix2D {
  a: number; b: number; c: number; d: number; e: number; f: number;
}

export const IDENTITY: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export const multiply = (left: Matrix2D, right: Matrix2D): Matrix2D => ({
  a: left.a * right.a + left.c * right.b,
  b: left.b * right.a + left.d * right.b,
  c: left.a * right.c + left.c * right.d,
  d: left.b * right.c + left.d * right.d,
  e: left.a * right.e + left.c * right.f + left.e,
  f: left.b * right.e + left.d * right.f + left.f,
});

export const applyMatrix = (matrix: Matrix2D, point: Point2): Point2 => [
  matrix.a * point[0] + matrix.c * point[1] + matrix.e,
  matrix.b * point[0] + matrix.d * point[1] + matrix.f,
];

export function parseTransform(value: string): Matrix2D {
  let result = IDENTITY;
  for (const match of value.matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/gi)) {
    const values = match[2].trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
    let operation = IDENTITY;
    switch (match[1].toLowerCase()) {
      case 'matrix':
        if (values.length >= 6) {
          operation = { a: values[0], b: values[1], c: values[2], d: values[3], e: values[4], f: values[5] };
        }
        break;
      case 'translate':
        operation = { ...IDENTITY, e: values[0] ?? 0, f: values[1] ?? 0 };
        break;
      case 'scale':
        operation = { ...IDENTITY, a: values[0] ?? 1, d: values[1] ?? values[0] ?? 1 };
        break;
      case 'rotate': {
        const radians = ((values[0] ?? 0) * Math.PI) / 180;
        const rotation: Matrix2D = {
          a: Math.cos(radians), b: Math.sin(radians),
          c: -Math.sin(radians), d: Math.cos(radians), e: 0, f: 0,
        };
        operation = values.length >= 3
          ? multiply(
              multiply({ ...IDENTITY, e: values[1], f: values[2] }, rotation),
              { ...IDENTITY, e: -values[1], f: -values[2] },
            )
          : rotation;
        break;
      }
      default:
        break;
    }
    result = multiply(result, operation);
  }
  return result;
}

/**
 * Product of every ancestor transform down to `element`. CubiCasa nests fixtures under
 * translate/rotate/scale groups, so a BoundaryPolygon read without this chain lands in
 * the wrong room (and mirrored, when an ancestor scale is negative).
 */
export function cumulativeTransform(element: Element): Matrix2D {
  const chain: Element[] = [];
  let current: Element | null = element;
  while (current) {
    chain.unshift(current);
    current = current.parentElement;
  }
  return chain.reduce(
    (accumulated, node) => multiply(accumulated, parseTransform(node.getAttribute('transform') ?? '')),
    IDENTITY,
  );
}
