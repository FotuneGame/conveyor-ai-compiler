import { IsString, IsNotEmpty, IsOptional, IsObject, IsNumber, IsDefined } from "class-validator";

export class RunContainerDto {
  @IsString()
  @IsNotEmpty()
  image: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsObject()
  @IsOptional()
  env?: Record<string, string>;

  @IsObject()
  @IsOptional()
  ports?: Record<number, number>;

  @IsObject()
  @IsOptional()
  volumes?: Record<string, string>;

  @IsString()
  @IsOptional()
  network?: string;

  @IsString()
  @IsOptional()
  restartPolicy?: string;
}
