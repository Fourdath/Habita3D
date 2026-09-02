import { MAX_FLOORPLAN_FILE_SIZE_BYTES, readFloorplanFile } from './floorplan-file';

const VALID_CUBICASA_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><g class="Floorplan Floor-1">' +
  '<g class="Wall"><polygon points="0,0 400,0 400,20 0,20"/></g>' +
  '</g></svg>';

function svgFile(name: string, content: string): File {
  return new File([content], name, { type: 'image/svg+xml' });
}

describe('readFloorplanFile', () => {
  it('accepts a valid CubiCasa SVG file and resolves with its text', async () => {
    const file = svgFile('model.svg', VALID_CUBICASA_SVG);

    await expect(readFloorplanFile(file)).resolves.toBe(VALID_CUBICASA_SVG);
  });

  it('rejects a file without a .svg extension', async () => {
    const file = svgFile('model.png', VALID_CUBICASA_SVG);

    await expect(readFloorplanFile(file)).rejects.toMatchObject({ code: 'invalid-extension' });
  });

  it('rejects a file larger than 5 MB without reading its content', async () => {
    const oversized = new File([new Uint8Array(MAX_FLOORPLAN_FILE_SIZE_BYTES + 1)], 'model.svg', {
      type: 'image/svg+xml',
    });

    await expect(readFloorplanFile(oversized)).rejects.toMatchObject({ code: 'file-too-large' });
  });

  it('rejects malformed XML', async () => {
    const file = svgFile('model.svg', '<svg><g class="Wall"></svg>');

    await expect(readFloorplanFile(file)).rejects.toMatchObject({ code: 'invalid-xml' });
  });

  it('rejects well-formed SVG with no CubiCasa elements', async () => {
    const file = svgFile('model.svg', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>');

    await expect(readFloorplanFile(file)).rejects.toMatchObject({ code: 'missing-cubicasa-elements' });
  });
});
