// Shared rules for keeping Claude away from real databases. Used by hooks/db-guard.mjs (and its tests).
// The principle: Claude may do anything to a database on THIS computer (a local or Docker copy); a database anywhere else
// is the owner's, and changes to it are run by the owner. Values from .env files are read only to find the host name;
// they are never printed or stored.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const URL_RE = /\b(postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|sqlserver|mssql|cockroachdb|clickhouse|libsql|cassandra)(?:\+\w+)?:\/\/([^\s'"`]+)/gi;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "host.docker.internal", ""]);

// Commands that talk to a database server, or run migrations against whatever the project's settings point at.
const CLIENT = /(^|[\s;&|(])(psql|pg_dump|pg_dumpall|pg_restore|mysql|mariadb|mysqldump|mongosh|mongo|mongodump|mongorestore|redis-cli|sqlcmd|cqlsh|clickhouse-client|cockroach\s+sql|turso\s+db\s+shell)\b/i;
const MIGRATOR = /\b(prisma\s+(migrate\s+(deploy|reset|dev|resolve)|db\s+(push|execute|seed))|drizzle-kit\s+(push|migrate)|knex\s+migrate:\S+|sequelize(-cli)?\s+db:\S+|typeorm\s+(migration:run|schema:sync|schema:drop)|(rails|rake)\s+db:\S+|manage\.py\s+(migrate|flush|dbshell|sqlflush|loaddata)|alembic\s+(upgrade|downgrade|stamp)|flyway\s+\S+|liquibase\s+\S+|dbmate\s+\S+|goose\s+\S+|atlas\s+(migrate|schema)\s+\S+|supabase\s+db\s+(push|reset|execute)|php\s+artisan\s+(migrate\S*|db:\S+)|mix\s+ecto\.\S+|diesel\s+(migration|database)\s+\S+|sqlx\s+(migrate|database)\s+\S+)/i;
// Ways of reaching a hosted database through a platform's own tool: always someone else's server.
const PLATFORM = /\b(heroku\s+(pg:\S+|run\s+.*\b(migrate|psql|db:))|fly(ctl)?\s+(postgres\s+connect|ssh\s+console)|railway\s+(run|connect)|render\s+psql|supabase\s+db\s+(push|reset)(?![^\n]*--local)|planetscale\s+(shell|connect)|pscale\s+(shell|connect)|neonctl\s+\S+|aws\s+rds(-data)?\s+(execute-statement|delete|modify|restore)|gcloud\s+sql\s+(connect|import|instances\s+(delete|patch))|az\s+(postgres|mysql|sql)\s+\S+\s+(delete|update|connect))/i;
const PROD_MARKER = /\b(RAILS_ENV|RACK_ENV|NODE_ENV|APP_ENV|MIX_ENV|FLASK_ENV|ENVIRONMENT|STAGE)=['"]?(production|prod)\b|--(env|environment|stage)[= ](production|prod)\b|\s-e\s+(production|prod)\b|DJANGO_SETTINGS_MODULE=\S*prod/i;
const DANGEROUS_SQL = [
  [/\bDROP\s+(DATABASE|SCHEMA|TABLE)\b/i, "drops a database, schema or table"],
  [/\bTRUNCATE\b/i, "empties a table"],
  [/\bDELETE\s+FROM\s+[\w."`\[\]]+\s*(;|$|["'])/im, "deletes every row (DELETE with no WHERE)"],
  [/\bUPDATE\s+[\w."`\[\]]+\s+SET\b(?![^;]*\bWHERE\b)[^;]*(;|$)/im, "changes every row (UPDATE with no WHERE)"],
  [/\b(FLUSHALL|FLUSHDB)\b/i, "wipes a Redis database"],
  [/\.(dropDatabase|drop)\s*\(\s*\)|\.deleteMany\s*\(\s*\{\s*\}\s*\)/, "wipes a MongoDB database or collection"],
  [/\bprisma\s+migrate\s+reset\b|\bdb:(drop|reset|schema:load)\b|manage\.py\s+flush\b|\bsupabase\s+db\s+reset\b|migrate:(fresh|reset)\b/i, "resets the database and deletes its data"],
];

export function hostOf(url) {
  // user:pass@host:port/db?x -> host
  let rest = url.replace(/^[^@/]*@/, "");
  rest = rest.split(/[/?#]/)[0];
  const hosts = rest.split(",").map((h) => h.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase());
  return hosts;
}

export function isLocalHost(h, composeServices = new Set()) {
  if (LOCAL_HOSTS.has(h)) return true;
  if (/^127\./.test(h) || h.endsWith(".localhost")) return true;
  if (/^[a-z0-9_-]+$/i.test(h) && composeServices.has(h)) return true; // a Docker Compose service on this machine
  return false;
}

export function composeServices(root) {
  const out = new Set();
  for (const f of ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]) {
    try {
      const t = readFileSync(join(root, f), "utf8");
      const block = /^services:\s*\n([\s\S]*?)(?=^\S|(?![\s\S]))/m.exec(t)?.[1] ?? "";
      for (const m of block.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)) out.add(m[1].toLowerCase());
    } catch {}
  }
  return out;
}

// Host names the project's own settings files point at (only the host part leaves this function).
export function envHosts(root) {
  const hosts = [];
  for (const f of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = /^\s*(?:export\s+)?([A-Z0-9_]*(?:DATABASE|DB|POSTGRES|PG|MYSQL|MONGO|REDIS)[A-Z0-9_]*)\s*=\s*['"]?([^'"\s#]+)/.exec(line);
        if (!m) continue;
        for (const u of m[2].matchAll(URL_RE)) hosts.push(...hostOf(u[2]));
        if (/HOST$/.test(m[1])) hosts.push(m[2].toLowerCase());
      }
    } catch {}
  }
  return hosts;
}

// Commands whose arguments are just text (a commit message, a search, a printout): their words are not database commands.
const DATA_CMDS = new Set(["git", "echo", "printf", "grep", "rg", "egrep", "fgrep", "cat", "less", "more", "head", "tail", "ls", "find", "wc", "sort", "uniq", "diff", "gh", "code", "notepad", "type", "dir"]);
export function codePart(command) {
  return command
    .split(/\r?\n|;|&&|\|\||\|/)
    .filter((seg) => {
      const first = seg.trim().replace(/^(\w+=("[^"]*"|'[^']*'|\S*)\s+)+/, "").split(/\s+/)[0]?.replace(/^.*[\\/]/, "").toLowerCase();
      return !DATA_CMDS.has(first);
    })
    .join("\n");
}

// The database hosts in the project's own settings that are NOT on this computer. The kit's automatic test runs (after an edit,
// at the end of a turn) use those settings, so when this is not empty they must not run: tests could change real data.
export function remoteDbHosts(root) {
  const services = composeServices(root);
  return [...new Set(envHosts(root).filter((h) => !isLocalHost(h, services)))];
}

export function assessDbCommand(fullCommand, root = null) {
  const command = codePart(fullCommand);
  const services = root ? composeServices(root) : new Set();
  const remote = [];
  for (const m of command.matchAll(URL_RE)) for (const h of hostOf(m[2])) if (!isLocalHost(h, services)) remote.push(h);
  const client = CLIENT.test(command);
  const migrator = MIGRATOR.test(command);
  if (client) {
    for (const m of command.matchAll(/(?:^|\s)(?:-h|--host)(?:=|\s+)['"]?([^\s'"]+)/g)) if (!isLocalHost(m[1].toLowerCase(), services)) remote.push(m[1].toLowerCase());
    for (const m of command.matchAll(/\b(?:PGHOST|MYSQL_HOST|REDIS_HOST|MONGO_HOST|DB_HOST)=['"]?([^\s'";]+)/g)) if (!isLocalHost(m[1].toLowerCase(), services)) remote.push(m[1].toLowerCase());
  }
  if ((client || migrator) && !remote.length && root && !URL_RE.test(command)) {
    URL_RE.lastIndex = 0;
    // no explicit target: the tool will use the project's settings
    for (const h of envHosts(root)) if (!isLocalHost(h, services)) remote.push(`${h} (from the project's .env)`);
  }
  URL_RE.lastIndex = 0;
  const platform = PLATFORM.test(command);
  const prod = (client || migrator) && PROD_MARKER.test(command);
  // SQL piped into a client (`echo "DROP TABLE x" | psql`) lives in the text-only part, so look at all of it then.
  const dangers = DANGEROUS_SQL.filter(([re]) => re.test(client ? fullCommand : command)).map(([, why]) => why);
  const touchesDb = client || migrator || platform || remote.length > 0;

  if (platform) return { decision: "deny", why: "it reaches a hosted database through the platform's own tool" };
  if (remote.length && (client || migrator || dangers.length)) return { decision: "deny", why: `it connects to a database that is not on this computer (${[...new Set(remote)].slice(0, 3).join(", ")})` };
  if (prod) return { decision: "deny", why: "it runs database commands with production settings" };
  if (touchesDb && dangers.length) return { decision: "ask", why: `on the local database it ${dangers.join(" and ")}` };
  if (!touchesDb && dangers.length && /\b(sqlite3|duckdb)\b/.test(command)) return { decision: "ask", why: `it ${dangers.join(" and ")}` };
  return { decision: "allow" };
}
