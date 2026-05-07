export type ProtocolTypeType = {
  id: number;
  name: string;
}

export type HTTPType = {
  id: number;
  method: string;
  url: string;
  format: string;
  headers: string;
  params: string;
  body: string;
  secure: boolean;
}

export type WSType = {
  id: number;
  url: string;
  query: string;
  auth: string;
  event: string;
  secure: boolean;
}

export type ProtocolType = {
  id: number;
  name: string;
  type: ProtocolTypeType;
  http: HTTPType | null;
  ws: WSType | null;
}