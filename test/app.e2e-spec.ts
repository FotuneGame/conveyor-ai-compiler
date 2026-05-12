import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { AppModule } from '../src/app.module';

const compilerSecret = process.env.COMPILER_SECRET || 'test-compiler-secret';
const defaultTimeout = 5000;
const longRunningTimeout = 30000;

const mockModel = {
  id: 1,
  name: 'Test Model',
  tag: 'test',
  description: 'Test description',
  active: true,
  createdAt: new Date(),
  lastAt: new Date(),
  owner: { id: 1, name: 'Test User', email: 'test@example.com' },
};

const mockGraph = {
  id: 1,
  compiler: null,
};

const mockNodes = [
  {
    id: 1,
    name: 'Node 1',
    description: 'Test node',
    size: [100, 50],
    position: [0, 0],
    createdAt: new Date(),
    updatedAt: new Date(),
    enterDataType: { id: 1, name: 'input', value: 'string' },
    exitDataType: { id: 2, name: 'output', value: 'string' },
    type: { id: 1, name: 'function' },
  },
];

const mockDataTypes = [{ id: 1, name: 'string', value: 'string' }];
const mockNodeTypes = [{ id: 1, name: 'function' }];
const mockProtocolTypes = [{ id: 1, name: 'HTTP' }];

describe('Compiler (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, longRunningTimeout);

  afterAll(async () => {
    await app.close();
  });

  describe('GET /default', () => {
    it('should return default env config', () => {
      return request(app.getHttpServer()).get('/default').expect(200);
    }, defaultTimeout);
  });

  // describe('POST /compilate', () => {
  //   it('should return 401 without auth', () => {
  //     return request(app.getHttpServer())
  //       .post('/compilate')
  //       .send({ model: {}, graph: {}, nodes: [], dataTypes: {}, nodeTypes: {}, protocolTypes: {} })
  //       .expect(401);
  //   }, defaultTimeout);

  //   it('should attempt compile with auth', () => {
  //     return request(app.getHttpServer())
  //       .post('/compilate')
  //       .set('Authorization', `Bearer ${compilerSecret}`)
  //       .send({
  //         model: mockModel,
  //         graph: mockGraph,
  //         nodes: mockNodes,
  //         dataTypes: mockDataTypes,
  //         nodeTypes: mockNodeTypes,
  //         protocolTypes: mockProtocolTypes,
  //       })
  //       .expect(201);
  //   }, longRunningTimeout);
  // });

  describe('POST /stop', () => {
    it('should return 401 without auth', () => {
      return request(app.getHttpServer()).post('/stop').send({ model: mockModel, graph: mockGraph }).expect(401);
    }, defaultTimeout);

    it('should attempt stop project with auth', () => {
      return request(app.getHttpServer())
        .post('/stop')
        .set('Authorization', `Bearer ${compilerSecret}`)
        .send({ model: mockModel, graph: mockGraph  })
        .expect(201);
    }, longRunningTimeout);
  });

  describe('GET /models/:modelId/graphs/:graphId/logs', () => {
    it('should return 401 without auth', () => {
      return request(app.getHttpServer()).get('/models/1/graphs/1/logs').expect(401);
    }, defaultTimeout);

    it('should attempt get logs with auth', () => {
      return request(app.getHttpServer())
        .get('/models/1/graphs/1/logs')
        .set('Authorization', `Bearer ${compilerSecret}`)
        .expect(200);
    }, longRunningTimeout);
  });
});

