import { Module, Global } from '@nestjs/common';
import { WinstonService } from './winston.service';

@Global()
@Module({
  imports: [],
  providers: [WinstonService],
  exports: [WinstonService],
})
export class WinstonModule {}
