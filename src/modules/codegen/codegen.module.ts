import { Module } from '@nestjs/common';
import { CodegenService } from './codegen.service';

@Module({
  providers: [CodegenService],
  exports: [CodegenService],
})
export class CodegenModule {}
