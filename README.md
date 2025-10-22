# ED administratoriaus prietaisų skydas

Statinis vieno failo HTML projektas, skirtas publikuoti per **GitHub Pages**.

> **Pastaba:** sinchronizavimas su Google Sheets šiuo metu išjungtas.

## Naudojimas

1. Atidarykite [projekto puslapį](https://<user>.github.io/admin-dashboard/) GitHub Pages (pakeiskite `<user>` savo GitHub naudotojo vardu).
2. Viskas vyksta naršyklėje, nereikia jokių priklausomybių.
3. Naudokite klaviatūros trumpinius:
   - `/` – akimirksniu fokusuoja paieškos lauką.
   - `Ctrl+K` (`⌘K` Mac) – įjungia redagavimą ir atidaro **Pridėti** meniu.

## Funkcijos

- Grupių kortelių dydį galima keisti jas tempiant į šoną ir žemyn.
- Įrašų eiliškumą galima keisti rodyklėmis arba tempiant (drag-and-drop) redagavimo režime.
- „sheet“ ir „embed“ tipo įrašai automatiškai rodo peržiūrą kortelėje.
- „chart“ tipo įrašai leidžia įterpti Google Sheets diagramas.
- Galima pridėti grafikus kaip atskiras korteles.
- Embed peržiūros kortelę galima vertikaliai padidinti arba sumažinti.
- Eksportas ir importas į Google Sheets per Apps Script "web app" (laikinai išjungta).
- Redagavimo režimas: išjungus puslapis tampa statinis, įjungus galima keisti grupes ir įrašus.
- Puslapio pavadinimą ir ikoną galima redaguoti ir jie išsaugomi naršyklėje.
- Jei pavadinimas tuščias redagavimo režime, rodomas pilkas užrašas „Įveskite pavadinimą“.
- Spalvų temą galima keisti paspaudus **Tema** – parinktys išsaugomos `localStorage`.
- Pastabų kortelę galima perkelti tarp grupių drag-and-drop būdu.
- Galima kurti kelias pastabų korteles, kiekvienai parenkant taškelio spalvą, šrifto dydį ir paraštes.
- Spalvų meniu turi mygtuką **Atstatyti**, grąžinantį numatytas spalvas.
- Galima nustatyti priminimus įrašams ir per priminimų kortelę (reikalingas naršyklės pranešimų leidimas).
- Priminimų skydelis leidžia peržiūrėti ir atšaukti aktyvius priminimus.
- Redagavimo režime galima pridėti priminimų kortelę su vizualiais laikmačiais,
  greitais +5/+10/+15/+30 min. mygtukais ir individualių priminimų sąrašu.

## Priminimai ir privatumas

- Pirmą kartą įjungus priminimą naršyklė paprašys leisti rodyti pranešimus (`Notification`).
- Prieš suteikdami leidimą įsitikinkite, kad įrenginys atitinka skyriuje galiojančias privatumo taisykles – pranešimai gali būti rodomi užrakintame ekrane.
- Jei leidimo nesuteikiate, sistema vis tiek parodys priminimą naršyklės lange.

## Dizaino nustatymai

Grupių kortelių matmenys nustatomi per `style` atributus ir saugomi naršyklėje
(`group.width`, `group.height`, `notesBox.width`, `notesBox.height`).
Numatyti matmenys – 360×360 px.

Pastabų kortelės pagal nutylėjimą naudoja 20 px šriftą ir 20 px paraštes. Jei reikia nuimti paraštes visiškai, įveskite reikšmę „0“ – ji bus išsaugota ir rodoma kortelėje.

## Stiliai

- Pagrindiniai stiliai ir dizaino tokenai laikomi faile `styles/base.css`. Čia rasite spalvų temų kintamuosius (pvz., `--surface`, `--border-strong`), tipografijos (`--font-sm`, `--font-lg`) ir tarpų skalę (`--space-1`, `--space-4`).
- Komponentų sluoksnis padalintas į smulkesnius failus kataloge `styles/components/` (`header.css`, `buttons.css`, `layout.css`, `reminders.css`). Tokia struktūra leidžia greitai įjungti/išjungti blokus arba kurti naujus komponentus prie tos pačios skalės.
- Temų pritaikymas klientui atliekamas koreguojant CSS kintamuosius `:root` arba `.theme-light:root` bloke faile `styles/base.css`, arba kuriant naują `.color-*` klasę. Keičiant neutralias spalvas naudokite semantinius kintamuosius (`--surface`, `--border-strong`), kad abi temos išliktų kontrastingos.

Norint pridėti kliento spalvų schemą:

1. `styles/base.css` faile nukopijuokite vieną iš `.color-*` blokų ir perrašykite `--accent`/`--accent2` reikšmes.
2. Jei reikia pakeisti foną ar kortelių spalvą, atnaujinkite `--bg`, `--surface` ir `--surface-raised`.
3. Pritaikykite klasę `<html>` elementui arba per `document.documentElement.classList` (pvz., `document.documentElement.classList.add('color-emerald')`).

## Smoke test

Šie žingsniai aktualūs tik atnaujinus ir vėl įjungus Google Sheets sinchronizavimą.

1. Apps Script faile sukurkite funkcijas `doPost(e)` su veiksmu `export`/`import` ir publikuokite kaip "web app". URL galite gauti paleidę žemiau esantį pavyzdį ir pasižiūrėję **Execution log** skiltį.

   ```javascript
   function showUrl() {
     Logger.log(ScriptApp.getService().getUrl());
   }
   ```

2. `storage.js` faile `SCRIPT_URL` konstanta pakeiskite į savo "web app" adresą.
3. Atidarykite puslapį ir paspauskite **Eksportuoti** – duomenys nusiųsami į Sheets.
4. Perkraukite puslapį (išvalykite `localStorage`, jei reikia).
5. Paspauskite **Importuoti** – duomenys parsiunčiami iš Sheets.
6. Įjunkite redagavimą, pasirinkite kelias korteles (Shift + paspaudimas) ir vilkite vienos kortelės kampą – visos pasirinktų kortelių kopijos turi pasikeisti į tą patį dydį.
7. Tempdami kampą stebėkite mėlynas „snap“ gaires – jos turi rodyti artimiausių kortelių pločio/aukščio reikšmes ir kortelė turi prisifiksuoti prie parodytų matmenų.
8. Atlaisvinę kampą įsitikinkite, kad individualių kortelių nustatymai įrašo tiek pasirinktą presetą (`sm`/`md`/`lg`), tiek nestandartinius pločius/aukščius (patikrinkite `localStorage`).

## Licencija

Projektas platinamas pagal [MIT licenciją](LICENSE).
