# Galeri Permata: Berlian Aurora

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/Desember17-cpu/galeri-permata-heist/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/Desember17-cpu/galeri-permata-heist/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

Game heist 3D (Three.js) untuk kompetisi MakeFun **best-heist-game-20261122-0559**.

## Cerita

Malam ini galeri paling dijaga di kota menggelar tiga permata legendaris:
**Berlian Aurora**, **Ruby Maharani**, dan **Safir Samudra**. Empat kurator
berpatroli di antara etalase, CCTV menyapu lorong, drone melayang di atas
galeri tengah, dan laser silang menjaga jalan antar etalase. Panel **kaca
bias** membelokkan kerucut visi penjaga 20 derajat — baca arah beloknya
sebelum bergerak, atau kau akan tertangkap dari arah yang tak kau duga.

## Cara main

- **Tujuan:** curi 3 permata, lalu kabur lewat pintu EXIT di timur laut.
  Ketahuan 3 kali = pencurian gagal.
- **WASD / panah** — gerak · **Shift** — menyelinap (lebih lambat, lebih
  sulit terlihat) · **E** — ambil permata · **Q** — lempar pengalih (3x,
  kurator terdekat menyelidiki bunyi itu) · **M** — bisu · **R** — ulang ·
  **Enter** — mulai.
- **Meter alarm** naik saat terlihat kurator, CCTV, atau drone; turun saat
  bersembunyi di balik etalase. Alarm 100% = satu strike. Memotong **laser**
  aktif langsung menaikkan alarm 45 dan membangunkan semua kurator.
- Kurator punya empat status: **patroli → curiga (?) → mengejar (!) →
  mencari → patroli**. Lolos dari kejaran cukup lama dan mereka kembali
  berpatroli.

## Jalankan

Buka `game/index.html` lewat server HTTP statis apa pun (modul ES tidak
boleh `file://`), misal dari root repo:

```
python3 -m http.server 8123
```

lalu buka `http://localhost:8123/game/index.html`.

Screenshot deterministik: `?shot=start` (judul), `?shot=play`,
`?shot=climax` (klimaks mid-heist), `?shot=end` (hasil autopilot murni).

## Teknologi

- Three.js 0.160.0 (divendor di `game/vendor/three.min.js`)
- Suara disintesis WebAudio sendiri — tanpa file audio
- Tanpa dependensi jaringan saat bermain: semua aset ada di `game/`

## Lisensi

MIT — lihat `LICENSE`.
