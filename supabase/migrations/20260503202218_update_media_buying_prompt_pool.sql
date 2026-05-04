with new_prompt_pool(prompt_text, models, is_active) as (
  values
    ('best media buying agency in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true),
    ('top media buying agencies in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true),
    ('best media buying company for san diego businesses', '["chatgpt", "claude", "gemini"]'::jsonb, true),
    ('san diego media buying agency for local brands', '["chatgpt", "claude", "gemini"]'::jsonb, true),
    ('best paid media agency in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true),
    ('top programmatic media buying agency in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true),
    ('best tv and digital media buying agency in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true),
    ('best media planning and buying agency in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true),
    ('san diego agency for media buying and ad placements', '["chatgpt", "claude", "gemini"]'::jsonb, true),
    ('best local media buying partner in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true)
)
update public.tracked_prompts
set
  is_active = false,
  updated_at = now()
where not exists (
  select 1
  from new_prompt_pool
  where new_prompt_pool.prompt_text = tracked_prompts.prompt_text
);

insert into public.tracked_prompts (prompt_text, models, is_active)
values
  ('best media buying agency in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true),
  ('top media buying agencies in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true),
  ('best media buying company for san diego businesses', '["chatgpt", "claude", "gemini"]'::jsonb, true),
  ('san diego media buying agency for local brands', '["chatgpt", "claude", "gemini"]'::jsonb, true),
  ('best paid media agency in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true),
  ('top programmatic media buying agency in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true),
  ('best tv and digital media buying agency in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true),
  ('best media planning and buying agency in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true),
  ('san diego agency for media buying and ad placements', '["chatgpt", "claude", "gemini"]'::jsonb, true),
  ('best local media buying partner in san diego', '["chatgpt", "claude", "gemini"]'::jsonb, true)
on conflict (prompt_text) do update
set
  models = excluded.models,
  is_active = true,
  updated_at = now();
