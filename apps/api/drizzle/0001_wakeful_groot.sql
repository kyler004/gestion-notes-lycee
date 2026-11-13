CREATE TABLE "council_decision_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"council_decision_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"previous_decision" text,
	"new_decision" text NOT NULL,
	"previous_appreciation" text,
	"new_appreciation" text NOT NULL,
	"previous_absences_hours" integer,
	"new_absences_hours" integer NOT NULL,
	"changed_by" uuid NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"server_timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_subjects" DROP CONSTRAINT "class_subjects_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "class_subjects" DROP CONSTRAINT "class_subjects_subject_id_subjects_id_fk";
--> statement-breakpoint
ALTER TABLE "class_subjects" DROP CONSTRAINT "class_subjects_subject_group_id_subject_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "classes" DROP CONSTRAINT "classes_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
ALTER TABLE "classes" DROP CONSTRAINT "classes_main_teacher_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "council_decisions" DROP CONSTRAINT "council_decisions_enrollment_id_enrollments_id_fk";
--> statement-breakpoint
ALTER TABLE "council_decisions" DROP CONSTRAINT "council_decisions_period_id_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "council_decisions" DROP CONSTRAINT "council_decisions_decided_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_student_id_students_id_fk";
--> statement-breakpoint
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
ALTER TABLE "grade_audit_logs" DROP CONSTRAINT "grade_audit_logs_grade_id_grades_id_fk";
--> statement-breakpoint
ALTER TABLE "grade_audit_logs" DROP CONSTRAINT "grade_audit_logs_enrollment_id_enrollments_id_fk";
--> statement-breakpoint
ALTER TABLE "grade_audit_logs" DROP CONSTRAINT "grade_audit_logs_class_subject_id_class_subjects_id_fk";
--> statement-breakpoint
ALTER TABLE "grade_audit_logs" DROP CONSTRAINT "grade_audit_logs_period_id_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "grade_audit_logs" DROP CONSTRAINT "grade_audit_logs_changed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "grades" DROP CONSTRAINT "grades_enrollment_id_enrollments_id_fk";
--> statement-breakpoint
ALTER TABLE "grades" DROP CONSTRAINT "grades_class_subject_id_class_subjects_id_fk";
--> statement-breakpoint
ALTER TABLE "grades" DROP CONSTRAINT "grades_period_id_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "grades" DROP CONSTRAINT "grades_entered_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "grading_rules" DROP CONSTRAINT "grading_rules_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
ALTER TABLE "period_audit_logs" DROP CONSTRAINT "period_audit_logs_period_id_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "period_audit_logs" DROP CONSTRAINT "period_audit_logs_actor_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "period_student_results" DROP CONSTRAINT "period_student_results_period_id_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "period_student_results" DROP CONSTRAINT "period_student_results_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "period_student_results" DROP CONSTRAINT "period_student_results_enrollment_id_enrollments_id_fk";
--> statement-breakpoint
ALTER TABLE "period_subject_results" DROP CONSTRAINT "period_subject_results_period_id_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "period_subject_results" DROP CONSTRAINT "period_subject_results_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "period_subject_results" DROP CONSTRAINT "period_subject_results_enrollment_id_enrollments_id_fk";
--> statement-breakpoint
ALTER TABLE "period_subject_results" DROP CONSTRAINT "period_subject_results_class_subject_id_class_subjects_id_fk";
--> statement-breakpoint
ALTER TABLE "periods" DROP CONSTRAINT "periods_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
ALTER TABLE "periods" DROP CONSTRAINT "periods_locked_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "subject_groups" DROP CONSTRAINT "subject_groups_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
ALTER TABLE "teacher_assignments" DROP CONSTRAINT "teacher_assignments_teacher_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "teacher_assignments" DROP CONSTRAINT "teacher_assignments_class_subject_id_class_subjects_id_fk";
--> statement-breakpoint
ALTER TABLE "teacher_assignments" DROP CONSTRAINT "teacher_assignments_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'sync_operations'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

ALTER TABLE "sync_operations" DROP CONSTRAINT "sync_operations_pkey";--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_pkey" PRIMARY KEY("user_id","operation_id");--> statement-breakpoint
ALTER TABLE "grade_audit_logs" ADD COLUMN "previous_appreciation" text;--> statement-breakpoint
ALTER TABLE "grade_audit_logs" ADD COLUMN "new_appreciation" text;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "session_expires_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "council_decision_audit_logs" ADD CONSTRAINT "council_decision_audit_logs_council_decision_id_council_decisions_id_fk" FOREIGN KEY ("council_decision_id") REFERENCES "public"."council_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "council_decision_audit_logs" ADD CONSTRAINT "council_decision_audit_logs_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "council_decision_audit_logs" ADD CONSTRAINT "council_decision_audit_logs_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "council_decision_audit_logs" ADD CONSTRAINT "council_decision_audit_logs_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "council_decision_audit_logs_cd_idx" ON "council_decision_audit_logs" USING btree ("council_decision_id");--> statement-breakpoint
CREATE INDEX "council_decision_audit_logs_period_idx" ON "council_decision_audit_logs" USING btree ("period_id");--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_group_id_subject_groups_id_fk" FOREIGN KEY ("subject_group_id") REFERENCES "public"."subject_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_main_teacher_id_users_id_fk" FOREIGN KEY ("main_teacher_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "council_decisions" ADD CONSTRAINT "council_decisions_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "council_decisions" ADD CONSTRAINT "council_decisions_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "council_decisions" ADD CONSTRAINT "council_decisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_audit_logs" ADD CONSTRAINT "grade_audit_logs_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_audit_logs" ADD CONSTRAINT "grade_audit_logs_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_audit_logs" ADD CONSTRAINT "grade_audit_logs_class_subject_id_class_subjects_id_fk" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_audit_logs" ADD CONSTRAINT "grade_audit_logs_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_audit_logs" ADD CONSTRAINT "grade_audit_logs_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_class_subject_id_class_subjects_id_fk" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_rules" ADD CONSTRAINT "grading_rules_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_audit_logs" ADD CONSTRAINT "period_audit_logs_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_audit_logs" ADD CONSTRAINT "period_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_student_results" ADD CONSTRAINT "period_student_results_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_student_results" ADD CONSTRAINT "period_student_results_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_student_results" ADD CONSTRAINT "period_student_results_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_subject_results" ADD CONSTRAINT "period_subject_results_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_subject_results" ADD CONSTRAINT "period_subject_results_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_subject_results" ADD CONSTRAINT "period_subject_results_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_subject_results" ADD CONSTRAINT "period_subject_results_class_subject_id_class_subjects_id_fk" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_parent_period_id_periods_id_fk" FOREIGN KEY ("parent_period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_groups" ADD CONSTRAINT "subject_groups_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_class_subject_id_class_subjects_id_fk" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_dates_chk" CHECK ("academic_years"."end_date" > "academic_years"."start_date");--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_coef_chk" CHECK ("class_subjects"."coefficient" > 0 AND "class_subjects"."coefficient" <= 20);--> statement-breakpoint
ALTER TABLE "council_decisions" ADD CONSTRAINT "council_decisions_absences_chk" CHECK ("council_decisions"."absences_hours" >= 0 AND "council_decisions"."absences_hours" <= 5000);--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_score_range_chk" CHECK ("grades"."score" IS NULL OR ("grades"."score" >= 0 AND "grades"."score" <= 20));--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_status_score_chk" CHECK (("grades"."status" = 'present' AND "grades"."score" IS NOT NULL) OR ("grades"."status" IN ('absent', 'excused') AND "grades"."score" IS NULL));--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_weight_pos_chk" CHECK ("periods"."weight" > 0);--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_not_self_parent_chk" CHECK ("periods"."parent_period_id" IS NULL OR "periods"."parent_period_id" <> "periods"."id");--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_type_chk" CHECK ("periods"."type" IN ('trimester', 'sequence'));--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_status_chk" CHECK ("periods"."status" IN ('open', 'locked'));--> statement-breakpoint
ALTER TABLE "school_profile" ADD CONSTRAINT "school_profile_singleton_chk" CHECK ("school_profile"."id" = 1);