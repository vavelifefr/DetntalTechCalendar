import {
  defaultTestDatabasePath,
  exportFullDatabase,
  migrateDatabase,
  openDatabase,
  resetTestDatabase,
  seedTestDatabase,
} from '../src/index.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const command = process.argv[2]

if (command === 'migrate') {
  const database = openDatabase()
  try {
    const version = migrateDatabase(database)
    console.log(`SQLite ready; schema version ${version}.`)
  } finally {
    database.close()
  }
} else if (command === 'reset') {
  const database = resetTestDatabase()
  try {
    console.log(`Shared web/test database reset and migrated: ${defaultTestDatabasePath()}`)
  } finally {
    database.close()
  }
} else if (command === 'seed') {
  const database = openDatabase(defaultTestDatabasePath())
  try {
    migrateDatabase(database)
    seedTestDatabase(database)
    console.log('Shared web/test database seeded: 20 closed Orders, 10 active Orders, 5 Doctors, 5 Colors, 20 Work Pricing items, 6 Expense Pricing items.')
  } finally {
    database.close()
  }
} else if (command === 'export-demo') {
  const database = openDatabase(defaultTestDatabasePath())
  try {
    migrateDatabase(database)
    seedTestDatabase(database)
    const outputPath = resolve(process.cwd(), 'database', 'fixtures', 'database.demo.json')
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify(exportFullDatabase(database, '2026-09-24T12:00:00.000Z'), null, 2)}\n`, { encoding: 'utf8' })
    console.log(`Demo database exported: ${outputPath}`)
  } finally {
    database.close()
  }
} else {
  console.error('Usage: db.ts <migrate|reset|seed|export-demo>')
  process.exitCode = 2
}
