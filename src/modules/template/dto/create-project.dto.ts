import { IsString, IsNotEmpty, IsOptional } from "class-validator";

export class CreateTemplateProjectDto {
  @IsString()
  @IsNotEmpty()
  graphId: string;

  @IsString()
  @IsNotEmpty()
  modelId: string;

  @IsString()
  @IsNotEmpty()
  outputDir: string;

  @IsString()
  @IsOptional()
  customEnv?: string;
}
