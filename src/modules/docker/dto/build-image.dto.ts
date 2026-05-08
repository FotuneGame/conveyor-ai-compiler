import { IsString, IsNotEmpty, IsOptional, IsObject } from "class-validator";

export class BuildImageDto {
  @IsString()
  @IsNotEmpty()
  path: string;

  @IsString()
  @IsNotEmpty()
  tag: string;

  @IsString()
  @IsOptional()
  dockerfileName?: string;

  @IsObject()
  @IsOptional()
  buildArgs?: Record<string, string>;
}
