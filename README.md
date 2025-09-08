# ED administratoriaus prietaisų skydas

Statinis vieno failo HTML projektas, skirtas publikuoti per **GitHub Pages**.

## Naudojimas

1. Atidarykite [projekto puslapį](https://<user>.github.io/admin-dashboard/) GitHub Pages (pakeiskite `<user>` savo GitHub naudotojo vardu).
2. Viskas vyksta naršyklėje, nereikia jokių priklausomybių.

## Funkcijos

- Grupių kortelių dydį galima keisti jas tempiant į šoną ir žemyn.
- „sheet“ ir „embed“ tipo įrašai automatiškai rodo peržiūrą kortelėje.
- Eksportas ir importas į Google Sheets per Apps Script "web app".
- Redagavimo režimas: išjungus puslapis tampa statinis, įjungus galima keisti grupes ir įrašus.

## Smoke test

1. Apps Script faile sukurkite funkcijas `doPost(e)` su veiksmu `export`/`import` ir publikuokite kaip "web app". Nukopijuokite gautą URL.
2. `index.html` faile `SCRIPT_URL` konstanta pakeiskite į savo "web app" adresą.
3. Atidarykite puslapį ir paspauskite **Eksportuoti** – duomenys nusiųsami į Sheets.
4. Perkraukite puslapį (išvalykite `localStorage`, jei reikia).
5. Paspauskite **Importuoti** – duomenys parsiunčiami iš Sheets.

## Licencija

Projektas platinamas pagal [MIT licenciją](LICENSE).

