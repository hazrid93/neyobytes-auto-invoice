// MUST be imported before anything that reads process.env.
// APP_ENV selects which env file to load:
//   local (default) → .env.local   (dev; MYINVOIS_ENV=mock)
//   stg             → .env.stg      (staging; preprod LHDN sandbox API — no mock)
//   prod            → .env.prod     (production; real LHDN API)
// NODE_ENV still controls runtime behaviour (production = no dev warnings);
// APP_ENV ONLY picks the file. Backward compatible: with APP_ENV unset,
// NODE_ENV=production → .env.prod, otherwise .env.local (the original logic),
// so existing `pm2 start` (NODE_ENV=production) and `npm run dev` keep working.
import dotenv from 'dotenv'

const appEnv = (process.env.APP_ENV ?? '').toLowerCase()
const file =
  appEnv === 'stg' ? '.env.stg' :
  appEnv === 'prod' ? '.env.prod' :
  appEnv === 'local' ? '.env.local' :
  process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.local'

dotenv.config({ path: file, override: true })