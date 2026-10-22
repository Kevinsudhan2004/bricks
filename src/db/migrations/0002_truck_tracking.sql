CREATE TABLE "truck_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"truck_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"model" text,
	"android_version" varchar(20),
	"app_version" varchar(20),
	"paired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "truck_devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "truck_points" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"truck_id" integer NOT NULL,
	"trip_id" integer,
	"recorded_at" timestamp with time zone NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"speed_kmh" real,
	"heading" real,
	"accuracy_m" real,
	"altitude_m" real,
	"battery" smallint,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "truck_trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"truck_id" integer NOT NULL,
	"device_id" integer,
	"client_id" varchar(40) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"distance_m" double precision DEFAULT 0 NOT NULL,
	"moving_seconds" integer DEFAULT 0 NOT NULL,
	"max_speed_kmh" real DEFAULT 0 NOT NULL,
	"point_count" integer DEFAULT 0 NOT NULL,
	"last_point_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trucks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plate_no" varchar(20),
	"driver_name" text,
	"driver_phone" varchar(20),
	"active" boolean DEFAULT true NOT NULL,
	"pair_code" varchar(8),
	"pair_code_expires_at" timestamp with time zone,
	"last_lat" double precision,
	"last_lng" double precision,
	"last_speed_kmh" real,
	"last_heading" real,
	"last_accuracy_m" real,
	"last_battery" smallint,
	"last_charging" boolean,
	"last_point_at" timestamp with time zone,
	"last_moving_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"current_trip_id" integer,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trucks_pair_code_unique" UNIQUE("pair_code")
);
--> statement-breakpoint
ALTER TABLE "truck_devices" ADD CONSTRAINT "truck_devices_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_points" ADD CONSTRAINT "truck_points_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_points" ADD CONSTRAINT "truck_points_trip_id_truck_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."truck_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_trips" ADD CONSTRAINT "truck_trips_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_trips" ADD CONSTRAINT "truck_trips_device_id_truck_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."truck_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "truck_devices_truck_idx" ON "truck_devices" USING btree ("truck_id");--> statement-breakpoint
CREATE UNIQUE INDEX "truck_points_time_idx" ON "truck_points" USING btree ("truck_id","recorded_at");--> statement-breakpoint
CREATE INDEX "truck_points_trip_idx" ON "truck_points" USING btree ("trip_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "truck_trips_client_idx" ON "truck_trips" USING btree ("truck_id","client_id");--> statement-breakpoint
CREATE INDEX "truck_trips_started_idx" ON "truck_trips" USING btree ("truck_id","started_at");