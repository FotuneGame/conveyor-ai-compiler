import { Module } from "@nestjs/common";
import { TemplateService } from "./template.service";
import { ParserModule } from "../parser/parser.module";
import { GraphTraversalModule } from "../graph-traversal/graph-traversal.module";
import { CodegenModule } from "../codegen/codegen.module";

@Module({
  imports: [ParserModule, GraphTraversalModule, CodegenModule],
  providers: [TemplateService],
  exports: [TemplateService],
})
export class TemplateModule {}
