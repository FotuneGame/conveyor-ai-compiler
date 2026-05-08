import { IsString, IsNotEmpty } from "class-validator";

export class PushToGitLabDto {
  @IsString()
  @IsNotEmpty()
  projectPath: string;

  @IsString()
  @IsNotEmpty()
  branch: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
