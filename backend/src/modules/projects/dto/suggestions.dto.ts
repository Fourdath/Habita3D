import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

const PUBLICATION_KEY = /^[a-f0-9]{64}$/;

export class SuggestionQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? [value] : value,
  )
  @IsArray()
  @ArrayMaxSize(40)
  @ArrayUnique()
  @Matches(PUBLICATION_KEY, { each: true })
  exclude?: string[];
}

export class UpdateSuggestionSettingsDto {
  @IsBoolean()
  suggestionsEnabled!: boolean;
}

export class UpdateFloorPreferencesDto {
  @ValidateIf((_, value) => value !== null)
  @IsIn(['ceramic', 'laminate'])
  preferredCategory!: 'ceramic' | 'laminate' | null;

  @ValidateIf((_, value) => value !== null)
  @IsIn(['sodimac', 'easy'])
  preferredSource!: 'sodimac' | 'easy' | null;
}

export class AcceptFloorSuggestionDto {
  @IsString()
  @Matches(PUBLICATION_KEY)
  publicationKey!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/)
  quoteId!: string;
}
