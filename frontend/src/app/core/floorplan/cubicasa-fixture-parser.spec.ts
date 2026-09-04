import { parseFloorplan } from './cubicasa-parser';

const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg"><g class="Floor"><g class="Space Undefined"><polygon points="0,0 500,0 500,500 0,500"/></g><g class="Wall External"><polygon points="0,0 500,0 500,20 0,20"/></g>${body}</g></svg>`;

describe('CubiCasa fixture parsing', () => {
  it.each([
    ['Toilet', 'TOILET'],
    ['Shower', 'SHOWER'],
    ['Bathtub', 'BATHTUB'],
    ['ShowerScreen', 'SHOWER_SCREEN'],
    ['RoundSink', 'UNKNOWN_SINK'],
    ['DoubleSink', 'UNKNOWN_SINK'],
    ['BaseCabinet', 'BASE_CABINET'],
    ['WallCabinet', 'WALL_CABINET'],
    ['IntegratedStove', 'STOVE'],
    ['Refrigerator', 'REFRIGERATOR'],
    ['WashingMachine', 'WASHING_MACHINE'],
    ['SpaceForAppliance', 'APPLIANCE_SPACE'],
    ['SpaceForAppliance2', 'APPLIANCE_SPACE'],
  ])('maps CubiCasa class %s to %s', (sourceClass, expectedType) => {
    const plan = parseFloorplan(wrap(`<g class="FixedFurniture ${sourceClass}" transform="matrix(1,0,0,1,100,100)"><g class="BoundaryPolygon"><polygon points="0,0 40,0 40,40 0,40"/></g></g>`), { scaleMetersPerUnit: 0.01 });
    expect(plan.fixtures[0].type).toBe(expectedType);
  });

  it('applies nested matrices, preserves group and parses desc/direction', () => {
    const svg = wrap(`<g id="set-a" class="FixedFurnitureSet" transform="matrix(1,0,0,1,100,100)"><g class="FixedFurniture BaseCabinet" transform="matrix(0,1,-1,0,80,0)"><g class="BoundaryPolygon"><polygon points="0,0 60,0 60,40 0,40"/></g><g class="Direction"><polygon points="25,30 35,30 30,40"/></g><desc>Width:60 Height:90 Depth:40 Elevation:0</desc></g></g>`);
    const plan = parseFloorplan(svg, { scaleMetersPerUnit: 0.01 });
    const fixture = plan.fixtures[0];
    expect(fixture.type).toBe('BASE_CABINET');
    expect(fixture.groupId).toBe('set-a');
    expect(fixture.width).toBeCloseTo(0.6);
    expect(fixture.depth).toBeCloseTo(0.4);
    expect(fixture.height).toBeCloseTo(0.9);
    expect(fixture.forwardDirection).toBeDefined();
    expect(fixture.roomId).toBe('room_0');
  });

  it('uses strong anchors for an undefined room and resolves an ambiguous sink', () => {
    const fixture = (classes: string, x: number) => `<g class="FixedFurniture ${classes}" transform="matrix(1,0,0,1,${x},100)"><g class="BoundaryPolygon"><polygon points="0,0 40,0 40,40 0,40"/></g></g>`;
    const plan = parseFloorplan(wrap(fixture('Toilet', 100) + fixture('Sink', 170)), { scaleMetersPerUnit: 0.01 });
    expect(plan.rooms[0].semantic.type).toBe('BATHROOM');
    expect(plan.fixtures.find((item) => item.sourceClasses.includes('Sink'))?.type).toBe('BATHROOM_SINK');
  });

  it('does not infer kitchen from base cabinet plus sink alone', () => {
    const svg = wrap(`<g class="FixedFurniture BaseCabinet" transform="matrix(1,0,0,1,100,100)"><g class="BoundaryPolygon"><polygon points="0,0 60,0 60,40 0,40"/></g></g><g class="FixedFurniture Sink" transform="matrix(1,0,0,1,180,100)"><g class="BoundaryPolygon"><polygon points="0,0 60,0 60,40 0,40"/></g></g>`);
    const plan = parseFloorplan(svg, { scaleMetersPerUnit: 0.01 });
    expect(plan.rooms[0].semantic.type).toBe('UNKNOWN');
    expect(plan.fixtures[1].type).toBe('UNKNOWN_SINK');
  });

  it('infers a kitchen from a strong stove anchor and resolves its sink', () => {
    const fixture = (classes: string, x: number) => `<g class="FixedFurniture ${classes}" transform="matrix(1,0,0,1,${x},100)"><g class="BoundaryPolygon"><polygon points="0,0 40,0 40,40 0,40"/></g></g>`;
    const plan = parseFloorplan(wrap(fixture('IntegratedStove', 100) + fixture('Sink', 170)), { scaleMetersPerUnit: 0.01 });
    expect(plan.rooms[0].semantic.type).toBe('KITCHEN');
    expect(plan.fixtures.find((item) => item.sourceClasses.includes('Sink'))?.type).toBe('KITCHEN_SINK');
  });
});
