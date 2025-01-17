# ************************************************************
# Sequel Pro SQL dump
# Version 4541
#
# http://www.sequelpro.com/
# https://github.com/sequelpro/sequelpro
#
# Host: localhost (MySQL 5.7.17)
# Database: readiumdata
# Generation Time: 2017-05-11 09:37:24 +0000
# ************************************************************


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


# Dump of table book
# ------------------------------------------------------------

CREATE TABLE `book` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `title` text CHARACTER SET utf8 NOT NULL,
  `author` text CHARACTER SET utf8 NOT NULL,
  `coverHref` text CHARACTER SET utf8,
  `rootUrl` varchar(100) CHARACTER SET utf8 DEFAULT '',
  `updated_at` datetime NOT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `rootUrl` (`rootUrl`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;



# Dump of table book-idp
# ------------------------------------------------------------

CREATE TABLE `book-idp` (
  `book_id` int(11) unsigned NOT NULL,
  `idp_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`book_id`,`idp_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;



# Dump of table highlight
# ------------------------------------------------------------

CREATE TABLE `highlight` (
  `user_id` int(11) NOT NULL,
  `book_id` int(11) unsigned NOT NULL,
  `spineIdRef` varchar(150) COLLATE utf8_bin NOT NULL DEFAULT '',
  `cfi` varchar(150) COLLATE utf8_bin NOT NULL DEFAULT '',
  `color` tinyint(3) unsigned NOT NULL,
  `note` text CHARACTER SET utf8 NOT NULL,
  `updated_at` datetime(3) NOT NULL,
  `deleted_at` datetime NOT NULL DEFAULT '0000-01-01 00:00:00',
  PRIMARY KEY (`user_id`,`book_id`,`spineIdRef`,`cfi`,`deleted_at`),
  KEY `user_id` (`user_id`,`book_id`),
  KEY `deleted_at` (`deleted_at`),
  KEY `updated_at` (`updated_at`),
  KEY `user_id_2` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;



# Dump of table idp
# ------------------------------------------------------------

CREATE TABLE `idp` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` text COLLATE utf8_bin NOT NULL,
  `domain` varchar(253) COLLATE utf8_bin NOT NULL DEFAULT '',
  `useReaderTxt` tinyint(4) NOT NULL,
  `entryPoint` text COLLATE utf8_bin,
  `logoutUrl` text COLLATE utf8_bin,
  `nameQualifier` varchar(100) COLLATE utf8_bin DEFAULT '',
  `idpcert` text COLLATE utf8_bin,
  `spcert` text COLLATE utf8_bin,
  `spkey` text COLLATE utf8_bin,
  `language` varchar(5) COLLATE utf8_bin DEFAULT NULL,
  `adminUserEmails` text COLLATE utf8_bin NOT NULL,
  `created_at` datetime NOT NULL,
  `demo_expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `domain` (`domain`),
  KEY `nameQualifier` (`nameQualifier`),
  KEY `demo_expires_at` (`demo_expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;



# Dump of table latest_location
# ------------------------------------------------------------

CREATE TABLE `latest_location` (
  `user_id` int(11) NOT NULL,
  `book_id` int(11) unsigned NOT NULL,
  `cfi` varchar(150) COLLATE utf8_bin NOT NULL DEFAULT '',
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`user_id`,`book_id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;



# Dump of table user
# ------------------------------------------------------------

CREATE TABLE `user` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `user_id_from_idp` int(11) NOT NULL,
  `idp_id` int(11) unsigned NOT NULL,
  `email` varchar(256) COLLATE utf8_unicode_ci NOT NULL DEFAULT '',
  `last_login_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id_from_idp` (`user_id_from_idp`,`idp_id`),
  KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;




/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
