import { IsString, IsNotEmpty, IsOptional, IsBoolean } from "class-validator";

export class RemoveImageDto {
  @IsString()
  @IsNotEmpty()
  imageId: string;

  @IsBoolean()
  @IsOptional()
  force?: boolean;
}
