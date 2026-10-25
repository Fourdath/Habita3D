import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CatalogQueryDto, PageQueryDto } from './materials.dto.js';
import { MaterialsImportGuard } from './materials-token.guard.js';
import { MaterialsService } from './materials.service.js';

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Get()
  catalogue(@Query() query: CatalogQueryDto) {
    return this.materials.catalogue(query);
  }

  @Get('status')
  status() {
    return this.materials.status();
  }

  @Post('import')
  @UseGuards(MaterialsImportGuard)
  importCapture(@Body() payload: unknown) {
    return this.materials.importCapture(payload);
  }

  @Get(':publicationKey/history')
  history(@Param('publicationKey') key: string, @Query() query: PageQueryDto) {
    return this.materials.history(key, query);
  }

  @Get(':publicationKey')
  findOne(@Param('publicationKey') key: string) {
    return this.materials.findOne(key);
  }
}
