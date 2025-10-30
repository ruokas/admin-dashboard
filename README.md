# ED administratoriaus prietaisų skydas

Statinis HTML + ES moduliais paremtas prietaisų skydas, skirtas greitam informacijos dalijimui ED skyriuje. Visas turinys saugomas naršyklėje, todėl sprendimą galima publikuoti per GitHub Pages ar bet kurią kitą statinių failų talpyklą.

## Trumpai
- Kortelės nuorodoms, grafiko įterpiniams, pastaboms ir priminimams su drag-and-drop bei rankenomis dydžiui keisti.
- Klaviatūros trumpiniai (`/`, `Ctrl+K`, `?`) ir pagalbos modalas greitam darbui.
- JSON eksportas/importas atsarginėms kopijoms; pasirenkamas Google Sheets sinchronizavimas.
- Lengvai keičiamas puslapio pavadinimas, emoji ar paveikslėlio ikona, šviesi/tamsi tema ir CSS akcentų spalvos.

## Naudojimas
### Publikavimas per GitHub Pages
1. Fork'inkite arba nukopijuokite šį repo į savo GitHub paskyrą.
2. Įjunkite **Pages** (`Settings → Pages`) ir pasirinkite `main` šaką su `/root` direktorija.
3. Aplikacija bus pasiekiama adresu `https://<user>.github.io/admin-dashboard/` (pakeiskite `<user>` savo vardu).

### Vietinis darbas
1. Įsidiekite priklausomybes: `npm install`.
2. Paleiskite statinį serverį (`npx http-server .`, `python -m http.server` ar pan.) ir atverkite `http://localhost:8080/index.html`.
3. Kodo kokybę tikrinkite:
   - `npm test` – vienetiniams testams (`node:test`).
   - `npm run lint` – ESLint.
   - `npm run format` – Prettier (rašymo režimu).

## Pagrindinės funkcijos
### Kortelės ir grupės
- Redagavimo režimas įjungiamas mygtuku **Redaguoti** (kartotinas paspaudimas).
- Korteles (grupes) galima vilkti, keisti jų plotį/aukštį rankenomis kampuose. Laikant `Shift` pažymėkite kelias korteles ir keiskite jų dydį sinchroniškai.
- Tipai:
  - **Nuorodų grupė** – nuorodų sąrašas su pasirenkamomis piktogramomis, anotacijomis, `Open all` mygtuku.
  - **Chart** – „Publish to web“ Google Sheets diagramų ar kitų `iframe` įterpinių kortelė.
  - **Pastabos** – viena kortelė su tekstu, reguliuojamu šriftu, paraštėmis ir akcento spalva.
  - **Priminimų kortelė** – laikmačiams ir individualiems priminimams (aktyvinama iš „＋ Pridėti“ meniu).
- Kortelių spalvos pasirenkamos grupės formoje (paletė + `input type="color"`).

### Įrašai
- Kiekvienas įrašas turi pavadinimą, URL, pasirenkamą piktogramą, anotaciją ir (jei reikia) priminimo nustatymus.
- Nuorodos atsidaro naujame lange, o `embed`/`chart` tipai atvaizduojami pačiame skydelyje. Neredagavimo režime paspaudus kortelę galima peržiūrėti įterpinio peržiūrą.
- Įrašai grupėje perrikiuojami vilkimu. Galimas pertempimas tarp grupių.
- Kontekstinis meniu (trys taškai) leidžia greitai perkelti įrašą aukštyn/žemyn, redaguoti, peržiūrėti ar pašalinti.

### Priminimai
- Greiti laikmačiai (+5/+10/+15/+30 min.), individualūs laikmačiai ir konkretūs datos/laiko priminimai.
- Priminimų sąrašas rodo likusį laiką, leidžia atidėti (`Snooze`) ar redaguoti įrašą.
- Naršyklės pranešimai prašo `Notification` leidimo. Nesuteikus leidimo naudojamas vidinis „alert“ ir paryškinamas susijęs elementas.
- Priminimus galima priskirti tiek pastabų kortelei, tiek konkretiems įrašams, tiek kurti individualius.

### Paieška ir pagalba
- Paieškos laukas filtruoja įrašus realiu laiku pagal pavadinimą, URL ar anotaciją; tuščias rezultatas rodo aiškų pranešimą.
- `Ctrl+K` atveria pridėjimo meniu, `/` fokusuoja paiešką, `?` – pagalbos modalą su instrukcijomis.

### Puslapio pavadinimas ir ikona
- Antraštės lauką galima redaguoti tiesiogiai. Tuščias pavadinimas neredagavimo režime rodo pilką placeholderį.
- Ikonos laukas priima emoji arba iki 200 KB dydžio paveikslėlį (`png`, `jpeg`, `gif`, `webp`, `svg`). Įkėlus paveikslėlį emoji reikšmė išvaloma.

### Tema ir spalvos
- Mygtukas **Tema** perjungia šviesią/tamsią temą (`localStorage` raktas `ed_dash_theme`).
- Akcentų spalvos paremtos CSS klasėmis `.color-emerald`, `.color-sky`, `.color-rose`, `.color-amber`, `.color-violet`. Numatytai naudojama `emerald`; klasę galite pakeisti rankiniu būdu (`document.documentElement.classList.add('color-sky')`).
- Visi spalvų tokenai ir semantiniai kintamieji aprašyti `styles/base.css`.

## Duomenų saugojimas ir atsarginės kopijos
- Būsena saugoma `localStorage` po raktu `ed_dashboard_lt_v1` (grupės, įrašai, priminimai, pavadinimas, ikonos, temos nustatymai).
- **Duomenų meniu**: mygtukas „Duomenys“ redagavimo režime išskleidžia importo ir eksporto parinktis.
- **Eksportas**: parinktis „Eksportuoti“ išsaugo JSON failą (`<pavadinimas>-<timestamp>.json`).
- **Importas**: parinktis „Importuoti“ leidžia pasirinkti anksčiau eksportuotą JSON; importuojant atnaujinamas pavadinimas, ikona, kortelės, priminimai.
- **Google Sheets** (pasirenkama):
  1. `storage.js` faile atnaujinkite `SCRIPT_URL` į savo Apps Script „web app“ adresą.
  2. `app.js` faile atkomentuokite `const sheets = sheetsSync(...)` ir prijunkite `sheets.export()`/`sheets.import()` prie reikiamų mygtukų.
  3. Apps Script turėtų palaikyti `action: "export" | "import"` ir grąžinti JSON struktūrą, atitinkančią `storage.js` tipą.

## Privatumas ir leidimai
- Primenimų pranešimai gali būti matomi užrakintame įrenginyje – prieš įjungdami įsitikinkite, kad tai leidžia skyriuje galiojančios taisyklės.
- Visa informacija išlieka vartotojo naršyklėje; jokių duomenų automatiškai nesiunčiama į serverius.
- „Clear data“ atlikite iš naršyklės „Application → Local Storage“ ar paspaudę `localStorage.removeItem('ed_dashboard_lt_v1')` konsolėje.

## Klaviatūros trumpiniai
- `/` – fokusuoja paiešką.
- `Ctrl+K` (`⌘K`) – atveria pridėjimo meniu.
- `?` arba `Shift+/` – pagalbos langas.
- `Esc` – uždaro atidarytą meniu ar dialogą.

## Projekto struktūra
- `index.html` – pagrindinis puslapis ir UI skeletas.
- `app.js` – būsenos valdymas, įvykių logika, renderio koordinavimas.
- `render.js` – DOM renderis, drag/resize logika, priminimų kortelės UI.
- `forms.js` – dialogai (grupės, įrašai, grafikai, pastabos, priminimai, temos).
- `storage.js` – `localStorage` skaitymas/rašymas, migracijos, „seed“ duomenys, Sheets integracijos adapteris.
- `reminders.js`, `reminder-input.js`, `reminder-form-state.js` – priminimų planavimas, validacija ir formos būsena.
- `styles/` – baziniai stiliai, komponentų CSS ir temų kintamieji.
- `tests/` – `node:test` rinkiniai (`exportJson`, priminimų forma, priminimų įvestis, dydžių žemėlapis, pastabų migracija).

## Testavimas ir kokybės kontrolė
1. `npm test` – turi praeiti visi testai.
2. `npm run lint` – užtikrina, kad nėra lint klaidų.
3. `npm run format` – suvienodina kodo stilių.

## Smoke test (UI)
1. Paleiskite aplikaciją, įjunkite **Redaguoti**.
2. Sukurkite grupę, pridėkite kelias nuorodas (įskaitant `sheet`/`embed` tipą) ir patikrinkite, ar `Open all` atidaro nuorodas.
3. Sukurkite pastabų kortelę, pakeiskite šriftą, paraštes, spalvą, patikrinkite drag-and-drop tarp grupių.
4. Laikykite `Shift`, pasirinkite kelias korteles ir pakeiskite jų dydį – visos turi išlaikyti tą patį naują dydį.
5. Pridėkite priminimų kortelę, paleiskite greitą laikmatį ir individualų priminimą, patvirtinkite pranešimus bei „Snooze“ funkciją.
6. Priskirkite priminimą konkrečiam įrašui ir patikrinkite, ar kortelė gauna žymeklį ⏰.
7. Perjunkite šviesią/tamsią temą, įkelkite antraštės paveikslėlį ir išvalykite ikoną.
8. Naudodami paiešką suraskite įrašą, išvalykite lauką per „Išvalyti“ mygtuką.
9. Atlikite JSON eksportą, išvalykite `localStorage`, importuokite failą ir patikrinkite, ar visos kortelės bei priminimai atsistatė.

## Našumo profilis (Chrome Performance)
1. Atidarykite aplikaciją Chrome naršyklėje ir įjunkite **DevTools** (`Ctrl+Shift+I`).
2. Skiltyje **Performance** spauskite **Record** ir atlikite tipinius veiksmus (paiešką, vilkimą, priminimo kūrimą) 5–10 s.
3. Sustabdykite įrašymą ir išanalizuokite kadrų laiką, skriptų vykdymą bei atmintį.
4. Palyginimui išsisaugokite profilį prieš ir po kodo pakeitimų.

## Licencija
Projektas platinamas pagal [MIT licenciją](LICENSE).
