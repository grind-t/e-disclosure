import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { json } from "node:stream/consumers";
import { pipeline } from "node:stream/promises";
import { createBrotliCompress } from "node:zlib";

const companies: any = await pipeline(createReadStream("src/companies.json"), json);
const ratings: Record<string, { value: number; outlook: string }> = {};

for (const [inn, company] of Object.entries<any>(companies)) {
  const { value, outlook } = company.ratings.at(-1)!;
  ratings[inn] = { value, outlook };
}

await pipeline(
  Readable.from(JSON.stringify(ratings)),
  createBrotliCompress(),
  createWriteStream("exports/ratings.json.br"),
);
