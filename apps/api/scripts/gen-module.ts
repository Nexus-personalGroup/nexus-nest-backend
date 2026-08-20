/**
 * 後端六角模組產生器（借鏡 kgie-nest-backend gen:module 的後端子集）。
 *
 * 用法：`pnpm --filter @app/api gen:module <name> [--admin|--front] [--force]`
 *   <name> 為 kebab-case（如 `widget`、`task-assignment`）。
 *   --admin（預設）產後台模組 → adapter/in/web/admin/… + 路由 /api/admin/<names>。
 *   --front 產前台模組 → adapter/in/web/front/… + 路由 /api/front/<names>；module 類名加 Front 前綴。
 *   in 側（controller/facade/service/port-in/module）進 <side>/；out 側（persistence/port-out）與 domain 共用不分前後台。
 *   --force 覆寫既有檔（預設 skip-if-exists）。
 *
 * 產出一個最小 CRUD 六角模組（port in/out、service+spec、facade、controller+DTO、
 * Prisma repo、DomainException 子類、module）並自動註冊到 `app.module.ts`。
 * 同時注入 `response-codes.ts` / `response-messages.ts`（型別要求兩者成對存在）、
 * 產出 swagger yaml 骨架並註冊進 `openapi.yaml`,最後重跑 bundle 與 api-client generate——
 * 目的是讓產出物**零手改即通過 typecheck / lint / 架構守則**（見 test/architecture/）。
 * 例外靠 DomainException 的 kind 自動映射 HTTP status，不需再接 `GlobalExceptionFilter`。
 * 欄位僅含佔位的 `name`/`status`，Prisma model 不由本工具建立（見結尾的手動步驟）。
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

interface Names {
  /** kebab 單數，如 `task-assignment` */
  name: string;
  /** Pascal 單數，如 `TaskAssignment` */
  Name: string;
  /** kebab 複數（路由用），如 `task-assignments` */
  names: string;
  /** Pascal 複數，如 `TaskAssignments` */
  Names: string;
  /** SCREAMING 單數（DI token 用），如 `TASK_ASSIGNMENT` */
  NAME: string;
  /** SCREAMING 複數，如 `TASK_ASSIGNMENTS` */
  NAMES: string;
  /** camel 單數（變數 / prisma 屬性用），如 `taskAssignment` */
  camelName: string;
}

const toNames = (input: string): Names => {
  const kebab = input
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  if (!/^[a-z][a-z0-9-]*$/.test(kebab)) {
    throw new Error(
      `模組名稱不合法："${input}"（須 kebab-case，小寫字母開頭，如 widget）`,
    );
  }
  const camelName = kebab
    .split('-')
    .map((part, i) =>
      i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
  const Name = camelName.charAt(0).toUpperCase() + camelName.slice(1);
  const NAME = kebab.replace(/-/g, '_').toUpperCase();
  return {
    name: kebab,
    Name,
    names: `${kebab}s`,
    Names: `${Name}s`,
    NAME,
    NAMES: `${NAME}S`,
    camelName,
  };
};

const render = (source: string, n: Names): string =>
  source
    .replaceAll('%camelName%', n.camelName)
    .replaceAll('%Names%', n.Names)
    .replaceAll('%names%', n.names)
    .replaceAll('%Name%', n.Name)
    .replaceAll('%name%', n.name)
    .replaceAll('%NAMES%', n.NAMES)
    .replaceAll('%NAME%', n.NAME);

/** in 側各層前綴（controller/facade/service/port-in/module）；out 側與 domain 不列入、維持共用 */
const IN_SIDE_PREFIXES = [
  'adapter/in/web/',
  'application/facade/',
  'application/service/',
  'application/port/in/',
  'modules/',
] as const;

const isInSide = (rel: string): boolean =>
  IN_SIDE_PREFIXES.some((p) => rel.startsWith(p));

/** 把輸出路徑的 in 側層插入 `<side>/`（out 側 / domain 原樣回傳） */
const toSidePath = (rel: string, side: string): string => {
  const prefix = IN_SIDE_PREFIXES.find((p) => rel.startsWith(p));
  return prefix ? `${prefix}${side}/${rel.slice(prefix.length)}` : rel;
};

/**
 * 把 in 側檔案內容改成 `<side>/` 版：
 * 1. 指向 in 側各層的 import 插入 `<side>/`（out 側 / domain / infrastructure 維持不動）
 * 2. `@Controller('<names>')` 加 `<side>/` 前綴
 * 3. module 類名換成 moduleClass（前台加 Front 前綴，避免與後台同名 module 撞名）
 * 4. 相對 import 深度整體 +1（檔案往 `<side>/` 深一層）
 */
const toSideContent = (
  content: string,
  side: string,
  n: Names,
  moduleClass: string,
): string =>
  content
    .replaceAll(`facade/${n.Name}Facade`, `facade/${side}/${n.Name}Facade`)
    .replaceAll(`service/${n.name}/`, `service/${side}/${n.name}/`)
    .replaceAll(`port/in/${n.name}/`, `port/in/${side}/${n.name}/`)
    .replaceAll(
      `adapter/in/web/${n.name}/`,
      `adapter/in/web/${side}/${n.name}/`,
    )
    .replaceAll(`${n.Name}Module`, moduleClass)
    .replace(/@Controller\('/g, `@Controller('${side}/`)
    .replace(/(from\s+['"])(\.\.\/)/g, '$1../$2');

/** key = 相對 `apps/api/src` 的輸出路徑（含 %token%）；value = 模板內容 */
const TEMPLATES: Record<string, string> = {
  'application/port/in/%name%/Create%Name%UseCase.ts': `export const CREATE_%NAME%_USE_CASE = 'CREATE_%NAME%_USE_CASE';

export interface Create%Name%Command {
  name: string;
}

export interface Create%Name%Result {
  id: string;
}

export interface Create%Name%UseCase {
  execute(command: Create%Name%Command): Promise<Create%Name%Result>;
}
`,

  'application/port/in/%name%/Get%Name%UseCase.ts': `export const GET_%NAME%_USE_CASE = 'GET_%NAME%_USE_CASE';

export interface %Name%Detail {
  id: string;
  name: string;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Get%Name%UseCase {
  execute(id: string): Promise<%Name%Detail>;
}
`,

  'application/port/in/%name%/List%Names%UseCase.ts': `import { PaginationMeta } from '../../../../infrastructure/pagination';

export const LIST_%NAMES%_USE_CASE = 'LIST_%NAMES%_USE_CASE';

export interface List%Names%Query {
  page?: number;
  limit?: number;
  name?: string;
  status?: boolean;
}

export interface %Name%ListItem {
  id: string;
  name: string;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface List%Names%Result {
  list: %Name%ListItem[];
  meta: PaginationMeta;
}

export interface List%Names%UseCase {
  execute(query: List%Names%Query): Promise<List%Names%Result>;
}
`,

  'application/port/in/%name%/Update%Name%UseCase.ts': `export const UPDATE_%NAME%_USE_CASE = 'UPDATE_%NAME%_USE_CASE';

export interface Update%Name%Command {
  id: string;
  name?: string;
  status?: boolean;
}

export interface Update%Name%UseCase {
  execute(command: Update%Name%Command): Promise<void>;
}
`,

  'application/port/in/%name%/Delete%Name%UseCase.ts': `export const DELETE_%NAME%_USE_CASE = 'DELETE_%NAME%_USE_CASE';

export interface Delete%Name%UseCase {
  execute(id: string): Promise<void>;
}
`,

  'application/port/out/%name%/%Name%RepositoryPort.ts': `export const %NAME%_REPOSITORY_PORT = '%NAME%_REPOSITORY_PORT';

export interface List%Names%Params {
  page: number;
  limit: number;
  name?: string;
  status?: boolean;
}

export interface %Name%Record {
  id: string;
  name: string;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface List%Names%Page {
  data: %Name%Record[];
  total: number;
}

export interface %Name%RepositoryPort {
  list(params: List%Names%Params): Promise<List%Names%Page>;
  findById(id: string): Promise<%Name%Record | null>;
  create(data: { name: string }): Promise<%Name%Record>;
  update(id: string, data: { name?: string; status?: boolean }): Promise<void>;
  softDelete(id: string): Promise<void>;
}
`,

  'application/service/%name%/Create%Name%Service.ts': `import { Inject, Injectable } from '@nestjs/common';
import {
  CREATE_%NAME%_USE_CASE,
  Create%Name%Command,
  Create%Name%Result,
  Create%Name%UseCase,
} from '../../port/in/%name%/Create%Name%UseCase';
import {
  %NAME%_REPOSITORY_PORT,
  %Name%RepositoryPort,
} from '../../port/out/%name%/%Name%RepositoryPort';

export { CREATE_%NAME%_USE_CASE };

@Injectable()
export class Create%Name%Service implements Create%Name%UseCase {
  constructor(
    @Inject(%NAME%_REPOSITORY_PORT)
    private readonly %camelName%Repo: %Name%RepositoryPort,
  ) {}

  async execute(command: Create%Name%Command): Promise<Create%Name%Result> {
    const created = await this.%camelName%Repo.create({ name: command.name });
    return { id: created.id };
  }
}
`,

  'application/service/%name%/Get%Name%Service.ts': `import { Inject, Injectable } from '@nestjs/common';
import {
  GET_%NAME%_USE_CASE,
  %Name%Detail,
  Get%Name%UseCase,
} from '../../port/in/%name%/Get%Name%UseCase';
import {
  %NAME%_REPOSITORY_PORT,
  %Name%RepositoryPort,
} from '../../port/out/%name%/%Name%RepositoryPort';
import { %Name%NotFoundException } from '../../../domain/exception/%Name%NotFoundException';

export { GET_%NAME%_USE_CASE };

@Injectable()
export class Get%Name%Service implements Get%Name%UseCase {
  constructor(
    @Inject(%NAME%_REPOSITORY_PORT)
    private readonly %camelName%Repo: %Name%RepositoryPort,
  ) {}

  async execute(id: string): Promise<%Name%Detail> {
    const record = await this.%camelName%Repo.findById(id);
    if (!record) throw new %Name%NotFoundException();
    return {
      id: record.id,
      name: record.name,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
`,

  'application/service/%name%/List%Names%Service.ts': `import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_%NAMES%_USE_CASE,
  List%Names%Query,
  List%Names%Result,
  List%Names%UseCase,
} from '../../port/in/%name%/List%Names%UseCase';
import {
  %NAME%_REPOSITORY_PORT,
  %Name%RepositoryPort,
} from '../../port/out/%name%/%Name%RepositoryPort';
import {
  buildPaginationMeta,
  getPagination,
} from '../../../infrastructure/pagination';

export { LIST_%NAMES%_USE_CASE };

@Injectable()
export class List%Names%Service implements List%Names%UseCase {
  constructor(
    @Inject(%NAME%_REPOSITORY_PORT)
    private readonly %camelName%Repo: %Name%RepositoryPort,
  ) {}

  async execute(query: List%Names%Query): Promise<List%Names%Result> {
    const { page, limit } = getPagination({
      page: query.page,
      limit: query.limit,
    });
    const { data, total } = await this.%camelName%Repo.list({
      page,
      limit,
      name: query.name,
      status: query.status,
    });
    return {
      list: data.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }
}
`,

  'application/service/%name%/Update%Name%Service.ts': `import { Inject, Injectable } from '@nestjs/common';
import {
  UPDATE_%NAME%_USE_CASE,
  Update%Name%Command,
  Update%Name%UseCase,
} from '../../port/in/%name%/Update%Name%UseCase';
import {
  %NAME%_REPOSITORY_PORT,
  %Name%RepositoryPort,
} from '../../port/out/%name%/%Name%RepositoryPort';
import { %Name%NotFoundException } from '../../../domain/exception/%Name%NotFoundException';

export { UPDATE_%NAME%_USE_CASE };

@Injectable()
export class Update%Name%Service implements Update%Name%UseCase {
  constructor(
    @Inject(%NAME%_REPOSITORY_PORT)
    private readonly %camelName%Repo: %Name%RepositoryPort,
  ) {}

  async execute(command: Update%Name%Command): Promise<void> {
    const existing = await this.%camelName%Repo.findById(command.id);
    if (!existing) throw new %Name%NotFoundException();
    await this.%camelName%Repo.update(command.id, {
      name: command.name,
      status: command.status,
    });
  }
}
`,

  'application/service/%name%/Delete%Name%Service.ts': `import { Inject, Injectable } from '@nestjs/common';
import {
  DELETE_%NAME%_USE_CASE,
  Delete%Name%UseCase,
} from '../../port/in/%name%/Delete%Name%UseCase';
import {
  %NAME%_REPOSITORY_PORT,
  %Name%RepositoryPort,
} from '../../port/out/%name%/%Name%RepositoryPort';
import { %Name%NotFoundException } from '../../../domain/exception/%Name%NotFoundException';

export { DELETE_%NAME%_USE_CASE };

@Injectable()
export class Delete%Name%Service implements Delete%Name%UseCase {
  constructor(
    @Inject(%NAME%_REPOSITORY_PORT)
    private readonly %camelName%Repo: %Name%RepositoryPort,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.%camelName%Repo.findById(id);
    if (!existing) throw new %Name%NotFoundException();
    await this.%camelName%Repo.softDelete(id);
  }
}
`,

  'application/service/%name%/Create%Name%Service.spec.ts': `import { Create%Name%Service } from './Create%Name%Service';
import { %Name%RepositoryPort } from '../../port/out/%name%/%Name%RepositoryPort';

const NEW_ID = '00000000-0000-4000-8000-000000000001';

const mockRepo = {
  create: jest.fn(),
} as unknown as jest.Mocked<%Name%RepositoryPort>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Create%Name%Service', () => {
  it('建立成功 → 回傳新 id、repo 收到 name', async () => {
    (mockRepo.create as jest.Mock).mockResolvedValue({ id: NEW_ID });

    const result = await new Create%Name%Service(mockRepo).execute({
      name: '測試',
    });

    expect(result).toEqual({ id: NEW_ID });
    expect(mockRepo.create).toHaveBeenCalledWith({ name: '測試' });
  });
});
`,

  'application/service/%name%/Get%Name%Service.spec.ts': `import { Get%Name%Service } from './Get%Name%Service';
import { %Name%RepositoryPort } from '../../port/out/%name%/%Name%RepositoryPort';
import { %Name%NotFoundException } from '../../../domain/exception/%Name%NotFoundException';

const ID = '00000000-0000-4000-8000-000000000001';

const mockRepo = {
  findById: jest.fn(),
} as unknown as jest.Mocked<%Name%RepositoryPort>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Get%Name%Service', () => {
  it('存在 → 回傳明細', async () => {
    const now = new Date();
    (mockRepo.findById as jest.Mock).mockResolvedValue({
      id: ID,
      name: '測試',
      status: true,
      createdAt: now,
      updatedAt: now,
    });

    const result = await new Get%Name%Service(mockRepo).execute(ID);

    expect(result.id).toBe(ID);
  });

  it('不存在 → 拋 %Name%NotFoundException', async () => {
    (mockRepo.findById as jest.Mock).mockResolvedValue(null);

    await expect(
      new Get%Name%Service(mockRepo).execute(ID),
    ).rejects.toBeInstanceOf(%Name%NotFoundException);
  });
});
`,

  'application/service/%name%/List%Names%Service.spec.ts': `import { List%Names%Service } from './List%Names%Service';
import { %Name%RepositoryPort } from '../../port/out/%name%/%Name%RepositoryPort';

const mockRepo = {
  list: jest.fn(),
} as unknown as jest.Mocked<%Name%RepositoryPort>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('List%Names%Service', () => {
  it('回傳分頁列表 + meta', async () => {
    (mockRepo.list as jest.Mock).mockResolvedValue({ data: [], total: 0 });

    const result = await new List%Names%Service(mockRepo).execute({});

    expect(result.list).toEqual([]);
    expect(result.meta.total).toBe(0);
  });
});
`,

  'application/service/%name%/Update%Name%Service.spec.ts': `import { Update%Name%Service } from './Update%Name%Service';
import { %Name%RepositoryPort } from '../../port/out/%name%/%Name%RepositoryPort';
import { %Name%NotFoundException } from '../../../domain/exception/%Name%NotFoundException';

const ID = '00000000-0000-4000-8000-000000000001';

const mockRepo = {
  findById: jest.fn(),
  update: jest.fn(),
} as unknown as jest.Mocked<%Name%RepositoryPort>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Update%Name%Service', () => {
  it('存在 → 更新', async () => {
    (mockRepo.findById as jest.Mock).mockResolvedValue({ id: ID });

    await new Update%Name%Service(mockRepo).execute({ id: ID, name: '新名' });

    expect(mockRepo.update).toHaveBeenCalledWith(ID, {
      name: '新名',
      status: undefined,
    });
  });

  it('不存在 → 拋 NotFound，不更新', async () => {
    (mockRepo.findById as jest.Mock).mockResolvedValue(null);

    await expect(
      new Update%Name%Service(mockRepo).execute({ id: ID, name: '新名' }),
    ).rejects.toBeInstanceOf(%Name%NotFoundException);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});
`,

  'application/service/%name%/Delete%Name%Service.spec.ts': `import { Delete%Name%Service } from './Delete%Name%Service';
import { %Name%RepositoryPort } from '../../port/out/%name%/%Name%RepositoryPort';
import { %Name%NotFoundException } from '../../../domain/exception/%Name%NotFoundException';

const ID = '00000000-0000-4000-8000-000000000001';

const mockRepo = {
  findById: jest.fn(),
  softDelete: jest.fn(),
} as unknown as jest.Mocked<%Name%RepositoryPort>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Delete%Name%Service', () => {
  it('存在 → 軟刪', async () => {
    (mockRepo.findById as jest.Mock).mockResolvedValue({ id: ID });

    await new Delete%Name%Service(mockRepo).execute(ID);

    expect(mockRepo.softDelete).toHaveBeenCalledWith(ID);
  });

  it('不存在 → 拋 NotFound', async () => {
    (mockRepo.findById as jest.Mock).mockResolvedValue(null);

    await expect(
      new Delete%Name%Service(mockRepo).execute(ID),
    ).rejects.toBeInstanceOf(%Name%NotFoundException);
  });
});
`,

  'application/facade/%Name%Facade.ts': `import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_%NAMES%_USE_CASE,
  List%Names%Query,
  List%Names%Result,
  List%Names%UseCase,
} from '../port/in/%name%/List%Names%UseCase';
import {
  GET_%NAME%_USE_CASE,
  %Name%Detail,
  Get%Name%UseCase,
} from '../port/in/%name%/Get%Name%UseCase';
import {
  CREATE_%NAME%_USE_CASE,
  Create%Name%Command,
  Create%Name%Result,
  Create%Name%UseCase,
} from '../port/in/%name%/Create%Name%UseCase';
import {
  UPDATE_%NAME%_USE_CASE,
  Update%Name%Command,
  Update%Name%UseCase,
} from '../port/in/%name%/Update%Name%UseCase';
import {
  DELETE_%NAME%_USE_CASE,
  Delete%Name%UseCase,
} from '../port/in/%name%/Delete%Name%UseCase';

@Injectable()
export class %Name%Facade {
  constructor(
    @Inject(LIST_%NAMES%_USE_CASE)
    private readonly list%Names%UseCase: List%Names%UseCase,
    @Inject(GET_%NAME%_USE_CASE)
    private readonly get%Name%UseCase: Get%Name%UseCase,
    @Inject(CREATE_%NAME%_USE_CASE)
    private readonly create%Name%UseCase: Create%Name%UseCase,
    @Inject(UPDATE_%NAME%_USE_CASE)
    private readonly update%Name%UseCase: Update%Name%UseCase,
    @Inject(DELETE_%NAME%_USE_CASE)
    private readonly delete%Name%UseCase: Delete%Name%UseCase,
  ) {}

  list%Names%(query: List%Names%Query): Promise<List%Names%Result> {
    return this.list%Names%UseCase.execute(query);
  }

  get%Name%(id: string): Promise<%Name%Detail> {
    return this.get%Name%UseCase.execute(id);
  }

  create%Name%(command: Create%Name%Command): Promise<Create%Name%Result> {
    return this.create%Name%UseCase.execute(command);
  }

  update%Name%(command: Update%Name%Command): Promise<void> {
    return this.update%Name%UseCase.execute(command);
  }

  delete%Name%(id: string): Promise<void> {
    return this.delete%Name%UseCase.execute(id);
  }
}
`,

  'adapter/in/web/%name%/Create%Name%Request.ts': `import { z } from 'zod';

export const create%Name%Schema = z.object({
  name: z.string().trim().min(1, '名稱必填').max(100, '名稱最多 100 字元'),
});

export type Create%Name%Request = z.infer<typeof create%Name%Schema>;
`,

  'adapter/in/web/%name%/Update%Name%Request.ts': `import { z } from 'zod';

export const update%Name%Schema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  status: z.boolean().optional(),
});

export type Update%Name%Request = z.infer<typeof update%Name%Schema>;
`,

  'adapter/in/web/%name%/List%Names%Query.ts': `import { z } from 'zod';

export const list%Names%QuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  name: z.string().trim().optional(),
  status: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type List%Names%Query = z.infer<typeof list%Names%QuerySchema>;
`,

  'adapter/in/web/%name%/%Name%Controller.ts': `import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { %Name%Facade } from '../../../../application/facade/%Name%Facade';
import { ZodValidationPipe } from '../../../../infrastructure/zod-validation.pipe';
import { list%Names%QuerySchema, List%Names%Query } from './List%Names%Query';
import { create%Name%Schema, Create%Name%Request } from './Create%Name%Request';
import { update%Name%Schema, Update%Name%Request } from './Update%Name%Request';

// TODO: 依模組權限掛上 @UseGuards(PermissionsGuard) + @Permissions(...)（見 RoleController）
@Controller('%names%')
export class %Name%Controller {
  constructor(private readonly %camelName%Facade: %Name%Facade) {}

  @Get()
  list%Names%(
    @Query(new ZodValidationPipe(list%Names%QuerySchema))
    query: List%Names%Query,
  ) {
    return this.%camelName%Facade.list%Names%(query);
  }

  @Get(':id')
  get%Name%(@Param('id', ParseUUIDPipe) id: string) {
    return this.%camelName%Facade.get%Name%(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create%Name%(
    @Body(new ZodValidationPipe(create%Name%Schema)) dto: Create%Name%Request,
  ) {
    return this.%camelName%Facade.create%Name%({ name: dto.name });
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update%Name%(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(update%Name%Schema)) dto: Update%Name%Request,
  ) {
    await this.%camelName%Facade.update%Name%({ id, ...dto });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete%Name%(@Param('id', ParseUUIDPipe) id: string) {
    await this.%camelName%Facade.delete%Name%(id);
  }
}
`,

  'adapter/out/persistence/%name%/Prisma%Name%Repository.ts': `import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import {
  %NAME%_REPOSITORY_PORT,
  %Name%RepositoryPort,
  List%Names%Params,
  List%Names%Page,
  %Name%Record,
} from '../../../../application/port/out/%name%/%Name%RepositoryPort';

// %NAME%_REPOSITORY_PORT re-export 方便 module 綁定一處 import
export { %NAME%_REPOSITORY_PORT };

/**
 * Prisma 持久層。依賴 schema.prisma 的 model %Name%Record（欄位 id / name /
 * status / createdAt / updatedAt / deletedAt）；請先建 model + db:generate 才會 typecheck 過。
 */
@Injectable()
export class Prisma%Name%Repository implements %Name%RepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: List%Names%Params): Promise<List%Names%Page> {
    const where = {
      deletedAt: null,
      ...(params.name ? { name: { contains: params.name } } : {}),
      ...(params.status !== undefined ? { status: params.status } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.%camelName%Record.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.%camelName%Record.count({ where }),
    ]);
    return { data: rows.map((r) => this.toRecord(r)), total };
  }

  async findById(id: string): Promise<%Name%Record | null> {
    const row = await this.prisma.%camelName%Record.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.toRecord(row) : null;
  }

  async create(data: { name: string }): Promise<%Name%Record> {
    const row = await this.prisma.%camelName%Record.create({
      data: { name: data.name },
    });
    return this.toRecord(row);
  }

  async update(
    id: string,
    data: { name?: string; status?: boolean },
  ): Promise<void> {
    await this.prisma.%camelName%Record.update({ where: { id }, data });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.%camelName%Record.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private toRecord(row: {
    id: string;
    name: string;
    status: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): %Name%Record {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
`,

  'domain/exception/%Name%NotFoundException.ts': `import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class %Name%NotFoundException extends DomainException {
  constructor() {
    super(ResponseCodes.%NAME%_NOT_FOUND, 'NOT_FOUND');
  }
}
`,

  'modules/%name%.module.ts': `import { Module } from '@nestjs/common';
import { %Name%Controller } from '../adapter/in/web/%name%/%Name%Controller';
import { %Name%Facade } from '../application/facade/%Name%Facade';
import { Prisma%Name%Repository } from '../adapter/out/persistence/%name%/Prisma%Name%Repository';
import { %NAME%_REPOSITORY_PORT } from '../application/port/out/%name%/%Name%RepositoryPort';
import { LIST_%NAMES%_USE_CASE } from '../application/port/in/%name%/List%Names%UseCase';
import { GET_%NAME%_USE_CASE } from '../application/port/in/%name%/Get%Name%UseCase';
import { CREATE_%NAME%_USE_CASE } from '../application/port/in/%name%/Create%Name%UseCase';
import { UPDATE_%NAME%_USE_CASE } from '../application/port/in/%name%/Update%Name%UseCase';
import { DELETE_%NAME%_USE_CASE } from '../application/port/in/%name%/Delete%Name%UseCase';
import { List%Names%Service } from '../application/service/%name%/List%Names%Service';
import { Get%Name%Service } from '../application/service/%name%/Get%Name%Service';
import { Create%Name%Service } from '../application/service/%name%/Create%Name%Service';
import { Update%Name%Service } from '../application/service/%name%/Update%Name%Service';
import { Delete%Name%Service } from '../application/service/%name%/Delete%Name%Service';

@Module({
  controllers: [%Name%Controller],
  providers: [
    Prisma%Name%Repository,
    { provide: %NAME%_REPOSITORY_PORT, useExisting: Prisma%Name%Repository },
    { provide: LIST_%NAMES%_USE_CASE, useClass: List%Names%Service },
    { provide: GET_%NAME%_USE_CASE, useClass: Get%Name%Service },
    { provide: CREATE_%NAME%_USE_CASE, useClass: Create%Name%Service },
    { provide: UPDATE_%NAME%_USE_CASE, useClass: Update%Name%Service },
    { provide: DELETE_%NAME%_USE_CASE, useClass: Delete%Name%Service },
    %Name%Facade,
  ],
})
export class %Name%Module {}
`,
};

/**
 * swagger yaml 骨架（路徑相對 `docs/swagger/<side>/`）。
 *
 * 沿用專案慣例：成功回應一律 inline 寫出 `{ success, data, timestamp }`，
 * 不用 `$ref: SuccessResponse`——後者的 data 是 generic object，
 * openapi-typescript 會推導成 `Record<string, unknown> | null`，前端型別失去意義。
 */
const SWAGGER_TEMPLATES: Record<string, string> = {
  '%names%/list.yaml': `tags: [%Names%]
summary: %Name% 列表
description: |
  分頁取得 %Name% 列表。骨架由 gen:module 產生，請依實際欄位調整。
security:
  - bearerAuth: []
parameters:
  - in: query
    name: page
    required: false
    schema: { type: integer, minimum: 1, default: 1 }
    description: 頁碼
  - in: query
    name: limit
    required: false
    schema: { type: integer, minimum: 1, maximum: 200 }
    description: 每頁筆數（未指定用 env DEFAULT_PAGE_LIMIT）
responses:
  '200':
    description: 查詢成功
    content:
      application/json:
        schema:
          type: object
          required: [success, data, timestamp]
          properties:
            success: { type: boolean, example: true }
            data:
              type: object
              properties:
                list:
                  type: array
                  description: %Name% 清單
                  items:
                    type: object
                    properties:
                      id: { type: string, format: uuid, description: ID }
                      name: { type: string, description: 名稱 }
                      status: { type: boolean, description: 是否啟用 }
                meta:
                  type: object
                  properties:
                    total: { type: integer, description: 總筆數 }
                    page: { type: integer, description: 目前頁碼 }
                    limit: { type: integer, description: 每頁筆數 }
            timestamp: { type: string, format: date-time }
`,
  '%names%/get.yaml': `tags: [%Names%]
summary: %Name% 明細
security:
  - bearerAuth: []
parameters:
  - in: path
    name: id
    required: true
    schema: { type: string, format: uuid }
    description: %Name% ID
responses:
  '200':
    description: 查詢成功
    content:
      application/json:
        schema:
          type: object
          required: [success, data, timestamp]
          properties:
            success: { type: boolean, example: true }
            data:
              type: object
              properties:
                id: { type: string, format: uuid, description: ID }
                name: { type: string, description: 名稱 }
                status: { type: boolean, description: 是否啟用 }
            timestamp: { type: string, format: date-time }
`,
  '%names%/create.yaml': `tags: [%Names%]
summary: 建立 %Name%
security:
  - bearerAuth: []
requestBody:
  required: true
  content:
    application/json:
      schema:
        type: object
        required: [name]
        properties:
          name: { type: string, description: 名稱 }
          status: { type: boolean, description: 是否啟用, default: true }
responses:
  '201':
    description: 建立成功
    content:
      application/json:
        schema:
          type: object
          required: [success, data, timestamp]
          properties:
            success: { type: boolean, example: true }
            data:
              type: object
              properties:
                id: { type: string, format: uuid, description: ID }
            timestamp: { type: string, format: date-time }
`,
  '%names%/update.yaml': `tags: [%Names%]
summary: 更新 %Name%
security:
  - bearerAuth: []
parameters:
  - in: path
    name: id
    required: true
    schema: { type: string, format: uuid }
    description: %Name% ID
requestBody:
  required: true
  content:
    application/json:
      schema:
        type: object
        properties:
          name: { type: string, description: 名稱 }
          status: { type: boolean, description: 是否啟用 }
responses:
  '200':
    description: 更新成功
    content:
      application/json:
        schema:
          type: object
          required: [success, data, timestamp]
          properties:
            success: { type: boolean, example: true }
            data: { type: object, nullable: true }
            timestamp: { type: string, format: date-time }
`,
  '%names%/delete.yaml': `tags: [%Names%]
summary: 刪除 %Name%
security:
  - bearerAuth: []
parameters:
  - in: path
    name: id
    required: true
    schema: { type: string, format: uuid }
    description: %Name% ID
responses:
  '200':
    description: 刪除成功
    content:
      application/json:
        schema:
          type: object
          required: [success, data, timestamp]
          properties:
            success: { type: boolean, example: true }
            data: { type: object, nullable: true }
            timestamp: { type: string, format: date-time }
`,
};

const API_SRC = resolve(__dirname, '..', 'src');
const API_DOCS = resolve(__dirname, '..', 'docs', 'swagger');

/** 把新 module 註冊進 app.module.ts（冪等；找不到錨點則警告降級） */
const patchAppModule = (n: Names, side: string, moduleClass: string): void => {
  const path = join(API_SRC, 'app.module.ts');
  let content = readFileSync(path, 'utf8');
  if (content.includes(moduleClass)) {
    console.log(`skip AppModule（已含 ${moduleClass}）`);
    return;
  }
  const importRe = /import \{[^}]*\} from '\.\/modules\/[^']+';/g;
  let lastEnd = -1;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(content)) !== null) {
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd === -1) {
    console.warn('找不到 ./modules import 錨點，請手動註冊 AppModule');
    return;
  }
  const importLine = `\nimport { ${moduleClass} } from './modules/${side}/${n.name}.module';`;
  content = content.slice(0, lastEnd) + importLine + content.slice(lastEnd);
  // 後台掛在 AuthModule 後；前台掛在 PingModule 後（前台群組），找不到就退回 AuthModule
  const anchorName =
    side === 'front' && /^\s*PingModule,$/m.test(content)
      ? 'PingModule'
      : 'AuthModule';
  const arrayRe = new RegExp(`^(\\s*)${anchorName},$`, 'm');
  if (arrayRe.test(content)) {
    content = content.replace(arrayRe, `$1${anchorName},\n$1${moduleClass},`);
  } else {
    console.warn(`找不到 imports 陣列 ${anchorName} 錨點，請手動加入 module`);
  }
  writeFileSync(path, content);
  console.log(`AppModule 註冊 ${moduleClass}`);
};

/**
 * 把錯誤碼注入 response-codes.ts（冪等）。
 *
 * 必須與 patchResponseMessages 成對執行：response-messages.ts 以
 * `satisfies Record<ResponseCode, …>` 約束，只加 code 不加訊息會讓 typecheck 失敗。
 */
const patchResponseCodes = (n: Names): void => {
  const path = join(API_SRC, 'shared', 'constants', 'response-codes.ts');
  const key = `${n.NAME}_NOT_FOUND`;
  let content = readFileSync(path, 'utf8');
  if (content.includes(`${key}:`)) {
    console.log(`skip ResponseCodes（已含 ${key}）`);
    return;
  }
  // 錨點取物件的最後一個項目（INTERNAL_SERVER_ERROR），插在它之前以維持既有分組
  const anchor = /^([ \t]*)INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',$/m;
  if (!anchor.test(content)) {
    console.warn(`找不到 ResponseCodes 錨點，請手動加入 ${key}`);
    return;
  }
  content = content.replace(
    anchor,
    `$1${key}: '${key}',\n$1INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',`,
  );
  writeFileSync(path, content);
  console.log(`ResponseCodes 注入 ${key}`);
};

/** 把對應訊息注入 response-messages.ts（冪等；與 patchResponseCodes 成對） */
const patchResponseMessages = (n: Names): void => {
  const path = join(API_SRC, 'shared', 'constants', 'response-messages.ts');
  const key = `${n.NAME}_NOT_FOUND`;
  let content = readFileSync(path, 'utf8');
  if (content.includes(`${key}:`)) {
    console.log(`skip ResponseMessages（已含 ${key}）`);
    return;
  }
  const anchor = /^([ \t]*)(\/\/ 系統：刻意維持通用英文訊息.*)$/m;
  if (!anchor.test(content)) {
    console.warn(`找不到 ResponseMessages 錨點，請手動加入 ${key}`);
    return;
  }
  content = content.replace(
    anchor,
    `$1// ${n.Name}\n$1${key}: '${n.Name} 不存在',\n\n$1$2`,
  );
  writeFileSync(path, content);
  console.log(`ResponseMessages 注入 ${key}`);
};

/** 產生 swagger yaml 骨架並註冊進 openapi.yaml 的 paths（冪等） */
const writeSwagger = (n: Names, side: string, force: boolean): void => {
  for (const [tplPath, tplContent] of Object.entries(SWAGGER_TEMPLATES)) {
    const outPath = join(API_DOCS, side, render(tplPath, n));
    if (existsSync(outPath) && !force) continue;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, render(tplContent, n));
  }

  const indexPath = join(API_DOCS, side, 'openapi.yaml');
  let content = readFileSync(indexPath, 'utf8');
  if (content.includes(`  /${n.names}:`)) {
    console.log(`skip openapi.yaml（已含 /${n.names}）`);
    return;
  }
  if (!/^paths:$/m.test(content)) {
    console.warn('找不到 openapi.yaml 的 paths 錨點，請手動註冊路由');
    return;
  }
  // 路由順序對齊 controller：list / create 在集合路徑，get / update / delete 在 {id}
  const block =
    `\n  /${n.names}:\n` +
    `    get:\n      $ref: './${n.names}/list.yaml'\n` +
    `    post:\n      $ref: './${n.names}/create.yaml'\n` +
    `\n  /${n.names}/{id}:\n` +
    `    get:\n      $ref: './${n.names}/get.yaml'\n` +
    `    patch:\n      $ref: './${n.names}/update.yaml'\n` +
    `    delete:\n      $ref: './${n.names}/delete.yaml'\n`;
  content = content.replace(/^paths:$/m, `paths:${block}`);
  writeFileSync(indexPath, content);
  console.log(`openapi.yaml 註冊 /${n.names}`);
};

/** 重新產生 swagger bundle 與 api-client 型別（失敗僅警告，檔案已寫出） */
const syncSwaggerArtifacts = (side: string): void => {
  const run = (label: string, command: string, cwd: string): void => {
    try {
      execSync(command, { cwd, stdio: 'pipe' });
      console.log(`${label} 完成`);
    } catch {
      console.warn(`${label} 失敗，請手動執行：${command}`);
    }
  };
  const apiRoot = resolve(__dirname, '..');
  run('swagger:bundle', 'pnpm swagger:bundle', apiRoot);
  // api-client 目前只生成 admin 側型別
  if (side === 'admin') {
    run(
      'api-client generate',
      'pnpm --filter @app/api-client generate',
      resolve(apiRoot, '..', '..'),
    );
  }
};

const main = (): void => {
  const args = process.argv.slice(2);
  const rawName = args.find((a) => !a.startsWith('--'));
  const force = args.includes('--force');
  const side = args.includes('--front') ? 'front' : 'admin';
  if (!rawName) {
    console.error(
      '用法: pnpm --filter @app/api gen:module <name> [--admin|--front] [--force]',
    );
    process.exit(1);
  }
  const n = toNames(rawName);
  const moduleClass =
    side === 'front' ? `Front${n.Name}Module` : `${n.Name}Module`;
  let written = 0;
  let skipped = 0;
  for (const [tplPath, tplContent] of Object.entries(TEMPLATES)) {
    const rendered = render(tplPath, n);
    const rel = isInSide(rendered) ? toSidePath(rendered, side) : rendered;
    const outPath = join(API_SRC, rel);
    if (existsSync(outPath) && !force) {
      console.log(`skip（已存在）: ${rel}`);
      skipped += 1;
      continue;
    }
    let out = render(tplContent, n);
    if (isInSide(rendered)) out = toSideContent(out, side, n, moduleClass);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, out);
    written += 1;
  }
  console.log(`\n產生 ${written} 檔（略過 ${skipped}）｜側別：${side}`);
  patchAppModule(n, side, moduleClass);
  patchResponseCodes(n);
  patchResponseMessages(n);
  writeSwagger(n, side, force);
  syncSwaggerArtifacts(side);
  const guardStep =
    side === 'front'
      ? '前台通常公開唯讀：視需要移除 write 端點；若需認證再掛 guard'
      : `視需要在 ${n.Name}Controller 掛權限 guard（見 RoleController）`;
  console.log(
    `\n${moduleClass} 完成（路由 /api/${side}/${n.names}）。後續手動步驟:\n` +
      `  1. prisma/schema.prisma 新增 model ${n.Name}Record（id / name / status / createdAt / updatedAt / deletedAt 可空）\n` +
      `  2. pnpm --filter @app/api db:migrate（建表 + 重生 client 型別）\n` +
      `  3. 依實際欄位調整 DTO / port / service / Prisma repo,並同步 docs/swagger/${side}/${n.names}/ 的 yaml 骨架\n` +
      `  4. ${guardStep}\n` +
      `  5. pnpm --filter @app/api typecheck && pnpm --filter @app/api test`,
  );
};

main();
