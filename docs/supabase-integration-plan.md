# Supabase integracijos planas

Žemiau pateiktos 8 išskaidytos užduotys, leidžiančios palaipsniui prijungti ED administratoriaus skydą prie Supabase autentifikacijos ir nustatymų sinchronizavimo. Kiekviename etape nurodoma, kokius failus keisti, kokį SQL vykdyti ir kokius testus atlikti. Visos eilutės referuoja dabartinę `main` būseną.

## 1. Supabase projekto paruošimas
- **Tikslas:** Turėti lenteles ir RLS, kurios saugos vartotojo būseną.
- **SQL:**
  ```sql
  create table if not exists ed_dash_settings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    state_json jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
  );

  alter table ed_dash_settings enable row level security;

  create policy "Users can manage their state" on ed_dash_settings
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

  create index if not exists idx_ed_dash_settings_user_id on ed_dash_settings(user_id);
  ```
- **Diegimo pastabos:** įjunkite `Email` autentifikaciją Supabase `Authentication → Providers`, sukurkite naudotojus su slaptažodžiais ir (jei reikia) sukonfigūruokite SMTP, kad veiktų slaptažodžio atkūrimas.
- **Smoke test:** Sukurkite vartotoją per Supabase Auth UI, įrašykite vieną eilutę `state_json` rankiniu būdu ir patikrinkite, ar matoma tik prisijungus tuo vartotoju.

## 2. Konfigūracija ir aplinkos kintamieji
- **Tikslas:** Turėti aiškią vietą Supabase URL/rakto saugojimui nepridedant realių reikšmių į git.
- **Failai:**
  - `supabase-config.example.js` (naujas) – eksportuoja `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
  - `.gitignore` – pridėkite `supabase-config.js`.
  - `index.html` – prieš `app.js` įtraukite `<script type="module" src="./supabase-config.js" defer></script>`; jei failas nerastas, parodykite konsolės įspėjimą.
- **Komentarai:** Paaiškinkite, kad tikras failas kuriamas iš kopijos `cp supabase-config.example.js supabase-config.js` ir pildomas lokalioje aplinkoje.
- **Smoke test:** paleiskite `npm run lint` ir įsitikinkite, kad `supabase-config.js` neegzistuojant rodomas aiškus klaidos pranešimas naršyklėje („Supabase konfigūracija nerasta“).

## 3. Supabase kliento modulis
- **Tikslas:** Centralizuoti auth/duomenų kvietimus.
- **Failai:**
  - `supabase-client.js` (naujas) – importuoja `createClient` iš `https://esm.sh/@supabase/supabase-js@2`; eksportuoja funkcijas `initSupabase(config)`, `signInWithPassword(email, password)`, `signOut()`, `getSession()`, `fetchSettings()`, `upsertSettings(payload)`.
  - `app.js` – importuoja `initSupabase` ir inicijuoja klientą perduodant reikšmes iš `supabase-config.js`.
- **Logika:** naudokite `let supabase = null;` ir sukurkite „guard“ klaidoms be konfigūracijos; `fetchSettings`/`upsertSettings` turi naudoti `supabase.from('ed_dash_settings')`.
- **Smoke test:** Console teste paleiskite `window.supabaseClient.signInWithPassword('test@...', 'slaptazodis')` ir patikrinkite, ar grąžinama aktyvi sesija.

## 4. Prisijungimo UI ir būsenos indikacija
- **Tikslas:** Leisti vartotojui prisijungti/atsijungti iš UI, aiškiai rodyti būseną.
- **Failai:**
  - `index.html` – `secondary-actions` bloke pridėkite mygtuką „Prisijungti“ su `id="auth-toggle"`, modalą su el. pašto forma, `aria-live` statuso `span`.
  - `styles/components.css` (arba naujas blokas) – minimalūs modalui skirti stiliai.
  - `app.js` – nauji įvykiai: `onAuthToggle`, `onAuthSubmit`, `onAuthSignOut`; atnaujinkite `syncStatus` tekstus („Neprisijungęs“, „Prisijungta kaip…“, „Sinchronizuojama…“).
- **Papildoma:** saugokite paskutinį el. paštą `localStorage` raktu `ed_dash_last_email` (su aiškiu „Išvalyti“ pasirinkimu modalėje).
- **Smoke test:** prisijunkite per UI, atnaujinkite puslapį – turėtų automatiškai parodyti vartotojo el. paštą.

## 5. Sesijos paleidimas ir pradinė sinchronizacija
- **Tikslas:** Užkrovimo metu nuspręsti, ar naudoti vietinę ar nuotolinę būseną.
- **Failai:**
  - `app.js` – po `let state = load() || seed();` pridėkite `await bootstrapSession()`:
    1. `const session = await supabase.auth.getSession()`.
    2. Jei `session.data.session`, kvieskite `fetchSettings()`; palyginkite `remote.updated_at` su `state.updatedAt` (naujas laukelis `state.meta.remoteUpdatedAt`).
    3. Jei nuotoliniai duomenys naujesni, `Object.assign(state, remote.state_json)` ir išsaugokite `state.meta.remoteUpdatedAt`.
- **Failai papildomai:** `storage.js` – `save()`/`load()` turi palaikyti `state.meta.remoteUpdatedAt`.
- **Smoke test:**
  1. Prisijunkite, atlikite pakeitimą, atsijunkite.
  2. Rankiniu būdu išvalykite `localStorage`, prisijunkite – turi atsistatyti iš Supabase.

## 6. Automatinė nuotolinė sinchronizacija
- **Tikslas:** `persistState()` turi rašyti į Supabase tik esant vartotojui.
- **Failai:**
  - `app.js` – papildykite `persistState()` taip, kad `debounceRemoteSave(state)` kviestų `upsertSettings()` su `{ state_json: state, updated_at: new Date().toISOString() }`.
  - `storage.js` – užtikrinkite, kad `state.updatedAt` atnaujinamas kaskart, kai `persistState()` kviečiamas.
  - `theme-utils.js` ar kiti moduliai, kurie keičia būseną, turi išlikti nepakitę (naudojamas tas pats `persistState`).
- **Technika:** naudokite 2 s „debounce“ (pvz., `let remoteTimer; function debounceRemoteSave(nextState) { clearTimeout(remoteTimer); remoteTimer = setTimeout(() => remoteSave(nextState), 2000); }`). Klaidos atveju rašykite `console.error` ir `syncStatus.textContent = 'Nepavyko išsaugoti – bandykite rankiniu būdu'`.
- **Smoke test:** atlikite kelis greitus pakeitimus (pavadinimas, kortelės) ir patikrinkite Supabase lentelėje, kad įrašas atsinaujintų ne dažniau nei kas ~2 s.

## 7. Rankinė sinchronizacija ir konfliktų sprendimas
- **Tikslas:** Vartotojas turi matyti, kada paskutinį kartą sinchronizuota, ir galėti importuoti/išeksportuoti į Supabase.
- **Failai:**
  - `app.js`/`forms.js` – `Duomenų` meniu pridėkite mygtukus „Atsiųsti iš Supabase“ (`remoteFetchButton`) ir „Išsiųsti į Supabase“ (`remotePushButton`).
  - `render.js` – atnaujinkite `syncStatus` rodmenis: `Paskutinė nuotolinė sinchronizacija: 14:32`.
  - `app.js` – `remoteFetch()` turi parodyti modalą su pasirinkimu „Perrašyti vietinius duomenis“ arba „Atšaukti“.
- **Logika:** konfliktus spręskite paprastai – jei nuotoliniai duomenys naujesni (`remote.updated_at > state.updatedAt`), rodykite įspėjimą su `confirm()` ir tik sutikus perrašykite.
- **Smoke test:** keiskite būseną dviejuose naršyklės languose ir patikrinkite, kad rankinis „Atsiųsti“ atnaujintų duomenis.

## 8. Testavimas, dokumentacija ir releasas
- **Tikslas:** Užtikrinti, kad integracija turi instrukcijas ir automatizavimą.
- **Failai:**
  - `README.md` – naujas skyrius „Supabase integracija“ su nuosekliomis instrukcijomis, `.env` paaiškinimu ir nuoroda į šį planą.
  - `tests/` – pridėkite `tests/supabase-sync.test.js`, kuris „mockina“ `supabase-client` ir tikrina, kad `persistState()` kviečia `remoteSave` tik prisijungus.
  - `package.json` – jei reikia, pridėkite `npm run test:supabase` (kviečia `node --test tests/supabase-sync.test.js`).
  - `CHANGELOG.md` (naujas) – įrašykite `## v0.2.0 - Supabase sinchronizacija (planas)`.
- **Smoke test:**
  - `npm test`, `npm run lint`, `npm run format`.
  - Patikrinkite `README` nuorodas ir pridėkite „How to rollback“ pastabą.

---
**Pastaba:** kiekviena užduotis gali būti įgyvendinta atskirame PR; užbaigus vieną etapą rekomenduojama paženklinti versiją (`git tag v0.2.0-alpha<N>`), kad būtų paprasta grįžti, jei Supabase integracija reikalauja papildomų permainų.
