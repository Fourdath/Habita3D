import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateProjectDto } from './create-project.dto.js';
import { PreviewProjectDto } from './preview-project.dto.js';

describe('project input validation', () => {
  it('rejects whitespace-only names on both project endpoints', () => {
    const create = plainToInstance(CreateProjectDto, { name: '   ' });
    const preview = plainToInstance(PreviewProjectDto, {
      name: '   ',
      areaM2: 50,
      budgetClp: 13_000_000,
    });

    expect(validateSync(create)).not.toHaveLength(0);
    expect(validateSync(preview)).not.toHaveLength(0);
  });

  it('trims valid names and rejects invalid budget values', () => {
    const valid = plainToInstance(PreviewProjectDto, {
      name: '  Casa piloto  ',
      areaM2: 50,
      budgetClp: 13_000_000,
    });
    const invalid = plainToInstance(PreviewProjectDto, {
      name: 'Casa piloto',
      areaM2: 50,
      budgetClp: -1,
    });

    expect(valid.name).toBe('Casa piloto');
    expect(validateSync(valid)).toHaveLength(0);
    expect(validateSync(invalid)).not.toHaveLength(0);
  });
});
