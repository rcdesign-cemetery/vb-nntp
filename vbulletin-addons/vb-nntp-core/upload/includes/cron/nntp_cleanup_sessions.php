<?php
/*======================================================================*\
|| #################################################################### ||
|| # NNTP Gate 1.4                                                    # ||
|| # ---------------------------------------------------------------- # ||
|| # Copyright © 2008 Dmitry Titov, Vitaly Puzrin.                    # ||
|| # All Rights Reserved.                                             # ||
|| # This file may not be redistributed in whole or significant part. # ||
|| #################################################################### ||
\*======================================================================*/

// ######################## SET PHP ENVIRONMENT ###########################
error_reporting(E_ALL & ~E_NOTICE);

if (!is_object($vbulletin->db))
{
  exit;
}

// ########################################################################
// ######################### START MAIN SCRIPT ############################
// ########################################################################


// Expire time, minutes
$expiretime = 5;


/*
 *  Delete expired records from auth cache
 */

$vbulletin->db->query_write("
  DELETE FROM
    `" . TABLE_PREFIX . "nntp_userauth_cache`
  WHERE
    `lastactivity` < DATE_SUB( NOW(), INTERVAL " . intval( $expiretime ) . " MINUTE)
");

log_cron_action('', $nextitem, 1);

?>
