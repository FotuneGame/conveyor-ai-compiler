import { registerAs } from '@nestjs/config';

export interface CoreConfig {

}

export default registerAs(
  'core',
  (): CoreConfig => ({

  }),
);
