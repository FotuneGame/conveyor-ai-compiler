import { Module } from '@nestjs/common';
import { CompilerModule } from './compiler/compiler.module';

@Module({
  imports: [
    CompilerModule,
  ],
})
export class CoreModule {}
