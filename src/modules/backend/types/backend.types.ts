import type { ContainerType as CompilerContainerType } from "../../../modules/compiler/types/container.types";
export type { CompilerContainerType as ContainerType };

export type CreateContainerType = {
  name: string;
  logsUrl: string;
  dockerUrl: string;
  endpointUrl: string;
};

export type UpdateContainerType = {
  name?: string;
  logsUrl?: string;
  dockerUrl?: string;
  endpointUrl?: string;
  active?: boolean;
};

export type ContainerListResponseType = {
  data: CompilerContainerType[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type ContainerLogsType = {
  logs: string;
};

export type BackendConfigType = {
  baseUrl: string;
  compilerSecret: string;
};
