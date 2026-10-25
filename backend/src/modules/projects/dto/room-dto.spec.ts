import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateProjectDto } from './create-project.dto.js';
import { CreateRoomDto, UpdateRoomDto } from './room.dto.js';
import { UpdateProjectDto } from './update-project.dto.js';

describe('EP2 project inputs', () => {
  it('requires an explicit whole CLP project budget', () => {
    for (const budgetClp of [undefined, null, -1, 1.5, '100', true, 1e16]) {
      expect(
        validateSync(
          plainToInstance(CreateProjectDto, { name: 'Casa', budgetClp }),
        ),
      ).not.toHaveLength(0);
    }
    expect(
      validateSync(
        plainToInstance(CreateProjectDto, { name: 'Casa', budgetClp: 100_000 }),
      ),
    ).toHaveLength(0);
  });

  it('does not accept null names, margins, modes or project budgets in partial updates', () => {
    expect(
      validateSync(plainToInstance(UpdateProjectDto, { name: null })),
    ).not.toHaveLength(0);
    expect(
      validateSync(plainToInstance(UpdateProjectDto, { budgetClp: null })),
    ).not.toHaveLength(0);
    for (const field of ['name', 'areaMode', 'wastePercent']) {
      expect(
        validateSync(plainToInstance(UpdateRoomDto, { [field]: null })),
      ).not.toHaveLength(0);
    }
  });

  it.each([
    true,
    {},
    [],
    'NaN',
    'Infinity',
    '-1',
    '0',
    '0.0000001',
    '1e3',
    '1,2',
    '1000001',
  ])('rejects invalid area %s', (areaM2) => {
    expect(
      validateSync(
        plainToInstance(CreateRoomDto, {
          name: 'Living',
          areaMode: 'area',
          areaM2,
        }),
      ),
    ).not.toHaveLength(0);
  });

  it('preserves exact decimal strings and defaults outside the DTO', () => {
    const dto = plainToInstance(CreateRoomDto, {
      name: ' Living ',
      areaMode: 'area',
      areaM2: '10.123456',
      wastePercent: '0',
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.name).toBe('Living');
    expect(dto.areaM2).toBe('10.123456');
  });

  it('allows clearing selection, room budget and scene link explicitly', () => {
    expect(
      validateSync(
        plainToInstance(UpdateRoomDto, {
          publicationKey: null,
          budgetClp: null,
          sceneRoomId: null,
        }),
      ),
    ).toHaveLength(0);
  });

  it('restricts selected publication keys and waste margins', () => {
    expect(
      validateSync(
        plainToInstance(UpdateRoomDto, { publicationKey: 'product-1' }),
      ),
    ).not.toHaveLength(0);
    expect(
      validateSync(
        plainToInstance(UpdateRoomDto, { wastePercent: '100.000001' }),
      ),
    ).not.toHaveLength(0);
    expect(
      validateSync(plainToInstance(UpdateRoomDto, { wastePercent: '-1' })),
    ).not.toHaveLength(0);
  });
});
