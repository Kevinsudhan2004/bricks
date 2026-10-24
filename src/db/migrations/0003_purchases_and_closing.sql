CREATE TABLE "purchase_bill_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"bill_id" integer NOT NULL,
	"material_id" integer NOT NULL,
	"quantity_kg" numeric(14, 2) NOT NULL,
	"rate_per_ton" numeric(10, 2) NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"bill_no" varchar(30) NOT NULL,
	"supplier_bill_no" varchar(40),
	"bill_date" date NOT NULL,
	"due_date" date,
	"supplier_id" integer NOT NULL,
	"tax_type" "tax_type" DEFAULT 'intra' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"transport_charges" numeric(14, 2) DEFAULT 0 NOT NULL,
	"cgst" numeric(14, 2) DEFAULT 0 NOT NULL,
	"sgst" numeric(14, 2) DEFAULT 0 NOT NULL,
	"igst" numeric(14, 2) DEFAULT 0 NOT NULL,
	"round_off" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"notes" text,
	"status" "invoice_status" DEFAULT 'active' NOT NULL,
	"cancel_reason" text,
	"closed_at" timestamp with time zone,
	"closed_by" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_bills_bill_no_unique" UNIQUE("bill_no")
);
--> statement-breakpoint
CREATE TABLE "supplier_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_no" varchar(30) NOT NULL,
	"type" "note_type" NOT NULL,
	"note_date" date NOT NULL,
	"supplier_id" integer NOT NULL,
	"bill_id" integer,
	"amount" numeric(14, 2) NOT NULL,
	"reason" varchar(30) NOT NULL,
	"description" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" text,
	CONSTRAINT "supplier_notes_note_no_unique" UNIQUE("note_no")
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"voucher_no" varchar(30) NOT NULL,
	"payment_date" date NOT NULL,
	"supplier_id" integer NOT NULL,
	"bill_id" integer,
	"amount" numeric(14, 2) NOT NULL,
	"mode" "payment_mode" DEFAULT 'bank' NOT NULL,
	"reference" text,
	"remarks" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" text,
	CONSTRAINT "supplier_payments_voucher_no_unique" UNIQUE("voucher_no")
);
--> statement-breakpoint
ALTER TABLE "inbound_entries" ADD COLUMN "purchase_bill_id" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "closed_by" integer;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "opening_balance" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_bill_id_purchase_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."purchase_bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_notes" ADD CONSTRAINT "supplier_notes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_notes" ADD CONSTRAINT "supplier_notes_bill_id_purchase_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."purchase_bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_notes" ADD CONSTRAINT "supplier_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_bill_id_purchase_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."purchase_bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_bill_items_bill_idx" ON "purchase_bill_items" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "purchase_bills_supplier_idx" ON "purchase_bills" USING btree ("supplier_id","bill_date");--> statement-breakpoint
CREATE INDEX "purchase_bills_date_idx" ON "purchase_bills" USING btree ("bill_date");--> statement-breakpoint
CREATE INDEX "supplier_notes_supplier_idx" ON "supplier_notes" USING btree ("supplier_id","note_date");--> statement-breakpoint
CREATE INDEX "supplier_notes_bill_idx" ON "supplier_notes" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier_idx" ON "supplier_payments" USING btree ("supplier_id","payment_date");--> statement-breakpoint
CREATE INDEX "supplier_payments_bill_idx" ON "supplier_payments" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_date_idx" ON "supplier_payments" USING btree ("payment_date");--> statement-breakpoint
ALTER TABLE "inbound_entries" ADD CONSTRAINT "inbound_entries_purchase_bill_id_purchase_bills_id_fk" FOREIGN KEY ("purchase_bill_id") REFERENCES "public"."purchase_bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbound_bill_idx" ON "inbound_entries" USING btree ("purchase_bill_id");