import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * 테스트용 메모리 Supabase. 실제 프로젝트에서 문제가 됐거나 될 수 있는 동작을 그대로 흉내 낸다.
 *  - RLS: 로그인한 사용자 본인의 행만 보이고, 다른 user_id로 쓰면 거부
 *  - trend_analyses.source check 제약(0001): 'NAVER DataLab + OpenAI'만 허용
 *  - timestamptz는 Postgres처럼 "+00:00" 형식으로 돌려줌
 *  - culture_relations: (source_version, target_version, type) 유일, source_trend < target_trend, score 0~1
 *  - save_culture_knowledge RPC: 같은 트렌드·분석 시각이면 같은 버전을 돌려줌(멱등), 아니면 버전 번호 +1
 * 여러 클라이언트가 같은 DB(store)를 공유하므로 "다른 브라우저, 같은 계정"을 재현할 수 있다.
 */
type Row = Record<string, unknown>;
export type FakeStore = { tables: Record<string, Row[]>; seq: number; objects: Record<string, { bytes: number; contentType?: string }> };
export const createStore = (): FakeStore => ({ tables: {}, seq: 0, objects: {} });

const uuid = (store: FakeStore) => `00000000-0000-4000-8000-${String(++store.seq).padStart(12, "0")}`;
const pgTime = (value: unknown) => { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? value : date.toISOString().replace("Z", "+00:00"); };
const TIME_COLUMNS = new Set(["analyzed_at", "dna_generated_at", "created_at"]);
const same = (a: unknown, b: unknown) => (TIME_COLUMNS.size && typeof a === "string" && typeof b === "string" && !Number.isNaN(Date.parse(a)) && !Number.isNaN(Date.parse(b)) && /T/.test(a) && /T/.test(b) ? Date.parse(a) === Date.parse(b) : a === b);
const out = (row: Row, columns?: string) => {
  const view: Row = {};
  const keys = !columns || columns === "*" ? Object.keys(row) : columns.split(",").map((key) => key.trim());
  for (const key of keys) view[key] = TIME_COLUMNS.has(key) && row[key] ? pgTime(row[key]) : row[key];
  return view;
};

class Query implements PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }> {
  private filters: Array<[string, unknown]> = [];
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private payload: Row | null = null;
  private columns?: string;
  private returnColumns?: string;
  private head = false;
  private countMode = false;
  private max?: number;
  private conflict?: string;
  constructor(private store: FakeStore, private table: string, private userId: string | null, private options: FakeOptions) {}
  select(columns?: string, opts?: { count?: string; head?: boolean }) { if (this.op === "select") { this.columns = columns; this.head = Boolean(opts?.head); this.countMode = opts?.count === "exact"; } else this.returnColumns = columns ?? "*"; return this; }
  insert(row: Row) { this.op = "insert"; this.payload = row; return this; }
  update(row: Row) { this.op = "update"; this.payload = row; return this; }
  upsert(row: Row, opts?: { onConflict?: string }) { this.op = "upsert"; this.payload = row; this.conflict = opts?.onConflict; return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  order() { return this; }
  limit(value: number) { this.max = value; return this; }
  returns() { return this; }
  private rows() { return (this.store.tables[this.table] ??= []); }
  private field(row: Row, key: string) { if (!key.includes("->>")) return row[key]; const [column, path] = key.split("->>"); const value = (row[column] as Row | null)?.[path]; return value === undefined || value === null ? value : String(value); }
  private visible() { return this.rows().filter((row) => this.userId && row.user_id === this.userId && this.filters.every(([key, value]) => same(this.field(row, key), value))); }
  private check(row: Row): string | null {
    if (!this.userId) return "permission denied";
    if (row.user_id !== this.userId) return `new row violates row-level security policy for table "${this.table}"`;
    if (this.table === "trend_analyses" && row.source !== "NAVER DataLab + OpenAI") return 'new row for relation "trend_analyses" violates check constraint "trend_analyses_source_check"';
    if (this.table === "saved_items" && !["insight", "plan", "collision", "lab"].includes(String(row.item_type))) return 'violates check constraint "saved_items_item_type_check"';
    if (this.table === "culture_relations") {
      if (!(String(row.source_trend_id) < String(row.target_trend_id))) return 'violates check constraint "culture_relation_distinct_trends_check"';
      if (row.score !== null && row.score !== undefined && (Number(row.score) < 0 || Number(row.score) > 1)) return 'violates check constraint "culture_relations_score_check"';
      const owner = (this.store.tables.culture_trends ?? []).filter((trend) => trend.user_id === row.user_id).map((trend) => trend.id);
      if (!owner.includes(row.source_trend_id) || !owner.includes(row.target_trend_id)) return 'violates foreign key constraint "culture_relation_source_owner_fk"';
    }
    return null;
  }
  then<T1 = { data: unknown; error: { message: string } | null; count?: number | null }, T2 = never>(resolve?: ((value: { data: unknown; error: { message: string } | null; count?: number | null }) => T1 | PromiseLike<T1>) | null, reject?: ((reason: unknown) => T2 | PromiseLike<T2>) | null) {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
  private run(): { data: unknown; error: { message: string } | null; count?: number | null } {
    if (!this.userId) return { data: null, error: { message: `permission denied for table ${this.table}` } };
    if ((this.options.missingTables ?? []).includes(this.table)) return { data: null, error: { message: `Could not find the table 'public.${this.table}' in the schema cache` } };
    // 원격에 없는 컬럼(예: 0004 미적용으로 trend_analyses.youtube 없음)은 PostgREST처럼 거부한다.
    const missing = (this.options.missingColumns ?? {})[this.table] ?? [];
    const used = [...Object.keys(this.payload ?? {}), ...(this.columns ?? "").split(",").map((key) => key.trim())];
    const absent = missing.find((column) => used.includes(column));
    if (absent) return { data: null, error: { message: `Could not find the '${absent}' column of '${this.table}' in the schema cache` } };
    if (this.op === "select") {
      const rows = this.visible().slice(0, this.max);
      return { data: this.head ? null : rows.map((row) => out(row, this.columns)), error: null, count: this.countMode ? rows.length : null };
    }
    if (this.op === "update") {
      if (this.options.failUpdate) return { data: [], error: null };
      const targets = this.visible();
      for (const row of targets) { const error = this.check({ ...row, ...this.payload }); if (error) return { data: null, error: { message: error } }; Object.assign(row, this.payload); }
      return { data: targets.map((row) => out(row, this.returnColumns)), error: null };
    }
    const row: Row = { id: uuid(this.store), created_at: new Date(Date.now() + this.store.seq).toISOString(), ...this.payload };
    const error = this.check(row);
    if (error) return { data: null, error: { message: error } };
    if (this.table === "culture_relations" || (this.op === "upsert" && this.conflict)) {
      const keys = (this.conflict ?? "source_analysis_version_id,target_analysis_version_id,relation_type").split(",");
      const existing = this.rows().find((item) => keys.every((key) => same(item[key], row[key])));
      if (existing) {
        if (this.op === "insert") return { data: null, error: { message: 'duplicate key value violates unique constraint "culture_relation_version_type_unique"' } };
        Object.assign(existing, { ...this.payload });
        return { data: [out(existing, this.returnColumns)], error: null };
      }
    }
    this.rows().push(row);
    return { data: [out(row, this.returnColumns)], error: null };
  }
}

export type FakeOptions = { failUpdate?: boolean; missingColumns?: Record<string, string[]>; missingTables?: string[]; missingBucket?: boolean };
export function fakeSupabase(store: FakeStore, user: { id: string; email?: string } | null, options: FakeOptions = {}) {
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table: string) => new Query(store, table, user?.id ?? null, options),
    /* Storage(0008): 비공개 버킷, 경로 첫 폴더가 본인 user_id인 객체만 읽기·쓰기·삭제 가능(RLS 흉내). */
    storage: {
      from: (bucket: string) => {
        const key = (path: string) => `${bucket}/${path}`;
        const own = (path: string) => Boolean(user) && path.split("/")[0] === user!.id;
        const missing = () => options.missingBucket ? { message: "Bucket not found" } : null;
        return {
          upload: async (path: string, body: Blob, opts: { upsert?: boolean; contentType?: string } = {}) => {
            if (missing()) return { data: null, error: missing() };
            if (!own(path)) return { data: null, error: { message: "new row violates row-level security policy" } };
            if (store.objects[key(path)] && !opts.upsert) return { data: null, error: { message: "The resource already exists" } };
            store.objects[key(path)] = { bytes: body.size, contentType: opts.contentType };
            return { data: { path }, error: null };
          },
          createSignedUrl: async (path: string, expiresIn: number) => {
            if (missing()) return { data: null, error: missing() };
            if (!own(path) || !store.objects[key(path)]) return { data: null, error: { message: "Object not found" } };
            return { data: { signedUrl: `https://fake.supabase.storage/${key(path)}?expires=${expiresIn}` }, error: null };
          },
          remove: async (paths: string[]) => {
            if (missing()) return { data: null, error: missing() };
            const removed = paths.filter((path) => own(path) && store.objects[key(path)]);
            removed.forEach((path) => delete store.objects[key(path)]);
            return { data: removed.map((name) => ({ name })), error: null };
          },
        };
      },
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== "save_culture_knowledge") return { data: null, error: { message: "function not found" } };
      if (!user) return { data: null, error: { message: "permission denied for function save_culture_knowledge" } };
      const trend = args.p_trend as Row, analysis = args.p_analysis as Row;
      const trends = (store.tables.culture_trends ??= []), versions = (store.tables.culture_analysis_versions ??= []);
      let trendRow = trends.find((row) => row.user_id === user.id && row.trend_key === trend.trendKey);
      if (!trendRow) { trendRow = { id: uuid(store), user_id: user.id, trend_key: trend.trendKey, canonical_name: trend.canonicalName, display_name: trend.displayName, is_demo: false }; trends.push(trendRow); }
      let version = versions.find((row) => row.trend_id === trendRow!.id && same(row.analyzed_at, analysis.analyzedAt));
      if (!version) {
        const next = Math.max(0, ...versions.filter((row) => row.trend_id === trendRow!.id).map((row) => Number(row.version_number))) + 1;
        version = { id: uuid(store), user_id: user.id, trend_id: trendRow.id, source_analysis_id: analysis.sourceAnalysisId ?? null, version_number: next, schema_version: analysis.schemaVersion, metadata: analysis.metadata, original_dna: analysis.originalDna, model: analysis.model ?? null, prompt_version: analysis.promptVersion ?? null, embedding_model: analysis.embeddingModel ?? null, analyzed_at: analysis.analyzedAt };
        versions.push(version);
        for (const attribute of args.p_attributes as Row[]) (store.tables.culture_trend_attributes ??= []).push({ id: uuid(store), user_id: user.id, analysis_version_id: version.id, ...attribute });
        for (const evidence of args.p_evidence as Row[]) (store.tables.culture_evidence_items ??= []).push({ id: uuid(store), user_id: user.id, analysis_version_id: version.id, ...evidence });
      }
      return { data: [{ saved_trend_id: trendRow.id, saved_analysis_version_id: version.id, saved_version_number: version.version_number }], error: null };
    },
  };
  return client as unknown as SupabaseClient;
}

export const rowCount = (store: FakeStore, table: string, userId?: string) => (store.tables[table] ?? []).filter((row) => !userId || row.user_id === userId).length;
