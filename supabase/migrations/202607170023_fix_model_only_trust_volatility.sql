-- jsonb constructors used by the model-only fallback are STABLE in PostgreSQL.
-- Declare the weakest truthful volatility instead of overstating immutability.
alter function public.model_only_element_trust(numeric) stable;
