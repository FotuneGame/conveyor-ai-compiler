import type { UserType } from './user.types';

export type ModelType = {
  id: number;
  name: string;
  tag: string;
  description: string;
  active: boolean;
  createdAt: Date;
  lastAt: Date;
  owner: UserType;
}
