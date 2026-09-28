import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { currentSchemaVersion, getOrder, migrateDatabase, openDatabase } from './index.ts'

describe('SQLite migrations', () => {
  let database: Database.Database | undefined

  afterEach(() => {
    database?.close()
    database = undefined
  })

  it('opens an empty database and migrates it to the latest schema', () => {
    database = openDatabase(':memory:')

    expect(currentSchemaVersion(database)).toBe(0)
    expect(migrateDatabase(database)).toBe(10)
    expect(currentSchemaVersion(database)).toBe(10)
    expect(database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all()).toEqual([
      { version: 1, name: '001-foundation' },
      { version: 2, name: '002-orders-directory-pricing' },
      { version: 3, name: '003-work-item-teeth' },
      { version: 4, name: '004-work-item-tooth-codes' },
      { version: 5, name: '005-order-business-dates' },
      { version: 6, name: '006-workitem-values-and-order-ledger' },
      { version: 7, name: '007-colors-and-expense-categories' },
      { version: 8, name: '008-remove-calculated-price-snapshots' },
      { version: 9, name: '009-order-debt-payments' },
      { version: 10, name: '010-expense-pricing-snapshots' },
    ])
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orders'").get()).toEqual({
      name: 'orders',
    })
    expect(database.prepare('SELECT field_key, required FROM required_field_settings ORDER BY field_key').all()).toEqual([
      { field_key: 'deadline_at', required: 1 },
      { field_key: 'doctor_id', required: 1 },
      { field_key: 'patient_label', required: 1 },
    ])
  })

  it('does not reapply an already recorded migration', () => {
    database = openDatabase(':memory:')

    migrateDatabase(database)
    expect(migrateDatabase(database)).toBe(10)
    expect(migrateDatabase(database)).toBe(10)
    expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
      { version: 9 },
      { version: 10 },
    ])
  })

  it('migrates v3 tooth selections to WorkItem text without losing Orders or WorkItems', () => {
    database = openDatabase(':memory:')
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      )
    `)
    const migrationsDirectory = join(process.cwd(), 'packages', 'persistence-sqlite', 'src', 'migrations')
    const legacyMigrations = [
      { version: 1, name: '001-foundation' },
      { version: 2, name: '002-orders-directory-pricing' },
      { version: 3, name: '003-work-item-teeth' },
    ]
    for (const migration of legacyMigrations) {
      database.exec(readFileSync(join(migrationsDirectory, `${migration.name}.sql`), 'utf8'))
      database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name)
    }

    database.prepare(`
      INSERT INTO orders (id, created_at, updated_at, status)
      VALUES ('legacy-order', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 'ACTIVE')
    `).run()
    database.prepare(`
      INSERT INTO work_items (id, order_id, work_type_snapshot, status, unit_mode, units, created_at, updated_at)
      VALUES ('legacy-fdi-work', 'legacy-order', 'Циркон', 'ACTIVE', 'TOOTH_COUNT', 3, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
             ('legacy-fixed-work', 'legacy-order', 'Починка', 'ACTIVE', 'FIXED', 1, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')
    `).run()
    const insertTooth = database.prepare('INSERT INTO work_item_teeth (work_item_id, tooth_code) VALUES (?, ?)')
    for (const code of ['28', '11', '13']) insertTooth.run('legacy-fdi-work', code)

    expect(migrateDatabase(database)).toBe(10)
    expect(database.prepare('SELECT id FROM orders').all()).toEqual([{ id: 'legacy-order' }])
    expect(database.prepare('SELECT id, units, tooth_codes FROM work_items ORDER BY id').all()).toEqual([
      { id: 'legacy-fdi-work', units: 3, tooth_codes: '11,13,28' },
      { id: 'legacy-fixed-work', units: 1, tooth_codes: null },
    ])
    expect(getOrder(database, 'legacy-order')?.workItems[0].toothCodes).toEqual(['11', '13', '28'])
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'work_item_teeth'").get()).toBeUndefined()
  })

  it('migrates the legacy creation timestamp to one editable Order date and adds closure date', () => {
    database = openDatabase(':memory:')
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      )
    `)
    const migrationsDirectory = join(process.cwd(), 'packages', 'persistence-sqlite', 'src', 'migrations')
    const legacyMigrations = [
      { version: 1, name: '001-foundation' },
      { version: 2, name: '002-orders-directory-pricing' },
      { version: 3, name: '003-work-item-teeth' },
      { version: 4, name: '004-work-item-tooth-codes' },
    ]
    for (const migration of legacyMigrations) {
      database.exec(readFileSync(join(migrationsDirectory, `${migration.name}.sql`), 'utf8'))
      database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name)
    }
    database.prepare(`
      INSERT INTO orders (id, created_at, updated_at, deadline_at, status, archived_at)
      VALUES ('legacy-closed-order', '2026-06-03T15:42:00.000Z', '2026-06-05T10:00:00.000Z', '2026-06-10T14:00:00.000Z', 'CLOSED', '2026-06-05T10:01:00.000Z')
    `).run()

    expect(migrateDatabase(database)).toBe(10)
    expect(database.prepare('SELECT order_date, closure_date, archived_at FROM orders WHERE id = ?').get('legacy-closed-order')).toEqual({
      order_date: '2026-06-03',
      closure_date: null,
      archived_at: '2026-06-05T10:01:00.000Z',
    })
    expect(database.prepare('PRAGMA table_info(orders)').all()).not.toContainEqual(expect.objectContaining({ name: 'created_at' }))
    expect(getOrder(database, 'legacy-closed-order')?.orderDate).toBe('2026-06-03')
  })

  it('backfills accepted prices and separate expense/debt rows using the current realized-balance formula', () => {
    database = openDatabase(':memory:')
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      )
    `)
    const migrationsDirectory = join(process.cwd(), 'packages', 'persistence-sqlite', 'src', 'migrations')
    const legacyMigrations = [
      { version: 1, name: '001-foundation' },
      { version: 2, name: '002-orders-directory-pricing' },
      { version: 3, name: '003-work-item-teeth' },
      { version: 4, name: '004-work-item-tooth-codes' },
      { version: 5, name: '005-order-business-dates' },
    ]
    for (const migration of legacyMigrations) {
      database.exec(readFileSync(join(migrationsDirectory, `${migration.name}.sql`), 'utf8'))
      database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name)
    }
    database.prepare("INSERT INTO orders (id, order_date, updated_at, status) VALUES ('financial-order', '2026-06-03', '2026-06-03T00:00:00.000Z', 'CLOSED')").run()
    database.prepare(`
      INSERT INTO work_items (id, order_id, work_type_snapshot, status, unit_mode, units, total_price_snapshot, created_at, updated_at)
      VALUES ('priced-work', 'financial-order', 'Коронка', 'COMPLETED', 'FIXED', 1, 1250, '2026-06-03T00:00:00.000Z', '2026-06-03T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO order_financials (order_id, final_total, received_amount, expenses, debt, financial_result, currency_code, confirmed_at)
      VALUES ('financial-order', 1250, 500, 300, 250, 700, 'RUB', '2026-06-03T00:00:00.000Z')
    `).run()

    expect(migrateDatabase(database)).toBe(10)
    expect(database.prepare('SELECT accepted_amount FROM work_items WHERE id = ?').get('priced-work')).toEqual({ accepted_amount: 1250 })
    expect(database.prepare('SELECT amount, comment FROM order_expenses WHERE order_id = ?').get('financial-order')).toEqual({ amount: 300, comment: null })
    expect(database.prepare('SELECT amount, comment FROM order_debts WHERE order_id = ?').get('financial-order')).toEqual({ amount: 250, comment: null })
    expect(database.prepare('SELECT final_total, received_amount, expenses, debt, financial_result FROM order_financials WHERE order_id = ?').get('financial-order')).toEqual({
      final_total: 1250,
      received_amount: 500,
      expenses: 300,
      debt: 250,
      financial_result: 200,
    })
  })
})
