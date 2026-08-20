/**
 * 由 schema.prisma 的 `///` 註解產生 PostgreSQL 的 COMMENT ON 語句
 *
 * Prisma 的 `///` 只會進 Prisma Client 的 JSDoc，**不會產生 COMMENT ON**，
 * 因此資料庫端的欄位描述必須另外寫進 migration。這支負責把同一份描述轉成 SQL，
 * 避免兩邊各寫一次而漂移。
 *
 * 用法：
 *   pnpm --filter @app/api gen:comments >> prisma/migrations/<新migration>/migration.sql
 *
 * 改了 `///` 之後要開一支新的 migration 承載更新後的 COMMENT ON——
 * COMMENT ON 是冪等的，重下同一欄位會直接覆蓋舊描述。
 */
import * as fs from 'fs';
import * as path from 'path';

type FieldComment = { column: string; doc: string[] };
type ModelComment = {
  table: string;
  doc: string[];
  fields: FieldComment[];
};

/** PostgreSQL 字串常值跳脫：單引號成對化 */
const toLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/**
 * 解析 schema.prisma，取出帶 `///` 的 model 與欄位
 *
 * @param source - schema.prisma 的完整內容
 * @returns 每個 model 的表名與其有描述的欄位
 */
const parseSchema = (source: string): ModelComment[] => {
  const models: ModelComment[] = [];
  let pendingDoc: string[] = [];
  let current: ModelComment | null = null;

  const closeModel = (): void => {
    if (current) models.push(current);
    current = null;
  };

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();

    if (line.startsWith('///')) {
      pendingDoc.push(line.slice(3).trim());
      continue;
    }

    const modelStart = line.match(/^model\s+(\w+)\s*\{/);
    if (modelStart) {
      closeModel();
      current = { table: modelStart[1], doc: pendingDoc, fields: [] };
      pendingDoc = [];
      continue;
    }

    if (!current) {
      pendingDoc = [];
      continue;
    }

    const tableMap = line.match(/^@@map\("([^"]+)"\)/);
    if (tableMap) {
      current.table = tableMap[1];
      continue;
    }

    if (line === '}') {
      closeModel();
      pendingDoc = [];
      continue;
    }

    const field = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
    if (field && !line.startsWith('@@') && !line.startsWith('//')) {
      const [, name, , isList, , rest] = field;
      // 關聯欄位不是實體 column，沒有東西可以註解
      const isRelation = /@relation/.test(rest) || Boolean(isList);
      if (!isRelation && pendingDoc.length > 0) {
        const columnMap = rest.match(/@map\("([^"]+)"\)/);
        current.fields.push({
          column: columnMap ? columnMap[1] : name,
          doc: pendingDoc,
        });
      }
      pendingDoc = [];
      continue;
    }

    pendingDoc = [];
  }

  closeModel();
  return models;
};

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const models = parseSchema(fs.readFileSync(schemaPath, 'utf8'));

const statements = models.flatMap((model) => [
  ...(model.doc.length > 0
    ? [
        `COMMENT ON TABLE "${model.table}" IS ${toLiteral(model.doc.join('\n'))};`,
      ]
    : []),
  ...model.fields.map(
    (field) =>
      `COMMENT ON COLUMN "${model.table}"."${field.column}" IS ${toLiteral(field.doc.join('\n'))};`,
  ),
  '',
]);

console.log(statements.join('\n'));
