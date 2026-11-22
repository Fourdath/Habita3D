import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PlanRoomsDto } from './project-floor.dto.js';
import { trimmed } from './project-fields.js';

export class ProjectFloorplanDto extends PlanRoomsDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1_048_576)
  svg!: string;
}
