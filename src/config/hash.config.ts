import { registerAs } from '@nestjs/config';

export interface HashConfig {
  rounds: number;
}

export default registerAs(
  'hash',
  (): HashConfig => ({
    rounds: parseInt(process.env.HASH_ROUNDS || '12', 10),
  }),
);
