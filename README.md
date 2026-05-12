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

BACKEND_URL=http://localhost:5000

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