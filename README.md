# GZ ALUMINIUM GLASS & PVC — sistemi i punëtorisë dhe ofertave

Aplikacion web (PWA) për llogaritje profilesh, prerje, qelq, aksesorë, kosto/fitim dhe oferta PDF.
Funksionon offline, ruan të dhënat në IndexedDB të pajisjes (pa shërbime cloud me pagesë).

**Teknologjia:** Vite + React + TypeScript, Dexie (IndexedDB), jsPDF (PDF), Three.js (3D), vite-plugin-pwa.

## Publikimi në internet me GitHub (falas, pa instaluar asgjë në kompjuter)

1. Krijo llogari në https://github.com dhe shtyp **New repository** (p.sh. emri `gz-aluminium`, Public ose Private).
2. Ngarko të gjithë përmbajtjen e këtij folderi në repository:
   - **Me ueb:** *Add file → Upload files*, tërhiq të gjitha skedarët dhe folderat (përfshirë `.github`, `src`, `public`, `scripts`, `tests`). Nëse shfletuesi nuk e ngarkon folderin e fshehur `.github`, krijoje me *Add file → Create new file*, shkruaj emrin `.github/workflows/deploy.yml` dhe ngjit përmbajtjen e skedarit me të njëjtin emër nga zip-i.
   - **Me git:**
     ```
     git init -b main
     git add .
     git commit -m "GZ Aluminium"
     git remote add origin https://github.com/EMRI-YT/gz-aluminium.git
     git push -u origin main
     ```
3. Në GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Hap skedën **Actions**: workflow-i “Deploy to GitHub Pages” ndërton aplikacionin automatikisht (3–5 minuta). Kur bëhet i gjelbër, adresa është:
   `https://EMRI-YT.github.io/gz-aluminium/`
5. Çdo ndryshim i ri që ngarkon në `main` e publikon vetë versionin e ri.

Nëse workflow-i dështon (kryq i kuq), hap gabimin në Actions dhe dërgoje te Claude për ta rregulluar.

> Alternativa: Netlify (`netlify.toml` është përfshirë) ose Vercel — lidh repository-n, komanda `npm run build`, folderi `dist`.

## Instalimi si aplikacion (PWA)
- **iPhone/iPad (Safari):** hap adresën → butoni Share → *Add to Home Screen*.
- **Android/Chrome/Desktop:** menuja → *Install app*.
Pas hapjes së parë me internet, aplikacioni punon offline.

## Zhvillim lokal
```
npm install
npm test        # teste për motorin e llogaritjeve
npm run dev     # http://localhost:5173
npm run build   # prodhon folderin dist/
npm run typecheck
```

## Rëndësi: vlerat teknike janë bosh (0) me qëllim
Asnjë formulë prodhuesi apo çmim nuk është i shpikur. Sistemet fillestare (TROCAL 70, TROCAL 76 MD, Kömmerling 76 MD, Alumil S67, Alumil S560, WEISS 72) vijnë me:
- çmime = 0, kode profilesh bosh;
- zbritje/shtesa (`weldAllow`, `cutAdj`, `sashAdd`, `reinfDeduct`, `fixedGlassDeduct`, `sashRebate`, …) = 0;
- gjerësi profilesh (`frameW`, `sashW`, `mullionW`) dhe thellësi vlera paraprake për vizatim/3D;
- gjatësi shufre 6500 mm dhe kerf 3 mm si vlera fillestare.

Sistemet shënohen “pa verifikuar” derisa t’i plotësosh te **Materialet → Sisteme** (parametra, formula qelqi, receta profilesh dhe aksesorësh) dhe të shënosh “e verifikuar”.

## Si funksionon llogaritja
- **Receta:** çdo sistem ka rreshta recete me formula të redaktueshme (`W + weldAllow`, `SW - 2*sashW`, `if(SH>1400,3,2)` …). Shiko “Materialet → Sisteme → Receta”. Ndryshoret: `W, H, CW, CH, SW, SH, GW, GH, MH, nCols, nRows` + parametrat e sistemit. Çdo rresht tregon testin e formulës.
- **Gjeometria:** hapjet e kasës (CW×CH) llogariten nga kasa, ndarëset dhe gjerësitë e kolonave; kanati SW = CW + `sashAdd`.
- **Qelqi:** nga formula të sistemit (jo nga përmasat e jashtme).
- **Prerja:** FFD + BFD + riprovime të rastësishme + përmirësim lokal; çdo copë konsumon gjatësi + shtesë + kerf; profilet nuk përzihen.
- **Kosto:** profile (me % humbje), armaturë, qelq, aksesorë, garnitura, punë krahu, të tjera. Çmimi i blerjes dhe i shitjes janë të ndara.
- **Metodat e çmimit:** për m², për ml, për copë, total manual, nga çmimet e shitjes së materialeve, kosto + marzh.
- **Oferta:** krijohet si pamje e ngrirë (snapshot). Kur lëshohet bllokohet; ndryshimi i databazës nuk e prek.

## Kopje rezervë
Cilësimet → Kopje rezervë: eksport/import JSON (me validim dhe paralajmërim para zëvendësimit). Të dhënat ruhen vetëm në pajisje, ndaj bëj kopje rezervë rregullisht (aplikacioni të kujton pas 14 ditësh).
