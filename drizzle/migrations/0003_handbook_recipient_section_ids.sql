ALTER TABLE public.hms_handbook_recipients
  ADD COLUMN IF NOT EXISTS section_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS hms_handbook_recipients_version_idx
  ON public.hms_handbook_recipients(version_id);

-- Etterfyll fra distribusjonen slik at eksisterende lenker viser riktig innhold
UPDATE public.hms_handbook_recipients r
   SET section_ids = d.section_ids,
       section_titles = d.section_titles
  FROM public.hms_handbook_distributions d
 WHERE d.id = r.distribution_id
   AND cardinality(r.section_ids) = 0
   AND cardinality(d.section_ids) > 0;