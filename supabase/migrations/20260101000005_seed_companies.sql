-- Market Intelligence: seed the 15 tracked companies.
-- Only names/slugs are seeded. No capacity, management, financial or
-- technology data is fabricated here -- Admin fills that in via the
-- Admin Dashboard once real, verified information is available.

insert into public.companies (name, slug, display_order) values
  ('Rayzon Solar Limited', 'rayzon-solar-limited', 1),
  ('Premier Energies Limited', 'premier-energies-limited', 2),
  ('Waaree Energies Limited', 'waaree-energies-limited', 3),
  ('Emmvee Photovoltaic Power Pvt. Ltd.', 'emmvee-photovoltaic-power-pvt-ltd', 4),
  ('Vikram Solar Limited', 'vikram-solar-limited', 5),
  ('Avaada Electro Limited', 'avaada-electro-limited', 6),
  ('Adani Solar', 'adani-solar', 7),
  ('Saatvik Green Energy Limited', 'saatvik-green-energy-limited', 8),
  ('Tata Power Solar', 'tata-power-solar', 9),
  ('RenewSys India Pvt. Ltd.', 'renewsys-india-pvt-ltd', 10),
  ('Goldi Solar', 'goldi-solar', 11),
  ('Solex Energy Limited', 'solex-energy-limited', 12),
  ('Reliance Industries Limited', 'reliance-industries-limited', 13),
  ('Gautam Solar Pvt. Ltd.', 'gautam-solar-pvt-ltd', 14),
  ('Jupiter International Limited', 'jupiter-international-limited', 15)
on conflict (name) do nothing;
