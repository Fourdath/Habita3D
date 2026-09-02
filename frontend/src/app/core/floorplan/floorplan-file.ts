/**
 * Validates a user-picked floor plan file entirely in memory — never uploaded to a
 * backend, never written into public/. Used by Viewer3DPage's file picker before
 * handing the raw SVG text to Viewer3DEngine.
 */

export const MAX_FLOORPLAN_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export type FloorplanFileErrorCode =
  | 'invalid-extension'
  | 'file-too-large'
  | 'invalid-xml'
  | 'missing-cubicasa-elements'
  | 'read-error';

export class FloorplanFileError extends Error {
  constructor(
    message: string,
    readonly code: FloorplanFileErrorCode,
  ) {
    super(message);
    this.name = 'FloorplanFileError';
  }
}

export function hasSvgExtension(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.svg');
}

/**
 * Checks that `svgText` is well-formed XML and contains at least one of the CubiCasa
 * elements cubicasa-parser.ts knows how to read (Wall, Door, Window, Space). Pure and
 * synchronous so it can be unit-tested without constructing a File.
 */
export function validateFloorplanSvgText(svgText: string): void {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');

  if (doc.querySelector('parsererror')) {
    throw new FloorplanFileError('El archivo no es un XML/SVG válido.', 'invalid-xml');
  }

  const hasCubiCasaElements =
    doc.querySelector('g[class*="Wall"], g[class*="Door"], g[class*="Window"], g[class*="Space"]') !== null;
  if (!hasCubiCasaElements) {
    throw new FloorplanFileError(
      'El SVG no contiene elementos CubiCasa reconocibles (Wall, Door, Window o Space).',
      'missing-cubicasa-elements',
    );
  }
}

/**
 * Reads a picked file as text, validating extension, size and content before handing
 * it back. Rejects with a FloorplanFileError carrying a user-facing Spanish message.
 */
export async function readFloorplanFile(file: File): Promise<string> {
  if (!hasSvgExtension(file.name)) {
    throw new FloorplanFileError('El archivo debe tener extensión .svg.', 'invalid-extension');
  }

  if (file.size > MAX_FLOORPLAN_FILE_SIZE_BYTES) {
    throw new FloorplanFileError('El archivo supera el tamaño máximo permitido (5 MB).', 'file-too-large');
  }

  const svgText = await readFileAsText(file);

  validateFloorplanSvgText(svgText);
  return svgText;
}

/**
 * Reads a File as text via FileReader rather than the newer `File.text()` — broader
 * compatibility (in particular, `File.text()` isn't implemented under jsdom, which
 * this function's unit tests run against).
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new FloorplanFileError('No se pudo leer el archivo seleccionado.', 'read-error'));
    reader.readAsText(file);
  });
}
