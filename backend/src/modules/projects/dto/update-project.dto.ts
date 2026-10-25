import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { MAX_BUDGET_CLP, trimmed } from './project-fields.js';

export class UpdateProjectDto {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(MAX_BUDGET_CLP)
  budgetClp?: number;
}
