import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CaptureDto {
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @ArrayUnique()
  @IsIn(['sodimac', 'easy'], { each: true })
  sources?: ('sodimac' | 'easy')[];

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @ArrayUnique()
  @IsIn(['ceramic', 'laminate'], { each: true })
  categories?: ('ceramic' | 'laminate')[];

  @IsOptional() @IsInt() @Min(1) @Max(10)
  limitPerCategory?: number;
}
