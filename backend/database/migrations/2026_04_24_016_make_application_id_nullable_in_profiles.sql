-- Allow applicant profiles to be created before an application is submitted
ALTER TABLE `applicant_profiles` MODIFY `application_id` int(10) unsigned NULL;
