-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Jan 05, 2026 at 06:34 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `pupt_flss_db_copy`
--

-- --------------------------------------------------------

--
-- Table structure for table `version_control`
--

CREATE TABLE `version_control` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `faculty_name` varchar(255) NOT NULL,
  `action_type` varchar(50) DEFAULT NULL,
  `table_name` varchar(100) NOT NULL,
  `record_id` int(11) DEFAULT NULL,
  `component` varchar(255) NOT NULL,
  `changes_summary` text DEFAULT NULL,
  `old_data` longtext DEFAULT NULL,
  `new_data` longtext DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `is_reverted` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `version_control`
--

INSERT INTO `version_control` (`id`, `user_id`, `faculty_name`, `action_type`, `table_name`, `record_id`, `component`, `changes_summary`, `old_data`, `new_data`, `ip_address`, `user_agent`, `created_at`, `is_reverted`) VALUES
(1, 1, 'Superadmin, PUPT-FLSS', 'UPDATED', 'faculty', 39, 'Faculty: Espinola', 'Updated details for Frankie Espinola', '\"{\\\"first_name\\\":\\\"Frankie Josh\\\",\\\"middle_name\\\":null,\\\"last_name\\\":\\\"Espinola\\\",\\\"suffix_name\\\":null,\\\"email\\\":\\\"frankie@example.com\\\",\\\"status\\\":\\\"Active\\\",\\\"faculty_type_id\\\":1}\"', '\"{\\\"first_name\\\":\\\"Frankie\\\",\\\"middle_name\\\":null,\\\"last_name\\\":\\\"Espinola\\\",\\\"suffix_name\\\":null,\\\"email\\\":\\\"frankie@example.com\\\",\\\"status\\\":\\\"Active\\\",\\\"faculty_type_id\\\":1}\"', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36', '2026-01-04 21:21:54', 0),
(2, 1, 'Superadmin, PUPT-FLSS', 'UPDATED', 'faculty', 19, 'Faculty: Bautista', 'Updated details for John Matthew Bautista', '{\"first_name\":\"John Matthew\",\"last_name\":\"Bautista\",\"email\":\"johnmatthewbautista01@gmail.com\",\"status\":\"Active\",\"faculty_type_id\":1}', '{\"first_name\":\"John Matthew\",\"last_name\":\"Bautista\",\"email\":\"johnmatthewbautista01@gmail.com\",\"status\":\"Active\",\"faculty_type_id\":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36', '2026-01-04 21:43:57', 0),
(3, 2, 'Ferrer, Marissa B.', 'RESTORED', 'faculty', 19, 'Faculty: Bautista', 'Restored state from: Jan 05, 2026 5:43 AM', NULL, NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0', '2026-01-04 21:44:06', 0),
(4, 1, 'Superadmin, PUPT-FLSS', 'ADDED', 'faculty', 40, 'Faculty: Teves', 'Added new faculty: Gwen Teves', NULL, '{\"first_name\":\"Gwen\",\"middle_name\":null,\"last_name\":\"Teves\",\"suffix_name\":null,\"email\":\"gwen@example.com\",\"status\":\"Active\",\"faculty_type_id\":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36', '2026-01-04 21:45:45', 0),
(5, 2, 'Ferrer, Marissa B.', 'DELETED', 'faculty', 40, 'Faculty: Teves', 'Reverted (Deleted) the addition made on: Jan 05, 2026 5:45 AM', NULL, NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0', '2026-01-04 22:13:13', 0);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `version_control`
--
ALTER TABLE `version_control`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_user_id` (`user_id`),
  ADD KEY `idx_action_type` (`action_type`),
  ADD KEY `idx_table_name` (`table_name`),
  ADD KEY `idx_created_at` (`created_at`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `version_control`
--
ALTER TABLE `version_control`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
