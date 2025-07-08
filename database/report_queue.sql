-- Create report_queue table for managing automated report generation
CREATE TABLE IF NOT EXISTS `report_queue` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `field_id` int(11) NOT NULL,
  `trigger_type` enum('new_field','field_update','growth_stage_change','loss_event','weather_alert','pest_disease','scheduled') NOT NULL DEFAULT 'field_update',
  `priority` enum('low','normal','high','critical') NOT NULL DEFAULT 'normal',
  `status` enum('pending','processing','completed','error','cancelled') NOT NULL DEFAULT 'pending',
  `error_message` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `processed_at` timestamp NULL DEFAULT NULL,
  `retry_count` int(11) DEFAULT 0,
  `max_retries` int(11) DEFAULT 3,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_field_id` (`field_id`),
  KEY `idx_priority` (`priority`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_trigger_type` (`trigger_type`),
  CONSTRAINT `fk_report_queue_field` FOREIGN KEY (`field_id`) REFERENCES `fields` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS `idx_queue_processing` ON `report_queue` (`status`, `priority`, `created_at`);
CREATE INDEX IF NOT EXISTS `idx_queue_retry` ON `report_queue` (`status`, `retry_count`, `max_retries`);
