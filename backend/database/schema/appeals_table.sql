-- SQL script to create the 'appeals' table
CREATE TABLE `appeals` (
  `appeal_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `schedule_id` bigint(20) UNSIGNED NOT NULL COMMENT 'Reference to the original schedule item',
  
  -- Chosen Fields
  `day` enum('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `room_id` bigint(20) UNSIGNED DEFAULT NULL COMMENT 'Nullable if no specific room is requested',
  
  -- Additional Fields
  `file_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Path to supporting documents',
  `reasoning` text COLLATE utf8mb4_unicode_ci COMMENT 'Explanation for the appeal',
  `is_approved` boolean NOT NULL DEFAULT False,
  
  -- Timestamps
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Keys
  PRIMARY KEY (`appeal_id`),
  KEY `appeals_schedule_id_index` (`schedule_id`),
  KEY `appeals_room_id_index` (`room_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add indexes
ALTER TABLE `appeals`
    ADD INDEX `appeals_day_index` (`day`),
    ADD INDEX `appeals_start_time_index` (`start_time`),
    ADD INDEX `appeals_end_time_index` (`end_time`),
    ADD INDEX `appeals_file_path_index` (`file_path`);