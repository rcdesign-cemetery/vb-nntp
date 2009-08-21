<?php
/*======================================================================*\
|| #################################################################### ||
|| # NNTP Gate 1.3                                                    # ||
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

$db =& $vbulletin->db;

$dayslimit  = $vbulletin->options['nntp_message_in_list_timeout'];
$maxrowsnum = $vbulletin->options['nntp_max_messages_in_group'] - 1;


/*
 *  Delete excess records (depends on group id)
 */

$groups = $db->query_read("
  SELECT
    G.*,
    ( SELECT
        MAX( `messageid` )
      FROM
        `" . TABLE_PREFIX . "nntp_index` AS I
      WHERE
        I.`groupid` = G.`id`
    ) AS 'maxmessageid'
  FROM
    `" . TABLE_PREFIX . "nntp_groups` AS G
");

while( $group = $db->fetch_array( $groups ) )
{
	// check messages count limit in group
	$countlimit = $db->query_first( "
		SELECT
			`messageid`
		FROM
			`" . TABLE_PREFIX . "nntp_index`
		WHERE
			`groupid` = " . $group['id'] . "
		ORDER BY
			`messageid` DESC
		LIMIT
			" . intval( $maxrowsnum ) . ", 1
	");

	$countlimit = intval( $countlimit['messageid'] );

	// check date limit in group
	$datelimit = $db->query_first( "
		SELECT
			`messageid`
		FROM
			`" . TABLE_PREFIX . "nntp_index`
		WHERE
					`groupid`    = " . $group['id']  . "
			AND `messageid` >= " . $minmessageid . "
			AND `datetime`  <  DATE_SUB( NOW(), INTERVAL " . intval( $dayslimit ) . " DAY )
	");

	$datelimit = intval( $datelimit['messageid'] );

	// get maximum limit
	$minmessageid = $datelimit > $countlimit
		? $datelimit
		: $countlimit;

	// check this limit less than maximum message id in group
	$minmessageid = $minmessageid < $group['maxmessageid']
		? $minmessageid
		: $group['maxmessageid'];

	$db->query_write("
		DELETE FROM
			`" . TABLE_PREFIX . "nntp_index`
		WHERE
					`groupid`   = " . intval($group['id'] ) . "
			AND `messageid` < " . intval($minmessageid) . "
	");
}

$db->free_result($groups);


/*
 *  Clean messages cache
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
    OR IndexT.`deleted` = 'yes'
");

//log_cron_action('Messages cache cleaned', $nextitem, 1);


log_cron_action('', $nextitem, 1);

?>
