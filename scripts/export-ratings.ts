import { createReadStream, createWriteStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { json } from "node:stream/consumers";
import { pipeline } from "node:stream/promises";
import { createBrotliCompress } from "node:zlib";

const EXPORTS_DIR = join(import.meta.dirname, "..", "exports");

const companies: any = await pipeline(createReadStream(join(EXPORTS_DIR, "companies.json")), json);
const ratings: Record<string, { value: number; outlook: string }> = {};

for (const [inn, company] of Object.entries<any>(companies)) {
  const { value, outlook } = company.ratings.at(-1)!;
  ratings[inn] = { value, outlook };
}

await pipeline(
  Readable.from(JSON.stringify(ratings)),
  createBrotliCompress(),
  createWriteStream(join(EXPORTS_DIR, "ratings.json.br")),
);
