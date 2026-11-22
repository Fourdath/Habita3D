import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const PUBLICATION_KEY = /^[a-f0-9]{64}$/;

export class FloorSuggestionsQueryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2599)
  @Matches(/^[a-f0-9]{64}(?:,[a-f0-9]{64}){0,39}$/)
  exclude?: string;
}

export class AcceptFloorSuggestionDto {
  @ApiProperty({ type: String, pattern: PUBLICATION_KEY.source })
  @IsString()
  @Matches(PUBLICATION_KEY)
  publicationKey!: string;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
    example: 60000,
  })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedCostClp!: number;
}

class SuggestionPriceDto {
  @ApiProperty({
    type: Object,
    description: 'La publicación del catálogo con precio y procedencia',
  })
  publication!: object;

  @ApiProperty({ type: 'integer', example: 6 })
  boxes!: number;

  @ApiProperty({ type: 'integer', example: 60000 })
  costClp!: number;

  @ApiProperty({
    type: Boolean,
    description: 'Han pasado 24 horas desde la última comprobación exitosa',
  })
  isPriceStale!: boolean;
}

export class FloorSuggestionItemDto extends SuggestionPriceDto {
  @ApiProperty({ type: 'integer', example: 0, minimum: 0 })
  budgetExcessClp!: number;

  @ApiProperty({
    type: [String],
    example: ['Dentro del presupuesto disponible'],
  })
  reasons!: string[];
}

export class FloorSuggestionsResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  roomId!: string;

  @ApiProperty({
    type: String,
    enum: ['within_budget', 'over_budget', 'no_candidates', 'disabled'],
  })
  status!: string;

  @ApiProperty({ type: String, nullable: true, example: 'floor-rules-v1' })
  ruleVersion!: string | null;

  @ApiProperty({ type: 'integer', nullable: true, example: 80000 })
  availableBudgetClp!: number | null;

  @ApiProperty({ type: Boolean })
  budgetProvisional!: boolean;

  @ApiProperty({ type: [FloorSuggestionItemDto], maxItems: 3 })
  items!: FloorSuggestionItemDto[];
}

export class AcceptFloorSuggestionResponseDto extends SuggestionPriceDto {
  @ApiProperty({ type: String, enum: ['accepted', 'price_changed'] })
  status!: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Habitación guardada. Presente solo con accepted.',
  })
  room?: object;
}
