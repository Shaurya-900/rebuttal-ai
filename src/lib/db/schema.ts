// Postgres is the queue, outbox, lease store and dedupe table (CLAUDE.md: no Redis, no queue lib).
import { sql } from "drizzle-orm";
import { bigint, bigserial, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const intentStatus = pgEnum("intent_status", ["PROPOSED", "APPROVED", "SENDING", "CONFIRMED", "FAILED"]);

export const dispute = pgTable("dispute", {
  id: text("id").primaryKey(), // PayPal dispute id (PP-D-… or PP-R-…)
  orderId: text("order_id"),
  captureId: text("capture_id"),
  buyerPayerId: text("buyer_payer_id"),
  reason: text("reason").notNull(),
  status: text("status").notNull(),
  stage: text("stage"),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  sellerResponseDueAt: timestamp("seller_response_due_at", { withTimezone: true }),
  raw: jsonb("raw").notNull(), // last GET, for the trace
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("dispute_buyer_idx").on(t.buyerPayerId)]);

export const actionIntent = pgTable("action_intent", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  disputeId: text("dispute_id").notNull().references(() => dispute.id),
  actionType: text("action_type").notNull(),
  params: jsonb("params").notNull(),
  paramsHash: text("params_hash").notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
  status: intentStatus("status").notNull().default("PROPOSED"),
  gateDecision: jsonb("gate_decision").notNull(), // decision + every rule that fired
  idempotencyKey: text("idempotency_key").notNull(),
  attempt: integer("attempt").notNull().default(0),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("action_intent_idem_uq").on(t.idempotencyKey),
  uniqueIndex("action_intent_once_uq").on(t.disputeId, t.actionType, t.paramsHash), // I9
  index("action_intent_claim_idx").on(t.status, t.leaseExpiresAt),
]);

// Written in the same transaction as the intent; the executor drains it.
export const outbox = pgTable("outbox", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  intentId: bigint("intent_id", { mode: "number" }).notNull().references(() => actionIntent.id),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (t) => [index("outbox_pending_idx").on(t.availableAt).where(sql`${t.processedAt} is null`)]);

export const webhookEvent = pgTable("webhook_event", {
  eventId: text("event_id").primaryKey(), // dedupe (A6)
  eventType: text("event_type").notNull(),
  resourceId: text("resource_id"),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

// Append-only: a trigger rejects UPDATE and DELETE (drizzle/0001_event_log_append_only.sql).
export const eventLog = pgTable("event_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  disputeId: text("dispute_id"),
  kind: text("kind").notNull(),
  data: jsonb("data").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
