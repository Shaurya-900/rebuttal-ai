CREATE TABLE "exhibit" (
	"id" text PRIMARY KEY NOT NULL,
	"dispute_id" text NOT NULL,
	"order_id" text NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"sha256" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exhibit" ADD CONSTRAINT "exhibit_dispute_id_dispute_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."dispute"("id") ON DELETE no action ON UPDATE no action;