# Supabase projekto paruošimas

Šis katalogas saugo pirmojo integracijos etapo ("Supabase projekto paruošimas") artefaktus. Instrukcijos remiasi `docs/supabase-integration-plan.md`.

## 1. Projekto kūrimas
1. Supabase valdymo pulte sukurkite naują projektą arba pasirinkite esamą organizaciją.
2. Pasirinkite regioną, kuriame laikysite ED skyriaus nustatymus.
3. Įgalinkite **Email** autentifikaciją skiltyje `Authentication → Providers`, nustatykite slaptažodžio politiką ir (jei reikia) SMTP, kad veiktų slaptažodžio atkūrimas.

## 2. Schema ir RLS
1. Atsisiųskite `schema.sql` iš šio katalogo.
2. SQL paleiskite per Supabase SQL editorių (arba CLI):
   ```bash
   supabase db execute --file supabase/schema.sql
   ```
3. Patvirtinkite, kad atsirado lentelė `ed_dash_settings`, įjungtas RLS ir indeksas `idx_ed_dash_settings_user_id`.

## 3. Smoke test
1. Per Supabase Auth UI sukurkite testinį vartotoją.
2. Rankiniu būdu įterpkite vieną `ed_dash_settings` eilutę su to vartotojo `user_id` ir pavyzdiniu `state_json`.
3. Prisijunkite naudodami tą vartotoją ir SQL editoriuje patikrinkite, ar jis mato tik savo eilutę (RLS veikia).

## 4. Kas toliau?
Tolimesni etapai (konfigūracija, klientas, UI ir t. t.) aprašyti `docs/supabase-integration-plan.md`. Užbaigus šį etapą galite kurti vietinį `supabase-config.js` failą pagal kitos užduoties reikalavimus.
