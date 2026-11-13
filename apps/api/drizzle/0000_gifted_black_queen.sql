CREATE SEQUENCE "public"."sync_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"sync_version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_years_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "class_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_group_id" uuid,
	"coefficient" numeric(4, 2) NOT NULL,
	"sync_version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"series" text,
	"main_teacher_id" uuid,
	"sync_version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "council_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"general_appreciation" text DEFAULT '' NOT NULL,
	"decision" text DEFAULT 'none' NOT NULL,
	"absences_hours" integer DEFAULT 0 NOT NULL,
	"decided_by" uuid NOT NULL,
	"sync_version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"is_repeater" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"sync_version" bigint DEFAULT 1 NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grade_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"class_subject_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"previous_score" numeric(5, 2),
	"new_score" numeric(5, 2),
	"previous_status" text,
	"new_status" text NOT NULL,
	"changed_by" uuid NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"client_timestamp" timestamp with time zone,
	"server_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"operation_id" uuid
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"class_subject_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"score" numeric(5, 2),
	"status" text DEFAULT 'present' NOT NULL,
	"appreciation" text,
	"entered_by" uuid NOT NULL,
	"last_operation_id" uuid,
	"sync_version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grading_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"trimesters_count" integer DEFAULT 3 NOT NULL,
	"sequences_per_trimester" integer DEFAULT 2 NOT NULL,
	"sequence_weights" jsonb NOT NULL,
	"trimester_weights" jsonb NOT NULL,
	"passing_threshold" numeric(5, 2) DEFAULT '10.00' NOT NULL,
	"honor_roll_threshold" numeric(5, 2) DEFAULT '12.00' NOT NULL,
	"encouragement_threshold" numeric(5, 2) DEFAULT '13.00' NOT NULL,
	"congratulation_threshold" numeric(5, 2) DEFAULT '15.00' NOT NULL,
	"treat_absent_as_zero" boolean DEFAULT true NOT NULL,
	"appreciation_scale" jsonb NOT NULL,
	"sync_version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grading_rules_academic_year_id_unique" UNIQUE("academic_year_id")
);
--> statement-breakpoint
CREATE TABLE "period_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period_student_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"total_coefficient" numeric(6, 2) NOT NULL,
	"total_points" numeric(8, 2) NOT NULL,
	"general_average" numeric(5, 2),
	"rank" integer,
	"class_size" integer NOT NULL,
	"class_average" numeric(5, 2),
	"min_class_average" numeric(5, 2),
	"max_class_average" numeric(5, 2),
	"pass_rate" numeric(5, 2),
	"is_honor_roll" boolean DEFAULT false NOT NULL,
	"auto_appreciation" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period_subject_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"class_subject_id" uuid NOT NULL,
	"sequence_scores_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"average" numeric(5, 2),
	"weighted_score" numeric(7, 2),
	"rank" integer,
	"class_average" numeric(5, 2),
	"min_score" numeric(5, 2),
	"max_score" numeric(5, 2),
	"appreciation" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"parent_period_id" uuid,
	"type" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"order_index" integer NOT NULL,
	"weight" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"sync_version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_label" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "school_profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"motto" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'République du Cameroun' NOT NULL,
	"ministry" text DEFAULT 'Ministère des Enseignements Secondaires' NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"delegation" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"logo_data" "bytea",
	"logo_mime_type" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matricule" text NOT NULL,
	"last_name" text NOT NULL,
	"first_name" text NOT NULL,
	"birth_date" date NOT NULL,
	"birth_place" text DEFAULT '' NOT NULL,
	"sex" text NOT NULL,
	"sync_version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_matricule_unique" UNIQUE("matricule")
);
--> statement-breakpoint
CREATE TABLE "subject_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order_index" integer NOT NULL,
	"sync_version" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sync_version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"outcome" text NOT NULL,
	"error_message" text,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"class_subject_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sync_version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"full_name" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_group_id_subject_groups_id_fk" FOREIGN KEY ("subject_group_id") REFERENCES "public"."subject_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_main_teacher_id_users_id_fk" FOREIGN KEY ("main_teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "council_decisions" ADD CONSTRAINT "council_decisions_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "council_decisions" ADD CONSTRAINT "council_decisions_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "council_decisions" ADD CONSTRAINT "council_decisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_audit_logs" ADD CONSTRAINT "grade_audit_logs_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_audit_logs" ADD CONSTRAINT "grade_audit_logs_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_audit_logs" ADD CONSTRAINT "grade_audit_logs_class_subject_id_class_subjects_id_fk" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_audit_logs" ADD CONSTRAINT "grade_audit_logs_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_audit_logs" ADD CONSTRAINT "grade_audit_logs_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_class_subject_id_class_subjects_id_fk" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_rules" ADD CONSTRAINT "grading_rules_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_audit_logs" ADD CONSTRAINT "period_audit_logs_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_audit_logs" ADD CONSTRAINT "period_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_student_results" ADD CONSTRAINT "period_student_results_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_student_results" ADD CONSTRAINT "period_student_results_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_student_results" ADD CONSTRAINT "period_student_results_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_subject_results" ADD CONSTRAINT "period_subject_results_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_subject_results" ADD CONSTRAINT "period_subject_results_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_subject_results" ADD CONSTRAINT "period_subject_results_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_subject_results" ADD CONSTRAINT "period_subject_results_class_subject_id_class_subjects_id_fk" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_groups" ADD CONSTRAINT "subject_groups_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_class_subject_id_class_subjects_id_fk" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_subjects_class_subject_uidx" ON "class_subjects" USING btree ("class_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_year_name_uidx" ON "classes" USING btree ("academic_year_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "council_decisions_enrollment_period_uidx" ON "council_decisions" USING btree ("enrollment_id","period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_student_year_uidx" ON "enrollments" USING btree ("student_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "enrollments_class_idx" ON "enrollments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "grade_audit_logs_grade_idx" ON "grade_audit_logs" USING btree ("grade_id");--> statement-breakpoint
CREATE INDEX "grade_audit_logs_period_idx" ON "grade_audit_logs" USING btree ("period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grades_enrollment_cs_period_uidx" ON "grades" USING btree ("enrollment_id","class_subject_id","period_id");--> statement-breakpoint
CREATE INDEX "grades_period_cs_idx" ON "grades" USING btree ("period_id","class_subject_id");--> statement-breakpoint
CREATE INDEX "period_audit_logs_period_idx" ON "period_audit_logs" USING btree ("period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "period_student_results_period_enrollment_uidx" ON "period_student_results" USING btree ("period_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "period_student_results_period_class_idx" ON "period_student_results" USING btree ("period_id","class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "period_subject_results_uidx" ON "period_subject_results" USING btree ("period_id","enrollment_id","class_subject_id");--> statement-breakpoint
CREATE INDEX "period_subject_results_period_class_idx" ON "period_subject_results" USING btree ("period_id","class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "periods_year_code_uidx" ON "periods" USING btree ("academic_year_id","code");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subject_groups_year_name_uidx" ON "subject_groups" USING btree ("academic_year_id","name");--> statement-breakpoint
CREATE INDEX "sync_operations_user_idx" ON "sync_operations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_assignments_teacher_cs_uidx" ON "teacher_assignments" USING btree ("teacher_id","class_subject_id");--> statement-breakpoint
CREATE INDEX "teacher_assignments_teacher_idx" ON "teacher_assignments" USING btree ("teacher_id");