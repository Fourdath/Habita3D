import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ExactDecimal, trimmed } from './project-fields.js';

class PlanRoomDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  id!: string;

  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ExactDecimal(1_000_000)
  areaM2!: string;
}

export class ProjectFloorDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  publicationKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((room: PlanRoomDto | null) => room?.id)
  @ValidateNested({ each: true })
  @Type(() => PlanRoomDto)
  rooms!: PlanRoomDto[];
}
