// Galeri Permata: Berlian Aurora — program hand-in (Node 22, stdlib saja).
// Menyalin game/ dan screenshots/ dari samping file ini ke direktori output
// (MAKEFUN_OUTPUT_DIR, atau /output bila tidak disetel) lalu menulis
// /output/dossier.json dengan library make.fun yang divendor.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Batas yang sama dengan yang dipakai scorer: dossier dibatasi 160 KiB teks,
// paling banyak 4 screenshot @ 256 KiB, game/ paling banyak 993 berkas dan
// 48 MiB, dan tiap path di bawah game/ paling banyak 1000 byte.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
