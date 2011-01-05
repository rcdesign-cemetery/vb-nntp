<?php
/*======================================================================*\
|| #################################################################### ||
|| # NNTP Gate 1.3                                                    # ||
|| # ---------------------------------------------------------------- # ||
|| # Copyright � 2008 Dmitry Titov, Vitaly Puzrin.                    # ||
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

$db =& $vbulletin->db;

$min_date  = TIMENOW - (int)$vbulletin->options['nntp_message_in_list_timeout']*24*60*60;
$limit = (int)$vbulletin->options['nntp_max_messages_in_group'];


/*
 *  Delete excess records (depends on group id)
 */

$groups = $db->query_read("
  SELECT
    G.id
  FROM
    `" . TABLE_PREFIX . "nntp_groups` AS G
");

// Note: after cleaning, each group must have at least one record
while( $group = $db->fetch_array( $groups ) )
{
  $group_id = (int)$group['id'];

  // Select min message id to clear below
  // Note: that message range calculated with ORDER and LIMIT
  $sql = "SELECT
            IFNULL( MIN(`messageid`), 0) as min_id
          FROM
            `" . TABLE_PREFIX . "nntp_index`
          WHERE
            `groupid`    = " . $group_id  . " AND
            `deleted` = 'no' AND 
            `datetime`  > FROM_UNIXTIME(" . $min_date . ")
          ORDER by
            `messageid` DESC
          LIMIT
          " . ($limit);
  $messages_stat = $db->query_first($sql); 

  $min_id = (int)$messages_stat['min_id'];

  if ($min_id  > 0)
  {
    $sql = "DELETE FROM
              `" . TABLE_PREFIX . "nntp_index`
            WHERE
              `groupid`   = " . $group_id . " AND 
              `messageid` < " . $min_id;
    $db->query_write($sql);
  }
}
$db->free_result($groups);


/**
 * Clean stat
 */
$stats_days = (int)$vbulletin->options['nntp_stats_show_last_days'];
$sql = "DELETE FROM
          `" . TABLE_PREFIX . "nntp_stats`
        WHERE
        `date` < FROM_UNIXTIME(" . (TIMENOW - $stats_days*24*60*60) . ")";
$db->query_write($sql);


/*
 *  Clean messages cache
 *  We not forgot about records marked as "deleted"(this is part of optimization)
 */

$db->query_write("
  DELETE
    CacheT
  FROM
              `" . TABLE_PREFIX . "nntp_cache_messages` AS CacheT
    LEFT JOIN `" . TABLE_PREFIX . "nntp_index`          AS IndexT
      ON(
            CacheT.`groupid`   = IndexT.`groupid`
        AND CacheT.`messageid` = IndexT.`messageid`
      )
  WHERE
    IndexT.`messageid` IS NULL
");


/*
 *  Optimize tables
 */

$db->query_write("
  OPTIMIZE TABLE
    `" . TABLE_PREFIX . "nntp_cache_messages`,
    `" . TABLE_PREFIX . "nntp_index`  
");


//log_cron_action('Messages cache cleaned', $nextitem, 1);


log_cron_action('', $nextitem, 1);

?>
