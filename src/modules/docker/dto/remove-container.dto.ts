import { IsString, IsNotEmpty, IsOptional, IsBoolean } from "class-validator";

export class RemoveContainerDto {
  @IsString()
  @IsNotEmpty()
  containerId: string;

  @IsBoolean()
  @IsOptional()
  force?: boolean;
}
