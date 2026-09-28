import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';

export class PreviewProjectDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(10000)
  areaM2!: number;

  @IsInt()
  @Min(1)
  budgetClp!: number;
}
