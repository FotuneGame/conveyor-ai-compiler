import { Controller, HttpCode, Get, HttpStatus } from "@nestjs/common";


@Controller()
export class HealthController {
  @Get('health')
  @HttpCode(HttpStatus.OK)
  healthCheck() {
    return { 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      service: 'conveyor-api'
    };
  }
}