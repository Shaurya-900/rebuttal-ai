CREATE TYPE "public"."intent_status" AS ENUM('PROPOSED', 'APPROVED', 'SENDING', 'CONFIRMED', 'FAILED');--> statement-breakpoint
CREATE TABLE "action_intent" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dispute_id" text NOT NULL,
	"action_type" text NOT NULL,
	"params" jsonb NOT NULL,
	"params_hash" text NOT NULL,
	"amount_cents" bigint DEFAULT 0 NOT NULL,
	"status" "intent_status" DEFAULT 'PROPOSED' NOT NULL,
	"gate_decision" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text,
	"capture_id" text,
	"buyer_payer_id" text,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"stage" text,
	"amount_cents" bigint NOT NULL,
	"currency" text NOT NULL,
	"seller_response_due_at" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dispute_id" text,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"intent_id" bigint NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"resource_id" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "action_intent" ADD CONSTRAINT "action_intent_dispute_id_dispute_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."dispute"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_intent_id_action_intent_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."action_intent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "action_intent_idem_uq" ON "action_intent" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "action_intent_once_uq" ON "action_intent" USING btree ("dispute_id","action_type","params_hash");--> statement-breakpoint
CREATE INDEX "action_intent_claim_idx" ON "action_intent" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "dispute_buyer_idx" ON "dispute" USING btree ("buyer_payer_id");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("available_at") WHERE "outbox"."processed_at" is null;