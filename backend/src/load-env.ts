// MUST be imported before anything that reads process.env.
// Loads .env.local in dev, .env.prod in production. The dotenv call here runs
// as a module side effect during the first import in src/index.ts.
import dotenv from 'dotenv'

const file = process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.local'
dotenv.config({ path: file })
