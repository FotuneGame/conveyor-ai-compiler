import { IsString, IsNotEmpty, IsNumber } from "class-validator";

export class StopProjectDto {
  @IsNumber()
  @IsNotEmpty()
  modelId: number;

  @IsNumber()
  @IsNotEmpty()
  graphId: number;
}
