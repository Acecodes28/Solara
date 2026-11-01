CREATE TABLE "irrigation_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "field_id" uuid NOT NULL REFERENCES "fields"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "amount_mm" double precision NOT NULL CHECK ("amount_mm" > 0 AND "amount_mm" <= 300),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "irrigation_logs_uq" ON "irrigation_logs" ("field_id", "date");
