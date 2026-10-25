import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { ExactDecimal, MAX_BUDGET_CLP, trimmed } from './project-fields.js';

export class RoomDetailsDto {
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @ExactDecimal(1_000_000)
  areaM2?: string | number | null;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @ExactDecimal(10_000)
  lengthM?: string | number | null;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @ExactDecimal(10_000)
  widthM?: string | number | null;

  @ValidateIf((_, value) => value !== undefined)
  @ExactDecimal(100, true)
  wastePercent?: string | number;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_BUDGET_CLP)
  budgetClp?: number | null;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  publicationKey?: string | null;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sceneRoomId?: string | null;
}

export class CreateRoomDto extends RoomDetailsDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsIn(['area', 'dimensions'])
  areaMode!: 'area' | 'dimensions';
}

export class UpdateRoomDto extends RoomDetailsDto {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['area', 'dimensions'])
  areaMode?: 'area' | 'dimensions';
}
