# Conveyor AI Compiler

## Project setup

```bash
npm install
```


## Available Scripts
### Development & Production
```bash
# development
npm run start

# watch mode (auto-restart on changes)
npm run start:dev

# debug mode with watch
npm run start:debug

# production mode (requires build first)
npm run start:prod
```

### Build & Linting
```bash
# build the project
npm run build

# format code with Prettier
npm run format

# lint and fix issues with ESLint
npm run lint

# type-check without emitting files
npm run type-check
```

### Testing
```bash
# unit tests
npm run test

# watch mode for tests
npm run test:watch

# test coverage
npm run test:cov

# debug unit tests
npm run test:debug

# end-to-end tests
npm run test:e2e
```

### Docker Management
```bash
# build Docker image
npm run docker:build

# start services in detached mode
npm run docker:run

# stop all services
npm run docker:stop

# view live logs
npm run docker:logs

# remove containers, networks, volumes
npm run docker:clean

# full rebuild and restart
npm run docker:rebuild
```

### Deployment
```bash
npm install -g @nestjs/mau
mau deploy
```

## Environment Variables

Create a .env file in the root directory with the following structure:

```bash
PORT=5001
URL_CORS=http://localhost:3000 https://localhost:3000 http://localhost https://localhost
DEV=true

HASH_ROUNDS=12

LOG_LEVEL=debug
LOG_PATH=logs
LOG_MAX_SIZE=5242880
LOG_MAX_FILES=5
LOG_MAX_DAYS=30

SWAGGER_TITLE="API Documentation"
SWAGGER_DESCRIPTION="API для работы курсовой"
SWAGGER_VERSION=1.0
SWAGGER_PATH=docs
SWAGGER_CONTACT_NAME="Developer"
SWAGGER_CONTACT_URL=https://vk.com/id244759286
SWAGGER_CONTACT_EMAIL=titovgrisha04@gmail.com

MAX_REQUESTS_TTL_MS=5000
MAX_REQUESTS_LIMIT=10

COMPILER_SECRET=test-compiler-secret

GITLAB_URL=http://localhost:8080
GITLAB_TOKEN=your-gitlab-token-here
GITLAB_REGISTRY_URL=http://localhost:5081
GITLAB_CI_BACKEND_URL=http://host.docker.internal:5000

KEEP_TEMP_FILES=false
COMPILER_TEMP_DIR=./tmp/compiler-projects
ENV_PATH=./public/example.env
```

## Example Environment Variables for builded project

Create a /public/example.env file in the root directory with the following structure:

```bash
# Application Configuration
PORT=3000
NODE_ENV=production
URL_CORS=http://localhost:3000 https://localhost:3000

# Logging Configuration
LOG_LEVEL=info
LOG_PATH=logs
LOG_MAX_SIZE=5242880
LOG_MAX_FILES=5
LOG_MAX_DAYS=30

# Security Configuration
HASH_ROUNDS=12
MAX_REQUESTS_TTL_MS=5000
MAX_REQUESTS_LIMIT=10
BACKEND_EMAIL_BOT=example@gmail.com
BACKEND_PASSWORD_BOT=12345678
BACKEND_SERVICE_SECRET=test-service-secret
```

## If you need local Gitlab and Gitlab self-hosted runner

Start for GitLab runner: 
1) Run Redis and Postgree
2) Run GitLab
3) Login root, password MySecurePass123!
3) Create access token for compiler
```
- GITLAB_TOKEN=glpat-some-token
```
4) Create token for gitlab runner
5) Set token in docker-compose for gitlab-runner
```
- REGISTRATION_TOKEN=glrt-some-token
```
6) Set tags in web and docker-compose
6) Run GitLab runner 

If you need change gitlab root password in docker-compose.yaml
```
- GITLAB_ROOT_PASSWORD=MySecurePass123!
```

Attantion runner use tag: 'compiler'

## Example compile request data for all type of nodes

### Overview

Each node in the graph must have a `type.name` that matches its data payload. The compiler validates this mapping and generates a standalone TypeScript/Express application where each node becomes an async arrow function:

```typescript
export const node_{id} = async (input: EnterType, env: Record<string, unknown>): Promise<ExitType> => {
  // code fields inserted as-is
};
```

Fields marked with `type: 'code'` in the frontend contain raw TypeScript code strings. They are inserted directly into the generated function body without wrapping.

The `env` argument contains `process.env` variables plus internal `__memory` and `__functions` stores. Access env values with `env['VAR_NAME']`.

### Code field rules by node type

#### `function`
- `args` (code): comma-separated identifiers for destructuring from `input`
- `body` (code): raw TypeScript statements, must end with `return`

```json
"function": {
  "name": "scale",
  "args": "x",
  "body": "return x * Number(env['SCALE_FACTOR']);"
}
```

Generated:
```typescript
export const node_1 = async (input: number, env: Record<string, unknown>): Promise<number> => {
  const { x } = input as unknown;
  return x * Number(env['SCALE_FACTOR']);
};
```

#### `condition`
- `expression` (code): raw boolean expression or return statement

```json
"condition": {
  "expression": "return (input as string) === 'approved';"
}
```

Generated:
```typescript
export const node_2 = async (input: string, env: Record<string, unknown>): Promise<boolean> => {
  return (input as string) === 'approved';
};
```

#### `api` (HTTP)
- `params` (code): JSON object or TS expression for query params
- `headers` (code): JSON object or TS expression for headers
- `body` (code): JSON object or TS expression for request body

```json
"api": {
  "protocol": {
    "http": {
      "method": "POST",
      "url": "https://api.example.com/users",
      "headers": "{ 'Authorization': 'Bearer ' + env['API_TOKEN'] }",
      "params": "{ page: '1' }",
      "body": "{ name: input }"
    }
  }
}
```

Generated:
```typescript
export const node_3 = async (input: string, env: Record<string, unknown>): Promise<string> => {
  const url = new URL('https://api.example.com/users');
  const params = { page: '1' };
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, String(v)));
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env['API_TOKEN'] },
    body: { name: input } !== undefined ? JSON.stringify({ name: input }) : undefined,
  });
  return await response.json() as string;
};
```

#### `api` (WebSocket)
- `query` (code): JSON object or TS expression for query params
- `auth` (code): JSON object or TS expression for auth params
- `event` (string): Socket.IO event name to listen once
- `secure` (boolean): if true, replaces `ws://` with `wss://`

The WS node is **self-managed**: when the event fires, all child nodes are executed with the received payload. The engine does not enqueue children automatically.

```json
"api": {
  "protocol": {
    "ws": {
      "url": "ws://api.example.com/ws",
      "query": "{ room: env['ROOM_ID'] }",
      "auth": "{ token: env['WS_TOKEN'] }",
      "event": "message",
      "secure": false
    }
  }
}
```

#### `llm`
- `prompt` (code): can contain env references
- `context` (code): can contain env references

```json
"llm": {
  "temperature": 0.7,
  "prompt": "env['SYSTEM_PROMPT'] + '\\nUser: ' + String(input)",
  "context": "env['LLM_CONTEXT'] || 'default'",
  "size": 2048,
  "protocol": {
    "http": {
      "url": "env['LLM_URL']",
      "headers": "{ 'Authorization': 'Bearer ' + env['LLM_KEY'] }"
    }
  }
}
```

#### `circle`
- `expression` (code): boolean expression using `step` variable. On every `true` iteration all child nodes are executed with the current result.

```json
"circle": {
  "expression": "return step < Number(env['MAX_RETRIES']);",
  "maxStep": 10
}
```

Generated:
```typescript
export const node_7 = async (input: string, env: Record<string, unknown>): Promise<string> => {
  let step = 0;
  let lastResult = input as string;
  while (step < 10) {
    const shouldContinue = await (async () => { return step < Number(env['MAX_RETRIES']); })();
    if (!shouldContinue) break;
    lastResult = await runChildren(lastResult);
    step++;
  }
  return lastResult;
};
```

#### `timer`
No code fields. Waits until the `end` datetime, then executes all child nodes with the input.

```json
"timer": {
  "start": "2024-01-01T00:00:00Z",
  "end": "2024-12-31T23:59:59Z"
}
```

Generated:
```typescript
export const node_5 = async (input: string, env: Record<string, unknown>): Promise<string> => {
  const startTime = new Date('2024-01-01T00:00:00Z').getTime();
  const endTime = new Date('2024-12-31T23:59:59Z').getTime();
  const now = Date.now();
  if (now < startTime) { await new Promise(r => setTimeout(r, startTime - now)); }
  if (now < endTime) { await new Promise(r => setTimeout(r, endTime - now)); }
  return await runChildren(input as string);
};
```

#### `interval`
No code fields. Waits for `milliseconds` after `start`, then executes all child nodes with the input.

```json
"interval": {
  "start": "2024-01-01T00:00:00Z",
  "milliseconds": 5000
}
```

Generated:
```typescript
export const node_6 = async (input: string, env: Record<string, unknown>): Promise<string> => {
  const startTime = new Date('2024-01-01T00:00:00Z').getTime();
  const now = Date.now();
  if (now < startTime) { await new Promise(r => setTimeout(r, startTime - now)); }
  await new Promise(r => setTimeout(r, 5000));
  return await runChildren(input as string);
};
```

#### `memory`
No code fields. Appends input to a JSON file and returns the entire array to child nodes.

```json
"memory": {
  "maxSize": 100,
  "maxDate": null
}
```

Generated:
```typescript
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export const node_8 = async (input: string, env: Record<string, unknown>): Promise<string[]> => {
  const filePath = join(process.cwd(), 'memory-node-8.json');
  let arr: unknown[] = [];
  if (existsSync(filePath)) { arr = JSON.parse(readFileSync(filePath, 'utf-8')); }
  arr.push(input);
  if (100 && arr.length > 100) { arr.shift(); }
  writeFileSync(filePath, JSON.stringify(arr, null, 2));
  return arr as string[];
};
```

#### `call`
- `args` (code): arguments string for the called function

```json
"call": {
  "name": "helperFunction",
  "args": "input, env['AUX_DATA']"
}
```

### CompileRequestType structure

```json
{
  "model": { "id": 1, "name": "MyModel", "tag": "v1", "description": "...", "active": true, "createdAt": "...", "lastAt": "...", "owner": { "id": 1, "username": "dev", "pictureUrl": null, "createdAt": "...", "lastAt": "..." } },
  "graph": { "id": 1, "env": "PORT=3000", "compiler": null },
  "nodes": [ ... ],
  "dataTypes": [ { "id": 1, "name": "string", "value": "string" } ],
  "nodeTypes": [ { "id": 1, "name": "function" } ],
  "protocolTypes": [ { "id": 1, "name": "HTTP" } ],
  "customEnv": { "MY_VAR": "hello" }
}
```

### Node type: `function`

```json
{
  "id": 1,
  "name": "AddOne",
  "description": "Adds one to input",
  "size": [100, 50],
  "position": [0, 0],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z",
  "enterDataType": { "id": 1, "name": "number", "value": "number" },
  "exitDataType": { "id": 1, "name": "number", "value": "number" },
  "type": { "id": 1, "name": "function" },
  "function": {
    "id": 1,
    "name": "addOne",
    "args": "x",
    "body": "return x + 1;"
  },
  "parentLines": [
    { "id": 101, "parent": { "id": 1 }, "child": { "id": 2 } }
  ],
  "childLines": []
}

### Node type: `condition`

```json
{
  "id": 2,
  "name": "IsPositive",
  "description": "Check if value > 0",
  "size": [100, 50],
  "position": [200, 0],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z",
  "enterDataType": { "id": 1, "name": "number", "value": "number" },
  "exitDataType": { "id": 1, "name": "boolean", "value": "boolean" },
  "type": { "id": 2, "name": "condition" },
  "condition": {
    "id": 1,
    "expression": "return (input as number) > 0;"
  },
  "parentLines": [],
  "childLines": [
    { "id": 101, "parent": { "id": 1 }, "child": { "id": 2 } }
  ]
}

### Node type: `api`

```json
{
  "id": 3,
  "name": "FetchData",
  "description": "Call external API",
  "size": [100, 50],
  "position": [400, 0],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z",
  "enterDataType": { "id": 1, "name": "string", "value": "string" },
  "exitDataType": { "id": 1, "name": "string", "value": "string" },
  "type": { "id": 3, "name": "api" },
  "api": {
    "id": 1,
    "protocol": {
      "id": 1,
      "name": "HTTP",
      "type": { "id": 1, "name": "HTTP" },
      "http": {
        "id": 1,
        "method": "GET",
        "url": "https://api.example.com/data",
        "format": "json",
        "headers": "{ 'Authorization': 'Bearer token123' }",
        "params": "",
        "body": "",
        "secure": true
      },
      "ws": null
    }
  },
  "parentLines": [],
  "childLines": []
}
```

### Node type: `llm`

```json
{
  "id": 4,
  "name": "ChatGPT",
  "description": "Ask LLM",
  "size": [100, 50],
  "position": [600, 0],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z",
  "enterDataType": { "id": 1, "name": "string", "value": "string" },
  "exitDataType": { "id": 1, "name": "string", "value": "string" },
  "type": { "id": 4, "name": "llm" },
  "llm": {
    "id": 1,
    "temperature": 0.7,
    "prompt": "Summarize: {{input}}",
    "context": "default",
    "size": 2048,
    "protocol": {
      "id": 1,
      "name": "HTTP",
      "type": { "id": 1, "name": "HTTP" },
      "http": {
        "id": 1,
        "method": "POST",
        "url": "https://llm.example.com/v1/chat",
        "format": "json",
        "headers": "{ 'Content-Type': 'application/json' }",
        "params": "",
        "body": "{ 'messages': [{ 'role': 'user', 'content': 'Hello' }] }",
        "secure": true
      },
      "ws": null
    }
  },
  "parentLines": [],
  "childLines": []
}
```

### Node type: `timer`

```json
{
  "id": 5,
  "name": "WaitUntil",
  "description": "Pause execution",
  "size": [100, 50],
  "position": [0, 200],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z",
  "enterDataType": { "id": 1, "name": "string", "value": "string" },
  "exitDataType": { "id": 1, "name": "string", "value": "string" },
  "type": { "id": 5, "name": "timer" },
  "timer": {
    "id": 1,
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-12-31T23:59:59Z"
  },
  "parentLines": [],
  "childLines": []
}
```

### Node type: `interval`

```json
{
  "id": 6,
  "name": "Delay",
  "description": "Wait 5 seconds",
  "size": [100, 50],
  "position": [200, 200],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z",
  "enterDataType": { "id": 1, "name": "string", "value": "string" },
  "exitDataType": { "id": 1, "name": "string", "value": "string" },
  "type": { "id": 6, "name": "interval" },
  "interval": {
    "id": 1,
    "start": "2024-01-01T00:00:00Z",
    "milliseconds": 5000
  },
  "parentLines": [],
  "childLines": []
}
```

### Node type: `circle`

```json
{
  "id": 7,
  "name": "RetryLoop",
  "description": "Retry up to 10 times",
  "size": [100, 50],
  "position": [400, 200],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z",
  "enterDataType": { "id": 1, "name": "string", "value": "string" },
  "exitDataType": { "id": 1, "name": "string", "value": "string" },
  "type": { "id": 7, "name": "circle" },
  "circle": {
    "id": 1,
    "expression": "return step < 3;",
    "maxStep": 10
  },
  "parentLines": [],
  "childLines": []
}
```

### Node type: `memory`

```json
{
  "id": 8,
  "name": "SaveState",
  "description": "Persist input to memory",
  "size": [100, 50],
  "position": [600, 200],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z",
  "enterDataType": { "id": 1, "name": "string", "value": "string" },
  "exitDataType": { "id": 1, "name": "string", "value": "string" },
  "type": { "id": 8, "name": "memory" },
  "memory": {
    "id": 1,
    "maxSize": 100,
    "maxDate": null
  },
  "parentLines": [],
  "childLines": []
}
```

### Node type: `call`

```json
{
  "id": 9,
  "name": "CallHelper",
  "description": "Invoke helper",
  "size": [100, 50],
  "position": [800, 200],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z",
  "enterDataType": { "id": 1, "name": "string", "value": "string" },
  "exitDataType": { "id": 1, "name": "string", "value": "string" },
  "type": { "id": 9, "name": "call" },
  "call": {
    "id": 1,
    "name": "helperFunction",
    "args": "input"
  },
  "parentLines": [],
  "childLines": []
}
```

### Full linear graph example

```json
{
  "model": { "id": 1, "name": "Demo", "tag": "v1", "description": "Demo model", "active": true, "createdAt": "2024-01-01T00:00:00Z", "lastAt": "2024-01-01T00:00:00Z", "owner": { "id": 1, "username": "dev", "pictureUrl": null, "createdAt": "2024-01-01T00:00:00Z", "lastAt": "2024-01-01T00:00:00Z" } },
  "graph": { "id": 1, "env": "PORT=3000\\nSCALE_FACTOR=2", "compiler": null },
  "nodes": [
    {
      "id": 1,
      "name": "Scale",
      "description": "Scale input",
      "size": [100, 50],
      "position": [0, 0],
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "enterDataType": { "id": 1, "name": "number", "value": "number" },
      "exitDataType": { "id": 1, "name": "number", "value": "number" },
      "type": { "id": 1, "name": "function" },
      "function": { "id": 1, "name": "scale", "args": "x", "body": "return x * Number(env['SCALE_FACTOR']);" },
      "parentLines": [{ "id": 101, "parent": { "id": 1 }, "child": { "id": 2 } }],
      "childLines": []
    },
    {
      "id": 2,
      "name": "Check",
      "description": "Check threshold",
      "size": [100, 50],
      "position": [200, 0],
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "enterDataType": { "id": 1, "name": "number", "value": "number" },
      "exitDataType": { "id": 1, "name": "boolean", "value": "boolean" },
      "type": { "id": 2, "name": "condition" },
      "condition": { "id": 1, "expression": "return (input as number) > Number(env['THRESHOLD'] || '10');" },
      "parentLines": [],
      "childLines": [{ "id": 101, "parent": { "id": 1 }, "child": { "id": 2 } }]
    }
  ],
  "dataTypes": [{ "id": 1, "name": "number", "value": "number" }, { "id": 2, "name": "boolean", "value": "boolean" }],
  "nodeTypes": [{ "id": 1, "name": "function" }, { "id": 2, "name": "condition" }],
  "protocolTypes": [{ "id": 1, "name": "HTTP" }],
  "customEnv": { "SCALE_FACTOR": "2", "THRESHOLD": "15" }
}
```

### `dataTypes`

The `value` field of each data type is used directly as the TypeScript type definition in `src/types/generated.ts`:

```typescript
// dataType: { id: 1, name: "User", value: "{ id: number; name: string }" }
export type User = { id: number; name: string };
```

If `value` is empty, it defaults to `unknown`.

### Async execution

All generated node functions are `async`. The `GraphEngine.run` method is also `async` and uses `await` when calling each node. This allows nodes to perform HTTP requests, WebSocket connections, timers, and LLM calls without blocking the event loop.

### WebSocket support (`api` node)

When `protocol.ws` is present, the generated code uses `socket.io-client` to open a Socket.IO connection, wait for a single event, and **run all child nodes** with the received data:

```typescript
const { io } = await import('socket.io-client');
const query = { room: env['ROOM_ID'] };
const auth = { token: env['WS_TOKEN'] };
const client = io('ws://api.example.com/ws', { query, auth, transports: ['websocket', 'polling'] });
const result = await new Promise((resolve, reject) => {
  client.once('message', async (data) => {
    try {
      const childResult = await runChildren(data);
      resolve(childResult);
    } catch (e) { reject(e); }
  });
  client.once('connect_error', reject);
  setTimeout(() => reject(new Error('WS timeout')), 30000);
});
client.disconnect();
return result as string;
```

If `secure: true`, `ws://` is automatically replaced with `wss://`.

### Timer / Interval nodes

Both nodes now use non-blocking `await new Promise(r => setTimeout(r, ...))`. After the wait completes, **all child nodes are executed** with the original input:

```typescript
// timer
const startTime = new Date('2024-01-01T00:00:00Z').getTime();
const endTime = new Date('2024-12-31T23:59:59Z').getTime();
const now = Date.now();
if (now < startTime) { await new Promise(r => setTimeout(r, startTime - now)); }
if (now < endTime) { await new Promise(r => setTimeout(r, endTime - now)); }
return await runChildren(input as string);
```

### Circle node

On every iteration where the condition is `true`, **all child nodes are executed** with the current result. The loop continues until the condition becomes `false` or `maxStep` is reached:

```typescript
let step = 0;
let lastResult = input as string;
while (step < 10) {
  const shouldContinue = await (async () => { return step < Number(env['MAX_RETRIES']); })();
  if (!shouldContinue) break;
  lastResult = await runChildren(lastResult);
  step++;
}
return lastResult;
```

### Memory node

Appends the input to a JSON file (`memory-node-{id}.json`) and returns the **entire array** to child nodes. If `maxSize` is set, the oldest entry is removed when the limit is exceeded:

```typescript
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
const filePath = join(process.cwd(), 'memory-node-8.json');
let arr: unknown[] = [];
if (existsSync(filePath)) { arr = JSON.parse(readFileSync(filePath, 'utf-8')); }
arr.push(input);
if (20 && arr.length > 20) { arr.shift(); }
writeFileSync(filePath, JSON.stringify(arr, null, 2));
return arr as string[];
```

### HTTP `secure` flag

If `secure: true` and the URL starts with `http://`, it is replaced with `https://`. The same applies to WS (`ws://` → `wss://`).

### Self-managed nodes

The following node types manage their child execution internally. The engine does **not** enqueue their children automatically, avoiding duplicate runs:
- `circle`
- `timer`
- `interval`
- `api` (when `protocol.ws` is used)

All other nodes (function, condition, api-http, llm, memory, call) rely on the engine to pass their result to child nodes.

### Full pipeline example

See `examples/full-pipeline.example.ts` for a complete `CompileRequestType` that demonstrates:
1. Service login to backend (`/auth/service`)
2. Socket.IO WS listener (`/chat` namespace for messages)
3. Message validation (`/gpt` trigger)
4. HTTP fetch to `jsonplaceholder.typicode.com`
5. Memory persistence
6. LLM call through OpenRouter
7. Sending the answer back to backend chat

### Function calls (`call` node)

The `call` node looks up the target function in `env.__functions` (a Map built from all `function` nodes that have a `name`) and invokes it with the provided arguments:

```typescript
const fn = (env.__functions as Map<string, Function>)?.get('helperFunction');
if (typeof fn === 'function') {
  return await fn(input, env);
}
return input as string;
```

### Env variable rules

1. **Graph-level env**: `graph.env` is a raw string like `PORT=3000\nKEY=value`. It is merged with `customEnv`.
2. **Access in nodes**: Use `env['VAR_NAME']` inside code fields (`function.body`, `condition.expression`, `circle.expression`, `api.http.headers`, `api.http.body`, `llm.prompt`, etc.).
3. **Type casting**: Env values are strings. Cast them with `Number()`, `String()`, or `JSON.parse()` when needed.
4. **Built-in env vars**: The generated app automatically injects `PORT`, `GRAPH_ID`, `MODEL_ID`, `MODEL_NAME`, `MODEL_TAG`, `NODE_ENV`.
5. **Internal stores**: `env.__memory` (Map for memory nodes) and `env.__functions` (Map for call nodes) are injected automatically at runtime.

### Validation rules

- Each node must have a `type.name` matching its data field (`function`, `condition`, `api`, `llm`, `timer`, `interval`, `circle`, `memory`, `call`).
- Graph must have exactly one start node (no incoming edges, i.e. `childLines` is empty).
- Graph must be acyclic.
- All nodes must be reachable from the start node.
- Child/parent references in lines must point to existing node IDs.

```