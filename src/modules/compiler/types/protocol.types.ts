export type ProtocolTypeType = {
  id: number;
  name: string;
}

export type HTTPType = {
  id: number;
  method: string;
  url: string;
  format: string;
  headers: string | null;
  params: string | null;
  body: string | null;
  secure: boolean;
}

export type WSType = {
  id: number;
  url: string;
  query: string | null;
  auth: string | null;
  event: string | null;
  secure: boolean;
}

export type ProtocolType = {
  id: number;
  name: string;
  type: ProtocolTypeType;
  http: HTTPType | null;
  ws: WSType | null;
}