import { registerAs } from '@nestjs/config';
import { DocumentBuilder, SwaggerCustomOptions } from '@nestjs/swagger';

export interface SwaggerConfig {
  enabled: boolean;
  title: string;
  description: string;
  version: string;
  path: string;
  contactName?: string;
  contactUrl?: string;
  contactEmail?: string;
}

export const swaggerOptions = () => {
  const config = new DocumentBuilder()
    .setTitle(process.env.SWAGGER_TITLE || 'NestJS API')
    .setDescription(process.env.SWAGGER_DESCRIPTION || 'API Documentation')
    .setVersion(process.env.SWAGGER_VERSION || '1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('user', 'Пользователь')
    .addTag('other', 'Остальное')
    .addServer(`http://localhost:${process.env.PORT}`, 'Локальный сервер')
    .setContact(
      process.env.SWAGGER_CONTACT_NAME || 'Development Team',
      process.env.SWAGGER_CONTACT_URL || 'https://example.com',
      process.env.SWAGGER_CONTACT_EMAIL || 'dev@example.com',
    )
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .build();

  const customOptions: SwaggerCustomOptions = {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
      tryItOutEnabled: true,
      displayOperationId: true,
      defaultModelsExpandDepth: 3,
      defaultModelExpandDepth: 3,
    },
    customSiteTitle: process.env.SWAGGER_TITLE || 'NestJS API Documentation',
  };

  return { config, customOptions };
};

export default registerAs(
  'swagger',
  (): SwaggerConfig => ({
    enabled: process.env.DEV === 'true',
    title: process.env.SWAGGER_TITLE || 'Swagger API',
    description: process.env.SWAGGER_DESCRIPTION || 'API Documentation',
    version: process.env.SWAGGER_VERSION || '1.0',
    path: process.env.SWAGGER_PATH || 'api-docs',
    contactName: process.env.SWAGGER_CONTACT_NAME,
    contactUrl: process.env.SWAGGER_CONTACT_URL,
    contactEmail: process.env.SWAGGER_CONTACT_EMAIL,
  }),
);
