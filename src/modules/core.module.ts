import { Module } from '@nestjs/common';
import { CompilerModule } from './compiler/compiler.module';
import { EnvConfigModule } from './env-config';
import { GitLabModule } from './gitlab';
import { ProjectModule } from './project';
import { TemplateModule } from './template';
import { TerminalModule } from './terminal';
import { ParserModule } from './parser/parser.module';
import { GraphTraversalModule } from './graph-traversal/graph-traversal.module';
import { CodegenModule } from './codegen/codegen.module';

@Module({
  imports: [
    CompilerModule,
    EnvConfigModule,
    GitLabModule,
    ProjectModule,
    TemplateModule,
    TerminalModule,
    ParserModule,
    GraphTraversalModule,
    CodegenModule,
  ],
})
export class CoreModule {}
