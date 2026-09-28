import { registerPlugin } from '@capacitor/core'

export type SqliteValue = string | number | boolean | null

export interface SqliteStatement {
  sql: string
  args?: SqliteValue[]
}

export type SqliteTransactionStep = SqliteStatement & { kind: 'query' | 'execute' }

interface QueryResult {
  rows: Array<Record<string, string | number | null>>
}

interface ExecuteResult {
  changes: number
  lastInsertRowId: number
}

interface TransactionResult {
  results: Array<QueryResult | ExecuteResult>
}

interface LocalDatabasePlugin {
  initialize(): Promise<{ schemaVersion: number }>
  query(options: SqliteStatement): Promise<QueryResult>
  execute(options: SqliteStatement): Promise<ExecuteResult>
  transaction(options: { steps: SqliteTransactionStep[] }): Promise<TransactionResult>
}

export const androidSqlite = registerPlugin<LocalDatabasePlugin>('LocalDatabase')
