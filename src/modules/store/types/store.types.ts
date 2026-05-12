import type { ProjectType } from "../../../modules/project";


export type StoreType = {
  [projectId: string]: ProjectType;
};