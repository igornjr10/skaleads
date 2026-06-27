ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS report_template JSONB DEFAULT '{
    "period": "7d",
    "metrics": ["spend", "impressions", "clicks", "ctr", "cpc"],
    "include_campaigns": true,
    "include_audit": false,
    "intro": ""
  }'::jsonb;
