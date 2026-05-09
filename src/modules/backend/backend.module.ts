import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { BackendService } from "./backend.service";

@Module({
  imports: [HttpModule],
  providers: [BackendService],
  exports: [BackendService],
})
export class BackendModule {}
