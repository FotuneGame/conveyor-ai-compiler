import { Module } from '@nestjs/common';
import { CompilerModule } from './compiler/compiler.module';
import { DockerModule } from './docker';
import { EnvConfigModule } from './env-config';
import { GitLabModule } from './gitlab';
import { ProjectModule } from './project';
import { TemplateModule } from './template';
import { TerminalModule } from './terminal';

@Module({
  imports: [
    CompilerModule,
    DockerModule,
    EnvConfigModule,
    GitLabModule,
    ProjectModule,
    TemplateModule,
    TerminalModule,
  ],
})
export class CoreModule {}
