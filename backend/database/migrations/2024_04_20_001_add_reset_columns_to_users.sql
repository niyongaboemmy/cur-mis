-- Add reset token columns to users table for password reset functionality
ALTER TABLE users 
ADD COLUMN reset_token VARCHAR(255) NULL AFTER role, 
ADD COLUMN reset_token_expires_at DATETIME NULL AFTER reset_token;
