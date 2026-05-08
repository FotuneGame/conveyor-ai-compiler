import { IsString, IsNotEmpty, IsOptional, IsObject, IsNumber } from "class-validator";

export class CreateTempProjectDto {
  @IsNumber()
  @IsNotEmpty()
  modelId: number;

  @IsNumber()
  @IsNotEmpty()
  graphId: number;

  @IsObject()
  @IsOptional()
  customEnv?: Record<string, string>;
}
