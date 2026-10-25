import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { MAX_BUDGET_CLP, trimmed } from './project-fields.js';

export class CreateProjectDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_BUDGET_CLP)
  budgetClp!: number;
}
