import Database from 'better-sqlite3'
import { PERMANENT_FDI_TOOTH_CODES } from '@dental-tech/domain'
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type SqliteDatabase = Database.Database

const migrationDirectory = fileURLToPath(new URL('./migrations/', import.meta.url))

export function defaultDatabasePath(): string {
  return process.env.DTC_DB_PATH || resolve(process.cwd(), '.local', 'dental-tech-calendar.sqlite')
}

export function defaultTestDatabasePath(): string {
  // The development web app and its deterministic test dataset share one SQLite file.
  return defaultDatabasePath()
}

export function openDatabase(path = defaultDatabasePath()): SqliteDatabase {
  if (path !== ':memory:') {
    const absolutePath = isAbsolute(path) ? path : resolve(path)
    mkdirSync(dirname(absolutePath), { recursive: true })
    path = absolutePath
  }

  const database = new Database(path)
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  if (path !== ':memory:') database.pragma('journal_mode = WAL')
  return database
}

export function currentSchemaVersion(database: SqliteDatabase): number {
  const ledgerExists = database
    .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get()

  if (!ledgerExists) return 0
  const row = database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as
    | { version: number }
    | undefined
  return row?.version ?? 0
}

export function migrateDatabase(database: SqliteDatabase): number {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    )
  `)

  const files = readdirSync(migrationDirectory)
    .filter((file) => /^\d{3,}-[a-z0-9-]+\.sql$/i.test(file))
    .sort()

  const migrations = files.map((file) => {
    const match = /^(\d+)-(.+)\.sql$/i.exec(file)
    if (!match) throw new Error(`Invalid migration filename: ${file}`)
    return { version: Number(match[1]), name: file.replace(/\.sql$/i, ''), file: join(migrationDirectory, file) }
  })

  const latestVersion = migrations.at(-1)?.version ?? 0
  const currentVersion = currentSchemaVersion(database)
  if (currentVersion > latestVersion) {
    throw new Error(`Database schema ${currentVersion} is newer than this application supports (${latestVersion})`)
  }

  for (const migration of migrations) {
    const existing = database
      .prepare('SELECT name FROM schema_migrations WHERE version = ?')
      .get(migration.version) as { name: string } | undefined

    if (existing) {
      if (existing.name !== migration.name) {
        throw new Error(`Migration ${migration.version} is recorded as ${existing.name}, expected ${migration.name}`)
      }
      continue
    }

    const sql = readFileSync(migration.file, 'utf8')
    database.transaction(() => {
      database.exec(sql)
      database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name)
    })()
  }

  return currentSchemaVersion(database)
}

export function resetTestDatabase(path = defaultTestDatabasePath()): SqliteDatabase {
  const absolutePath = isAbsolute(path) ? path : resolve(path)
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${absolutePath}${suffix}`, { force: true })
  const database = openDatabase(absolutePath)
  migrateDatabase(database)
  return database
}

export function seedTestDatabase(database: SqliteDatabase): void {
  if (currentSchemaVersion(database) === 0) {
    throw new Error('Run migrations before seeding the test database')
  }
  if (currentSchemaVersion(database) < 7) {
    throw new Error('The product schema is required before seeding the test database')
  }

  const fixtureDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../database/fixtures')
  const doctorsFixture = JSON.parse(readFileSync(join(fixtureDirectory, 'doctors.demo.json'), 'utf8')) as {
    doctors: Array<{ id: string; firstName: string; lastName: string; phone: string; comment: string; active: boolean }>
  }
  const pricingFixture = JSON.parse(readFileSync(join(fixtureDirectory, 'pricing.demo.json'), 'utf8')) as {
    items: Array<{
      id: string
      name: string
      calculationMode: string
      unitPrice?: number
      fixedPrice?: number
      active: boolean
      metadata?: Record<string, unknown>
    }>
  }
  const anchor = Date.parse('2026-09-24T12:00:00.000Z')
  const iso = (dayOffset: number, hour = 12) => new Date(anchor + dayOffset * 86_400_000 + (hour - 12) * 3_600_000).toISOString()
  const now = iso(0)

  database.transaction(() => {
    database.prepare('DELETE FROM order_financials').run()
    database.prepare('DELETE FROM work_items').run()
    database.prepare('DELETE FROM orders').run()
    database.prepare('DELETE FROM pricing_items').run()
    database.prepare('DELETE FROM expense_pricing_items').run()
    database.prepare('DELETE FROM doctors').run()
    database.prepare('DELETE FROM colors').run()
    database.prepare('DELETE FROM required_field_settings').run()
    database.prepare('DELETE FROM app_settings').run()

    const insertDoctor = database.prepare(`
      INSERT INTO doctors (id, first_name, last_name, phone, comment, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const doctor of doctorsFixture.doctors) {
      insertDoctor.run(doctor.id, doctor.firstName, doctor.lastName, doctor.phone, doctor.comment, doctor.active ? 1 : 0, now, now)
    }

    const insertDirectoryEntry = (table: 'colors') => database.prepare(`
      INSERT INTO ${table} (id, name, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)
    `)
    const insertColor = insertDirectoryEntry('colors')
    for (const [index, name] of ['A1', 'A2', 'A3', 'B1', 'BL3'].entries()) {
      insertColor.run(`demo-color-${String(index + 1).padStart(3, '0')}`, name, now, now)
    }
    const insertExpensePricingItem = database.prepare(`
      INSERT INTO expense_pricing_items (id, name, unit_price, active, updated_at) VALUES (?, ?, NULL, 1, ?)
    `)
    for (const [index, name] of [
      'Курьерская доставка',
      'Литейка',
      'Расходные материалы',
      'Срочная доставка такси',
      'Транспорт',
      'поломка',
    ].entries()) {
      insertExpensePricingItem.run(`demo-expense-price-${String(index + 1).padStart(3, '0')}`, name, now)
    }

    const insertPricing = database.prepare(`
      INSERT INTO pricing_items (id, name, calculation_mode, unit_price, fixed_price, active, metadata_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const item of pricingFixture.items) {
      insertPricing.run(
        item.id,
        item.name,
        item.calculationMode,
        item.unitPrice ?? null,
        item.fixedPrice ?? null,
        item.active ? 1 : 0,
        JSON.stringify(item.metadata ?? {}),
        now,
      )
    }

    const doctorRows = database.prepare('SELECT id, first_name, last_name FROM doctors ORDER BY id').all() as Array<{
      id: string
      first_name: string
      last_name: string
    }>
    const pricingRows = database.prepare('SELECT id, name, unit_price, fixed_price FROM pricing_items WHERE active = 1 ORDER BY id').all() as Array<{
      id: string
      name: string
      unit_price: number | null
      fixed_price: number | null
    }>
    const insertOrder = database.prepare(`
      INSERT INTO orders (
        id, patient_label, doctor_id, doctor_name_snapshot, order_date, updated_at, deadline_at,
        status, closure_type, general_comment, archived_at, closure_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertWorkItem = database.prepare(`
      INSERT INTO work_items (
        id, order_id, pricing_item_id, work_type_snapshot, status, unit_mode, units,
        unit_price_snapshot, total_price_snapshot, accepted_amount, shade, comment, tooth_codes, started_at, completed_at,
        cancelled_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (let index = 1; index <= 30; index += 1) {
      const id = `demo-order-${String(index).padStart(3, '0')}`
      const completedOrder = index <= 20
      const doctor = doctorRows[(index - 1) % 4]
      const acceptanceTimestamp = iso(-Math.max(1, 32 - index), 9 + (index % 8))
      const orderDate = acceptanceTimestamp.slice(0, 10)
      const deadlineAt = completedOrder
        ? iso(-Math.max(1, 23 - index), 17)
        : index === 21
          ? iso(0, 17)
          : index === 22
            ? iso(-2, 17)
            : iso(index - 22, 17)
      const archivedAt = completedOrder ? iso(-Math.max(1, 20 - index), 18) : null
      insertOrder.run(
        id,
        `Пациент ${String((index - 1) % 25 + 1).padStart(2, '0')}`,
        doctor.id,
        `${doctor.first_name} ${doctor.last_name}`,
        orderDate,
        acceptanceTimestamp,
        deadlineAt,
        completedOrder ? 'CLOSED' : 'ACTIVE',
        completedOrder ? 'NORMAL' : null,
        `Синтетическая запись ${String(index).padStart(2, '0')}`,
        archivedAt,
        archivedAt?.slice(0, 10) ?? null,
      )

      const workItemCount = index % 3 === 0 ? 2 : 1
      for (let itemIndex = 1; itemIndex <= workItemCount; itemIndex += 1) {
        const pricing = pricingRows[(index + itemIndex - 2) % pricingRows.length]
        const itemCreatedAt = iso(-Math.max(1, 31 - index), 10)
        const startedAt = index <= 4 ? iso(-10, 9) : itemCreatedAt
        const itemCompletedAt = completedOrder ? (index <= 3 ? iso(-1, 16) : iso(-Math.max(1, 19 - index), 16)) : null
        const units = pricing.unit_price === null ? 1 : 1 + ((index + itemIndex) % 4)
        const unitMode = pricing.unit_price === null ? 'FIXED' : 'TOOTH_COUNT'
        const workItemId = `demo-work-${String(index).padStart(3, '0')}-${itemIndex}`
        const unitPrice = pricing.unit_price ?? pricing.fixed_price
        const calculatedTotal = unitPrice === null ? null : unitPrice * units
        const start = ((index * 3) + itemIndex) % PERMANENT_FDI_TOOTH_CODES.length
        const toothCodes = unitMode === 'TOOTH_COUNT'
          ? Array.from({ length: units }, (_, toothIndex) => PERMANENT_FDI_TOOTH_CODES[(start + toothIndex) % PERMANENT_FDI_TOOTH_CODES.length]).sort().join(',')
          : null
        insertWorkItem.run(
          workItemId,
          id,
          pricing.id,
          pricing.name,
          completedOrder ? 'COMPLETED' : 'ACTIVE',
          unitMode,
          units,
          null,
          null,
          calculatedTotal,
          ['A1', 'A2', 'A3', 'B1', 'BL3', null][(index + itemIndex) % 6],
          `Тестовая работа ${itemIndex} для заказа ${index}`,
          toothCodes,
          startedAt,
          itemCompletedAt,
          null,
          index <= 4 ? startedAt : itemCreatedAt,
          completedOrder ? itemCompletedAt! : now,
        )
      }
    }

    const insertRequired = database.prepare('INSERT INTO required_field_settings (field_key, required, updated_at) VALUES (?, ?, ?)')
    for (const [fieldKey, required] of [['patient_label', 1], ['doctor_id', 1], ['deadline_at', 1]] as const) {
      insertRequired.run(fieldKey, required, now)
    }
    const insertSetting = database.prepare('INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)')
    insertSetting.run('new_order_date_default', 'today', now)
  })()
}

export * from './data.ts'
