import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CaptureDto } from './capture.dto.js';
import { CapturesService } from './captures.service.js';
import { MaterialsTokenGuard } from './materials-token.guard.js';

@Controller('captures')
export class CapturesController {
  constructor(private readonly captures: CapturesService) {}

  @Get('status') status() { return this.captures.status(); }

  @Post() @HttpCode(200) @UseGuards(MaterialsTokenGuard)
  run(@Body() dto: CaptureDto, @Req() req: Request) {
    return this.captures.run(dto, req.get('x-request-id'));
  }
}
