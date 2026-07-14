CREATE TABLE "businesses" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text,
	"name" text NOT NULL,
	"owner_name" text NOT NULL,
	"phone" text NOT NULL,
	"whatsapp_number" text,
	"city" text,
	"address" text,
	"google_maps_link" text,
	"category" text DEFAULT 'salon' NOT NULL,
	"description" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"working_hours" jsonb,
	"cancellation_policy" text,
	"token_policy" text,
	"preferred_tone" text DEFAULT 'friendly' NOT NULL,
	"review_link" text,
	"whatsapp_verify_token" text,
	"is_onboarded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"description" text,
	"requires_consultation" boolean DEFAULT false NOT NULL,
	"requires_token_advance" boolean DEFAULT false NOT NULL,
	"repeat_reminder_days" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"notes" text,
	"source" text DEFAULT 'manual',
	"last_visit_at" timestamp with time zone,
	"total_visits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"customer_id" integer,
	"service_id" integer NOT NULL,
	"booking_date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_by_ai" boolean DEFAULT false NOT NULL,
	"reminder_24h_sent" boolean DEFAULT false NOT NULL,
	"reminder_2h_sent" boolean DEFAULT false NOT NULL,
	"review_request_sent" boolean DEFAULT false NOT NULL,
	"repeat_reminder_scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"customer_id" integer,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"direction" text NOT NULL,
	"content" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"provider_message_id" text,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_action_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"customer_id" integer,
	"booking_id" integer,
	"conversation_id" integer,
	"action_type" text NOT NULL,
	"input_summary" text,
	"output_summary" text,
	"reply_draft" text,
	"confidence_score" real,
	"status" text DEFAULT 'pending' NOT NULL,
	"requires_human_review" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"reminder_24h_enabled" boolean DEFAULT true NOT NULL,
	"reminder_2h_enabled" boolean DEFAULT true NOT NULL,
	"review_request_enabled" boolean DEFAULT true NOT NULL,
	"review_request_delay_hours" integer DEFAULT 2 NOT NULL,
	"repeat_reminder_enabled" boolean DEFAULT true NOT NULL,
	"ai_auto_reply_enabled" boolean DEFAULT true NOT NULL,
	"ai_confidence_threshold" real DEFAULT 0.8 NOT NULL,
	"review_template" text,
	"reminder_template" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_settings_business_id_unique" UNIQUE("business_id")
);
--> statement-breakpoint
CREATE TABLE "reminder_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"customer_id" integer,
	"booking_id" integer,
	"type" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"plan" text DEFAULT 'trial' NOT NULL,
	"status" text DEFAULT 'trialing' NOT NULL,
	"razorpay_subscription_id" text,
	"razorpay_plan_id" text,
	"staff_limit" integer DEFAULT 1 NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"clerk_user_id" text,
	"role" text DEFAULT 'staff' NOT NULL,
	"invited_email" text NOT NULL,
	"clerk_invitation_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_logs" ADD CONSTRAINT "ai_action_logs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_logs" ADD CONSTRAINT "ai_action_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_logs" ADD CONSTRAINT "ai_action_logs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_logs" ADD CONSTRAINT "ai_action_logs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD CONSTRAINT "automation_settings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD CONSTRAINT "reminder_jobs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD CONSTRAINT "reminder_jobs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD CONSTRAINT "reminder_jobs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;