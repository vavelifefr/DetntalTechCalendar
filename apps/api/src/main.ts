import { createApp } from './app.ts'
import { migrateDatabase, openDatabase } from '@dental-tech/persistence-sqlite'

const database = openDatabase()
migrateDatabase(database)

const app = createApp({ database })
const port = Number(process.env.PORT ?? 3000)

try {
  await app.listen({ host: '127.0.0.1', port })
  app.log.info(`Local API listening at http://127.0.0.1:${port}`)
} catch (error) {
  app.log.error(error)
  await app.close()
  process.exitCode = 1
}
