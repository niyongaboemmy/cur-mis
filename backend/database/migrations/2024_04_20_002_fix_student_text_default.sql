-- Fix MySQL 5.7+ / 8.0 incompatibility with TEXT column default values
ALTER TABLE student MODIFY full_part_free text;
