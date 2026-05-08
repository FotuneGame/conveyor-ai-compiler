import { IsString, IsOptional, IsNotEmpty, IsIn, IsNumber } from "class-validator";

export class CreateGitLabProjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsIn(["private", "internal", "public"])
  visibility?: "private" | "internal" | "public";

  @IsNumber()
  @IsOptional()
  namespaceId?: number;
}
