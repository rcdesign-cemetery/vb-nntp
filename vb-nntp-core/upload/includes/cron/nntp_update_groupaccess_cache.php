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

require_once( DIR . '/includes/functions_nntp.php' );

// ########################################################################
// ######################### START MAIN SCRIPT ############################
// ########################################################################


$cache = $vbulletin->db->query_read("
  SELECT
    *
  FROM
    `" . TABLE_PREFIX . "nntp_groupaccess_cache`
");

while( $item = $vbulletin->db->fetch_array( $cache ) )
{
  nntp_update_groupaccess_cache_item( $item['usergroupslist'] );
}

log_cron_action( '', $nextitem, 1 );


?>
