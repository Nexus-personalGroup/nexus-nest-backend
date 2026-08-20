-- CreateIndex
CREATE INDEX `idx_system_logs_created` ON `system_logs`(`created_at`);

-- CreateIndex
CREATE INDEX `idx_system_logs_member_created` ON `system_logs`(`member_id`, `created_at`);

-- CreateIndex
CREATE INDEX `idx_auth_logs_created` ON `auth_logs`(`created_at`);

-- CreateIndex
CREATE INDEX `idx_auth_logs_email_created` ON `auth_logs`(`email`, `created_at`);

-- CreateIndex
CREATE INDEX `idx_auth_logs_member_created` ON `auth_logs`(`member_id`, `created_at`);

-- CreateIndex
CREATE INDEX `idx_password_reset_member` ON `password_reset_tokens`(`member_id`);

-- CreateIndex
CREATE INDEX `idx_password_reset_expires` ON `password_reset_tokens`(`expires_at`);

