import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class PageQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class CatalogQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['ceramic', 'laminate'])
  category?: 'ceramic' | 'laminate';

  @IsOptional()
  @IsIn(['sodimac', 'easy'])
  source?: 'sodimac' | 'easy';

  @IsOptional()
  @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  minPricePerM2?: string;

  @IsOptional()
  @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  maxPricePerM2?: string;
}
