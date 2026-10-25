import { Module } from '@nestjs/common';
import { PythonService } from './python.service.js';

@Module({ providers: [PythonService], exports: [PythonService] })
export class PythonModule {}
