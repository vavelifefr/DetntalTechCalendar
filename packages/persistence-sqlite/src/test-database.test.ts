import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { currentSchemaVersion, resetTestDatabase, seedTestDatabase, type SqliteDatabase } from './index.ts'

describe('test database tooling', () => {
  let temporaryDirectory: string | undefined
  let openDatabases: SqliteDatabase[] = []

  afterEach(() => {
    for (const database of openDatabases) database.close()
    openDatabases = []
    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true })
      temporaryDirectory = undefined
    }
  })

  it('resets and seeds the same schema deterministically', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'dental-tech-calendar-'))
    const databasePath = join(temporaryDirectory, 'test.sqlite')

    const first = resetTestDatabase(databasePath)
    openDatabases.push(first)
    seedTestDatabase(first)
    expect(currentSchemaVersion(first)).toBe(10)
    const firstSnapshot = {
      version: currentSchemaVersion(first),
      migrations: first.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all(),
      doctors: first.prepare('SELECT COUNT(*) AS count FROM doctors').get(),
      pricing: first.prepare('SELECT COUNT(*) AS count FROM pricing_items').get(),
      expensePricing: first.prepare('SELECT COUNT(*) AS count FROM expense_pricing_items').get(),
      orders: first.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY status').all(),
      toothSelections: first.prepare('SELECT COUNT(*) AS count FROM work_items WHERE tooth_codes IS NOT NULL').get(),
      repeatedStartDates: first.prepare(`
        SELECT COUNT(*) AS count FROM (
          SELECT started_at FROM work_items WHERE started_at IS NOT NULL GROUP BY started_at HAVING COUNT(*) > 1
        )
      `).get(),
      repeatedCompletionDates: first.prepare(`
        SELECT COUNT(*) AS count FROM (
          SELECT completed_at FROM work_items WHERE completed_at IS NOT NULL GROUP BY completed_at HAVING COUNT(*) > 1
        )
      `).get(),
    }
    expect(firstSnapshot.doctors).toEqual({ count: 5 })
    expect(firstSnapshot.pricing).toEqual({ count: 20 })
    expect(firstSnapshot.expensePricing).toEqual({ count: 6 })
    expect(firstSnapshot.orders).toEqual([
      { status: 'ACTIVE', count: 10 },
      { status: 'CLOSED', count: 20 },
    ])
    expect((firstSnapshot.toothSelections as { count: number }).count).toBeGreaterThan(0)
    expect((firstSnapshot.repeatedStartDates as { count: number }).count).toBeGreaterThan(0)
    expect((firstSnapshot.repeatedCompletionDates as { count: number }).count).toBeGreaterThan(0)
    first.exec('CREATE TABLE reset_probe (id INTEGER PRIMARY KEY)')
    first.close()
    openDatabases = openDatabases.filter((database) => database !== first)

    const second = resetTestDatabase(databasePath)
    openDatabases.push(second)
    seedTestDatabase(second)
    const secondSnapshot = {
      version: currentSchemaVersion(second),
      migrations: second.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all(),
      doctors: second.prepare('SELECT COUNT(*) AS count FROM doctors').get(),
      pricing: second.prepare('SELECT COUNT(*) AS count FROM pricing_items').get(),
      expensePricing: second.prepare('SELECT COUNT(*) AS count FROM expense_pricing_items').get(),
      orders: second.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY status').all(),
      toothSelections: second.prepare('SELECT COUNT(*) AS count FROM work_items WHERE tooth_codes IS NOT NULL').get(),
      repeatedStartDates: second.prepare(`
        SELECT COUNT(*) AS count FROM (
          SELECT started_at FROM work_items WHERE started_at IS NOT NULL GROUP BY started_at HAVING COUNT(*) > 1
        )
      `).get(),
      repeatedCompletionDates: second.prepare(`
        SELECT COUNT(*) AS count FROM (
          SELECT completed_at FROM work_items WHERE completed_at IS NOT NULL GROUP BY completed_at HAVING COUNT(*) > 1
        )
      `).get(),
    }

    expect(secondSnapshot).toEqual(firstSnapshot)
    expect(second.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'reset_probe'").get()).toBeUndefined()
  })
})
