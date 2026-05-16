-- ============================================================
-- AI ChatBot Pipeline Example — PostgreSQL INSERT script
--
-- ИНСТРУКЦИЯ:
-- 1. Открой этот файл в редакторе
-- 2. Замени OWNER_ID на ID существующего пользователя
-- 3. Запусти: psql -U postgres -d conveyor -f example.sql
-- 4. Проверьте что example.env такое же как и в graph поле env + OPENROUTER_KEY
--
-- ПАРАМЕТРЫ:
--   OWNER_ID       — ID пользователя (должен существовать в таблице "user")
--   COMPILER_NAME  — Название компилятора (по умолчанию: 'default')
--
-- Скрипт создаёт:
--   • Новую модель (model) с active = false
--   • Связь пользователя с моделью (user_model)
--   • Права владельца через permission структуру
--   • Граф со всеми узлами (graph, node, line, ...)
--
-- Предполагается, что в БД уже есть:
--   • Пользователь с id = OWNER_ID (таблица "user")
--   • Node types: 'function', 'api', 'condition', 'llm', 'memory'
--   • Protocol types: 'http', 'ws' (в нижнем регистре!)
-- ============================================================

-- ============================================================
-- 0. ПАРАМЕТРЫ — ЗАМЕНИ ПЕРЕД ВЫПОЛНЕНИЕМ
-- ============================================================
-- OWNER_ID  = 1   -- ID пользователя (должен существовать!)
-- ============================================================

DO $$
DECLARE
  v_owner_id INTEGER := 1;      -- ЗАМЕНИ на свой OWNER_ID!
  v_compiler_name TEXT := 'typescript';  -- ЗАМЕНИ на название своего компилятора!
  
  v_model_id INTEGER;
  v_graph_id INTEGER;
  
  v_service_group_id INTEGER;
  v_entity_group_id INTEGER;
  v_admin_group_id INTEGER;
  v_user_group_id INTEGER;
  v_reader_group_id INTEGER;
  
  v_admin_role_id INTEGER;
  v_user_role_id INTEGER;
  v_reader_role_id INTEGER;
  
  v_settings_resource_id INTEGER;
  v_model_resource_id INTEGER;
  
  v_proto_auth_id INTEGER;
  v_proto_ws_id INTEGER;
  v_proto_messages_id INTEGER;
  v_proto_llm_id INTEGER;
  
  v_dt_void_id INTEGER;
  v_dt_auth_id INTEGER;
  v_dt_chatEvent_id INTEGER;
  v_dt_boolean_id INTEGER;
  v_dt_context_id INTEGER;
  v_dt_llmResponse_id INTEGER;
  v_dt_messagesList_id INTEGER;
  v_dt_message_id INTEGER;
  v_dt_sentMessage_id INTEGER;
  v_dt_history_id INTEGER;
  
  v_node_auth_id INTEGER;
  v_node_saveToken_id INTEGER;
  v_node_chatsListener_id INTEGER;
  v_node_getMessages_id INTEGER;
  v_node_extractLastMsg_id INTEGER;
  v_node_checkTrigger_id INTEGER;
  v_node_fetchContext_id INTEGER;
  v_node_askLLM_id INTEGER;
  v_node_sendReply_id INTEGER;
  v_node_saveHistory_id INTEGER;
BEGIN
  -- ============================================================
  -- 1. Model (создаём новую модель, active = false)
  -- ============================================================
  INSERT INTO model (name, tag, description, active, created_at, last_at, owner_id)
  VALUES (
    'AI ChatBot',
    'v1',
    'AI-ассистент для анализа производственных данных через чат backend',
    false,  -- модель не активна по умолчанию
    NOW(),
    NOW(),
    v_owner_id
  )
  RETURNING id INTO v_model_id;

  RAISE NOTICE 'Created model with id = %', v_model_id;

  -- ============================================================
  -- 2. User-Model (связь пользователя с моделью)
  -- ============================================================
  INSERT INTO user_model (user_id, model_id, pin)
  SELECT v_owner_id, v_model_id, false
  WHERE NOT EXISTS (SELECT 1 FROM user_model WHERE user_id = v_owner_id AND model_id = v_model_id);

  -- ============================================================
  -- 3. Permission Structure (права владельца)
  -- ============================================================
  -- 3.1 Service group "Models"
  INSERT INTO "group" (name, description, created_at, updated_at)
  SELECT 'Models', 'Service models', NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM "group" WHERE name = 'Models')
  RETURNING id INTO v_service_group_id;

  SELECT id INTO v_service_group_id FROM "group" WHERE name = 'Models' LIMIT 1;

  -- 3.2 Entity group "model:{id}"
  INSERT INTO "group" (name, description, parent_id, created_at, updated_at)
  VALUES (
    'model:' || v_model_id,
    'This is subgroup for model "AI ChatBot" with id: ' || v_model_id,
    v_service_group_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_entity_group_id;

  -- 3.3 Resources
  INSERT INTO resource (name, description, url, created_at, updated_at)
  VALUES (
    'resource://model:' || v_model_id || ':settings',
    'Build and deploy of model',
    '/admin/models/' || v_model_id || '/**',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_settings_resource_id;

  INSERT INTO resource (name, description, url, created_at, updated_at)
  VALUES (
    'resource://model:' || v_model_id || ':model',
    'Settings and read mode',
    '/member/models/' || v_model_id || '/**',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_model_resource_id;

  -- 3.4 Roles
  INSERT INTO role (name, description, created_at, updated_at)
  VALUES (
    'role://model:' || v_model_id || ':admin',
    'Administrator role can use CRUD user in model (priority = 7)',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_admin_role_id;

  INSERT INTO role (name, description, created_at, updated_at)
  VALUES (
    'role://model:' || v_model_id || ':user',
    'User role with CRUD in model (priority = 7)',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_user_role_id;

  INSERT INTO role (name, description, created_at, updated_at)
  VALUES (
    'role://model:' || v_model_id || ':reader',
    'Reader role with priority = 1. It can only read.',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_reader_role_id;

  -- 3.5 Role-Resource links
  INSERT INTO role_resource (role_id, resource_id, priority)
  VALUES 
    (v_admin_role_id, v_settings_resource_id, 7),
    (v_user_role_id, v_model_resource_id, 7),
    (v_reader_role_id, v_model_resource_id, 1);

  -- 3.6 Subgroups (admin, user, reader)
  INSERT INTO "group" (name, description, parent_id, created_at, updated_at)
  VALUES (
    'group://model:' || v_model_id || ':admin',
    'Admin group',
    v_entity_group_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_admin_group_id;

  INSERT INTO "group" (name, description, parent_id, created_at, updated_at)
  VALUES (
    'group://model:' || v_model_id || ':user',
    'User group',
    v_entity_group_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_user_group_id;

  INSERT INTO "group" (name, description, parent_id, created_at, updated_at)
  VALUES (
    'group://model:' || v_model_id || ':reader',
    'Reader group',
    v_entity_group_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_reader_group_id;

  -- 3.7 Group-Role links
  INSERT INTO group_role (group_id, role_id)
  VALUES 
    (v_admin_group_id, v_admin_role_id),
    (v_admin_group_id, v_user_role_id),
    (v_user_group_id, v_user_role_id),
    (v_reader_group_id, v_reader_role_id);

  -- 3.8 User-Group links (владелец получает admin права)
  INSERT INTO user_group (user_id, group_id)
  SELECT v_owner_id, v_admin_group_id
  WHERE NOT EXISTS (SELECT 1 FROM user_group WHERE user_id = v_owner_id AND group_id = v_admin_group_id);

  RAISE NOTICE 'Created permission structure for model %', v_model_id;

  -- ============================================================
  -- 4. Graph
  -- ============================================================
  INSERT INTO graph (name, env, model_id, compiler_id)
  VALUES (
    'ChatBotPipeline',
    $ENV$
# Application Configuration
PORT=3100
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

BACKEND_URL=http://localhost:5000
BACKEND_EMAIL_BOT=example@gmail.com
BACKEND_PASSWORD_BOT=12345678
BACKEND_SERVICE_SECRET=test-service-secret
OPENROUTER_KEY=your-key
$ENV$,
    v_model_id,
    (SELECT id FROM compiler WHERE name = v_compiler_name LIMIT 1)
  )
  RETURNING id INTO v_graph_id;

  RAISE NOTICE 'Created graph with id = %', v_graph_id;

  -- ============================================================
  -- 5. Data Types (10 штук)
  -- ============================================================
  INSERT INTO data_type (name, value, graph_id)
  VALUES ('void', 'void', v_graph_id) RETURNING id INTO v_dt_void_id;

  INSERT INTO data_type (name, value, graph_id)
  VALUES ('auth', '{ accessToken: string; refreshToken: string }', v_graph_id) RETURNING id INTO v_dt_auth_id;

  INSERT INTO data_type (name, value, graph_id)
  VALUES ('chatEvent', '{ chatId: number; timestamp: string; data?: unknown }', v_graph_id) RETURNING id INTO v_dt_chatEvent_id;

  INSERT INTO data_type (name, value, graph_id)
  VALUES ('boolean', 'boolean', v_graph_id) RETURNING id INTO v_dt_boolean_id;

  INSERT INTO data_type (name, value, graph_id)
  VALUES ('context', 'Record<string,unknown>', v_graph_id) RETURNING id INTO v_dt_context_id;

  INSERT INTO data_type (name, value, graph_id)
  VALUES ('llmResponse', 'Record<string,unknown>', v_graph_id) RETURNING id INTO v_dt_llmResponse_id;

  INSERT INTO data_type (name, value, graph_id)
  VALUES ('messagesList', '{ data: { messages: any[]; pin?: any }; total: number; page: number; limit: number; totalPages: number }', v_graph_id) RETURNING id INTO v_dt_messagesList_id;

  INSERT INTO data_type (name, value, graph_id)
  VALUES ('message', '{ id: number; text: string; chatId?: number; user?: unknown }', v_graph_id) RETURNING id INTO v_dt_message_id;

  INSERT INTO data_type (name, value, graph_id)
  VALUES ('sentMessage', 'Record<string,unknown>', v_graph_id) RETURNING id INTO v_dt_sentMessage_id;

  INSERT INTO data_type (name, value, graph_id)
  VALUES ('history', 'Array<Record<string,unknown>>', v_graph_id) RETURNING id INTO v_dt_history_id;

  -- ============================================================
  -- 6. Protocols (4 штуки с человечными названиями)
  -- ============================================================
  INSERT INTO protocol (name, type_id, graph_id)
  VALUES ('Backend Auth HTTP', (SELECT id FROM protocol_type WHERE name = 'http'), v_graph_id)
  RETURNING id INTO v_proto_auth_id;

  INSERT INTO protocol (name, type_id, graph_id)
  VALUES ('Chats Listener WS', (SELECT id FROM protocol_type WHERE name = 'ws'), v_graph_id)
  RETURNING id INTO v_proto_ws_id;

  INSERT INTO protocol (name, type_id, graph_id)
  VALUES ('Fetch Messages HTTP', (SELECT id FROM protocol_type WHERE name = 'http'), v_graph_id)
  RETURNING id INTO v_proto_messages_id;

  INSERT INTO protocol (name, type_id, graph_id)
  VALUES ('OpenRouter LLM HTTP', (SELECT id FROM protocol_type WHERE name = 'http'), v_graph_id)
  RETURNING id INTO v_proto_llm_id;

  -- ============================================================
  -- 7. HTTP configs (3 штуки)
  -- ============================================================
  INSERT INTO http (method, url, format, headers, params, body, secure, protocol_id) VALUES
    ('POST',
     E'String(env[''BACKEND_URL'']) + ''/auth/service''',
     'json',
     E'{ ''Content-Type'': ''application/json'' }',
     '{}',
     E'JSON.stringify({ email: env[''BACKEND_EMAIL_BOT''], password: env[''BACKEND_PASSWORD_BOT''], secret: env[''BACKEND_SERVICE_SECRET''] })',
     false, v_proto_auth_id),

    ('GET',
     E'String(env[''BACKEND_URL'']) + ''/member/chats/'' + (input as any).chatId + ''/messages''',
     'json',
     E'{ ''Authorization'': ''Bearer '' + env[''BACKEND_TOKEN''], ''Content-Type'': ''application/json'' }',
     E'{ limit: 20, page: 1 }',
     'undefined',
     false, v_proto_messages_id),

    ('POST',
     'https://openrouter.ai/api/v1/chat/completions',
     'json',
     E'{ ''Authorization'': ''Bearer '' + env[''OPENROUTER_KEY''], ''Content-Type'': ''application/json'' }',
     '{}',
     E'JSON.stringify({ model: ''openai/gpt-4o-mini'', messages: [{ role: ''system'', content: ''Ты производственный аналитик. Отвечай кратко и по делу.'' }, { role: ''user'', content: ''Вопрос: '' + String((env[''MSG_TEXT''] as string)?.replace(''/gpt'', '''')trim() || '''') + ''\nКонтекст: '' + String(env[''FETCH_CONTEXT''] || '''') }] })',
     true, v_proto_llm_id);

  -- ============================================================
  -- 8. WS config (1 штука)
  -- ============================================================
  INSERT INTO ws (url, query, auth, event, secure, protocol_id) VALUES
    (
     E'String(env[''BACKEND_URL'']).replace(/^http/, ''ws'') + ''/chats''',
     '{}',
     E'{ token: env[''BACKEND_TOKEN''] }',
     'chats',
     false,
     v_proto_ws_id
    );

  -- ============================================================
  -- 9. Nodes (10 штук)
  -- ============================================================
  INSERT INTO node (name, description, size, position, created_at, updated_at, enter_data_type_id, exit_data_type_id, type_id, graph_id)
  VALUES ('AuthBackend', 'Сервисная аутентификация в backend: email + password + secret',
          ARRAY[160,40]::real[], ARRAY[100,100]::real[], NOW(), NOW(),
          v_dt_void_id, v_dt_auth_id, (SELECT id FROM node_type WHERE name = 'api'), v_graph_id)
  RETURNING id INTO v_node_auth_id;

  INSERT INTO node (name, description, size, position, created_at, updated_at, enter_data_type_id, exit_data_type_id, type_id, graph_id)
  VALUES ('SaveToken', 'Сохранение accessToken в env (runtime-переменная). Один ребенок: ChatsListener',
          ARRAY[160,40]::real[], ARRAY[100,250]::real[], NOW(), NOW(),
          v_dt_auth_id, v_dt_auth_id, (SELECT id FROM node_type WHERE name = 'function'), v_graph_id)
  RETURNING id INTO v_node_saveToken_id;

  INSERT INTO node (name, description, size, position, created_at, updated_at, enter_data_type_id, exit_data_type_id, type_id, graph_id)
  VALUES ('ChatsListener', 'WS /chats: слушаем изменения списка чатов (события chats, send, members)',
          ARRAY[160,40]::real[], ARRAY[100,400]::real[], NOW(), NOW(),
          v_dt_auth_id, v_dt_chatEvent_id, (SELECT id FROM node_type WHERE name = 'api'), v_graph_id)
  RETURNING id INTO v_node_chatsListener_id;

  INSERT INTO node (name, description, size, position, created_at, updated_at, enter_data_type_id, exit_data_type_id, type_id, graph_id)
  VALUES ('GetMessages', 'HTTP GET /member/chats/:chatId/messages — chatId из input, не из env',
          ARRAY[160,40]::real[], ARRAY[100,550]::real[], NOW(), NOW(),
          v_dt_chatEvent_id, v_dt_messagesList_id, (SELECT id FROM node_type WHERE name = 'api'), v_graph_id)
  RETURNING id INTO v_node_getMessages_id;

  INSERT INTO node (name, description, size, position, created_at, updated_at, enter_data_type_id, exit_data_type_id, type_id, graph_id)
  VALUES ('ExtractLastMsg', 'Извлекаем последнее сообщение, сохраняем chatId в env динамически',
          ARRAY[160,40]::real[], ARRAY[100,700]::real[], NOW(), NOW(),
          v_dt_messagesList_id, v_dt_message_id, (SELECT id FROM node_type WHERE name = 'function'), v_graph_id)
  RETURNING id INTO v_node_extractLastMsg_id;

  INSERT INTO node (name, description, size, position, created_at, updated_at, enter_data_type_id, exit_data_type_id, type_id, graph_id)
  VALUES ('CheckTrigger', 'Condition: текст сообщения содержит /gpt? Если false — ветка останавливается',
          ARRAY[160,40]::real[], ARRAY[100,850]::real[], NOW(), NOW(),
          v_dt_message_id, v_dt_boolean_id, (SELECT id FROM node_type WHERE name = 'condition'), v_graph_id)
  RETURNING id INTO v_node_checkTrigger_id;

  INSERT INTO node (name, description, size, position, created_at, updated_at, enter_data_type_id, exit_data_type_id, type_id, graph_id)
  VALUES ('FetchContext', 'Получение тестовых данных с jsonplaceholder для контекста LLM',
          ARRAY[160,40]::real[], ARRAY[100,1000]::real[], NOW(), NOW(),
          v_dt_boolean_id, v_dt_context_id, (SELECT id FROM node_type WHERE name = 'function'), v_graph_id)
  RETURNING id INTO v_node_fetchContext_id;

  INSERT INTO node (name, description, size, position, created_at, updated_at, enter_data_type_id, exit_data_type_id, type_id, graph_id)
  VALUES ('AskLLM', 'Запрос к LLM через OpenRouter с контекстом сообщения и jsonplaceholder',
          ARRAY[160,40]::real[], ARRAY[100,1150]::real[], NOW(), NOW(),
          v_dt_context_id, v_dt_llmResponse_id, (SELECT id FROM node_type WHERE name = 'llm'), v_graph_id)
  RETURNING id INTO v_node_askLLM_id;

  INSERT INTO node (name, description, size, position, created_at, updated_at, enter_data_type_id, exit_data_type_id, type_id, graph_id)
  VALUES ('SendReply', 'Отправка ответа LLM обратно в чат backend. ChatId из WS_EVENT (динамически)',
          ARRAY[160,40]::real[], ARRAY[100,1300]::real[], NOW(), NOW(),
          v_dt_llmResponse_id, v_dt_sentMessage_id, (SELECT id FROM node_type WHERE name = 'function'), v_graph_id)
  RETURNING id INTO v_node_sendReply_id;

  INSERT INTO node (name, description, size, position, created_at, updated_at, enter_data_type_id, exit_data_type_id, type_id, graph_id)
  VALUES ('SaveHistory', 'Сохранение истории ответов бота в локальный файл',
          ARRAY[160,40]::real[], ARRAY[100,1450]::real[], NOW(), NOW(),
          v_dt_sentMessage_id, v_dt_history_id, (SELECT id FROM node_type WHERE name = 'memory'), v_graph_id)
  RETURNING id INTO v_node_saveHistory_id;

  -- ============================================================
  -- 10. Function data (4 штуки: SaveToken, ExtractLastMsg, FetchContext, SendReply)
  -- ============================================================
  INSERT INTO "function" (name, body, args, node_id) VALUES
    ('saveToken',
     E'env[''BACKEND_TOKEN''] = (input as any).accessToken; return input;',
     '', v_node_saveToken_id),

    ('extractLastMsg',
     E'const list = (input as any)?.data?.messages || []; const last = list[list.length - 1] || {}; env[''CHAT_ID''] = last?.chat?.id || (input as any)?.chatId; env[''WS_EVENT''] = { chatId: env[''CHAT_ID''], data: last }; env[''LAST_MESSAGE''] = last; return last;',
     '', v_node_extractLastMsg_id),

    ('fetchContext',
     E'const response = await fetch(''https://jsonplaceholder.typicode.com/posts/1''); const data = await response.json(); env[''FETCH_CONTEXT''] = data; return data;',
     '', v_node_fetchContext_id),

    ('sendReply',
     E'const chatId = (env[''WS_EVENT''] as any)?.chatId; const llmResponse = input as any; const answer = llmResponse.choices?.[0]?.message?.content || String(input); const response = await fetch(String(env[''BACKEND_URL'']) + ''/member/chats/'' + chatId + ''/messages'', { method: ''POST'', headers: { ''Authorization'': ''Bearer '' + env[''BACKEND_TOKEN''], ''Content-Type'': ''application/json'' }, body: JSON.stringify({ text: answer }) }); if (!response.ok) throw new Error(''Send failed: '' + response.status); return await response.json();',
     '', v_node_sendReply_id);

  -- ============================================================
  -- 11. Condition data (1 штука: CheckTrigger)
  -- ============================================================
  INSERT INTO condition (expression, node_id) VALUES
    (
     E'const msg = input as any; const text = msg?.text || ''''''; env[''MSG_TEXT''] = text; return text.includes(''/gpt'');',
     v_node_checkTrigger_id);

  -- ============================================================
  -- 12. LLM data (1 штука: AskLLM)
  -- ============================================================
  INSERT INTO llm (temperature, prompt, context, size, protocol_id, node_id) VALUES
    (0.7, 'Анализ производственных данных', '', 2048, v_proto_llm_id, v_node_askLLM_id);

  -- ============================================================
  -- 13. Memory data (1 штука: SaveHistory)
  -- ============================================================
  INSERT INTO memory (max_size, max_date, node_id) VALUES
    (100, NULL, v_node_saveHistory_id);

  -- ============================================================
  -- 14. API data (3 штуки: AuthBackend, ChatsListener, GetMessages)
  -- ============================================================
  INSERT INTO api (protocol_id, node_id) VALUES
    (v_proto_auth_id,      v_node_auth_id),       -- AuthBackend    → Backend Auth HTTP
    (v_proto_ws_id,        v_node_chatsListener_id), -- ChatsListener  → Chats Listener WS
    (v_proto_messages_id,  v_node_getMessages_id);   -- GetMessages    → Fetch Messages HTTP

  -- ============================================================
  -- 15. Lines (связи между узлами, 9 штук)
  -- ============================================================
  INSERT INTO line (parent_id, child_id) VALUES
    (v_node_auth_id,       v_node_saveToken_id),
    (v_node_saveToken_id,  v_node_chatsListener_id),
    (v_node_chatsListener_id, v_node_getMessages_id),
    (v_node_getMessages_id, v_node_extractLastMsg_id),
    (v_node_extractLastMsg_id, v_node_checkTrigger_id),
    (v_node_checkTrigger_id, v_node_fetchContext_id),
    (v_node_fetchContext_id, v_node_askLLM_id),
    (v_node_askLLM_id,     v_node_sendReply_id),
    (v_node_sendReply_id,  v_node_saveHistory_id);

  RAISE NOTICE '✅ Model %, Graph % created with full permission structure', v_model_id, v_graph_id;
END $$;

-- ============================================================
-- Готово! Модель (active=false) и граф созданы с 10 узлами.
-- Владелец получил admin права через permission структуру.
--
-- Для очистки (замени MODEL_ID на ID созданной модели):
--
-- -- 1. Граф и его содержимое
-- DELETE FROM line WHERE parent_id IN (SELECT id FROM node WHERE graph_id IN (SELECT id FROM graph WHERE model_id = MODEL_ID));
-- DELETE FROM api WHERE node_id IN (SELECT id FROM node WHERE graph_id IN (SELECT id FROM graph WHERE model_id = MODEL_ID));
-- DELETE FROM memory WHERE node_id IN (SELECT id FROM node WHERE graph_id IN (SELECT id FROM graph WHERE model_id = MODEL_ID));
-- DELETE FROM llm WHERE node_id IN (SELECT id FROM node WHERE graph_id IN (SELECT id FROM graph WHERE model_id = MODEL_ID));
-- DELETE FROM condition WHERE node_id IN (SELECT id FROM node WHERE graph_id IN (SELECT id FROM graph WHERE model_id = MODEL_ID));
-- DELETE FROM "function" WHERE node_id IN (SELECT id FROM node WHERE graph_id IN (SELECT id FROM graph WHERE model_id = MODEL_ID));
-- DELETE FROM node WHERE graph_id IN (SELECT id FROM graph WHERE model_id = MODEL_ID);
-- DELETE FROM ws WHERE protocol_id IN (SELECT id FROM protocol WHERE graph_id IN (SELECT id FROM graph WHERE model_id = MODEL_ID));
-- DELETE FROM http WHERE protocol_id IN (SELECT id FROM protocol WHERE graph_id IN (SELECT id FROM graph WHERE model_id = MODEL_ID));
-- DELETE FROM protocol WHERE graph_id IN (SELECT id FROM graph WHERE model_id = MODEL_ID);
-- DELETE FROM data_type WHERE graph_id IN (SELECT id FROM graph WHERE model_id = MODEL_ID);
-- DELETE FROM graph WHERE model_id = MODEL_ID;
--
-- -- 2. Связь пользователя с моделью
-- DELETE FROM user_model WHERE model_id = MODEL_ID;
--
-- -- 3. Права (важен порядок: сначала дочерние группы, потом родители)
-- DELETE FROM user_group WHERE group_id IN (SELECT id FROM "group" WHERE name LIKE 'group://model:' || MODEL_ID || ':%');
-- DELETE FROM group_role WHERE group_id IN (SELECT id FROM "group" WHERE name LIKE 'group://model:' || MODEL_ID || ':%');
-- DELETE FROM "group" WHERE name LIKE 'group://model:' || MODEL_ID || ':%';           -- admin, user, reader
-- DELETE FROM "group" WHERE name = 'model:' || MODEL_ID;                              -- entity group
-- DELETE FROM "group" WHERE name = 'Models' AND NOT EXISTS (SELECT 1 FROM "group" g WHERE g.parent_id = "group".id); -- service group, если пустая
-- DELETE FROM role_resource WHERE role_id IN (SELECT id FROM role WHERE name LIKE 'role://model:' || MODEL_ID || ':%');
-- DELETE FROM role WHERE name LIKE 'role://model:' || MODEL_ID || ':%';
-- DELETE FROM resource WHERE name LIKE 'resource://model:' || MODEL_ID || ':%';
--
-- -- 4. Модель
-- DELETE FROM model WHERE id = MODEL_ID;
-- ============================================================
