# ED administratoriaus prietaisų skydas

Statinis vieno failo HTML projektas, skirtas publikuoti per **GitHub Pages**.

> **Pastaba:** sinchronizavimas su Google Sheets šiuo metu išjungtas.

## Naudojimas

1. Atidarykite [projekto puslapį](https://<user>.github.io/admin-dashboard/) GitHub Pages (pakeiskite `<user>` savo GitHub naudotojo vardu).
2. Viskas vyksta naršyklėje, nereikia jokių priklausomybių.

## Funkcijos

- Grupių kortelių dydį galima keisti jas tempiant į šoną ir žemyn.
- Įrašų eiliškumą galima keisti rodyklėmis arba tempiant (drag-and-drop) redagavimo režime.
- „sheet“ ir „embed“ tipo įrašai automatiškai rodo peržiūrą kortelėje.
- „chart“ tipo įrašai leidžia įterpti Google Sheets diagramas.
- Galima pridėti grafikus kaip atskiras korteles.
- Embed peržiūros kortelę galima vertikaliai padidinti arba sumažinti.
- Eksportas ir importas į Google Sheets per Apps Script "web app" (laikinai išjungta).
- Redagavimo režimas: išjungus puslapis tampa statinis, įjungus galima keisti grupes ir įrašus.

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

## Licencija

Projektas platinamas pagal [MIT licenciją](LICENSE).
