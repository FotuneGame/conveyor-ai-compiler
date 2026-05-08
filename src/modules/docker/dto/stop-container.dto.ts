import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from "class-validator";

export class StopContainerDto {
  @IsString()
  @IsNotEmpty()
  containerId: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  timeout?: number;
}
