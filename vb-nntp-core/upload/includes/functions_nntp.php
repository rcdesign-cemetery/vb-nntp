<?php
/*======================================================================*\
|| #################################################################### ||
|| # NNTP Gate: Functions 1.3                                         # ||
|| # ---------------------------------------------------------------- # ||
|| # Copyright © 2009 Dmitry Titov, Vitaly Puzrin.                    # ||
|| # All Rights Reserved.                                             # ||
|| # This file may not be redistributed in whole or significant part. # ||
|| #################################################################### ||
\*======================================================================*/


if (!isset($GLOBALS['vbulletin']->db))
{
  exit;
}


function nntp_get_base64_eval ( $text = '' )
{
  global $vbulletin, $db, $globaltemplates, $vbphrase;

  $str = '';

  eval('$str = base64_encode("' . $text . '");');

  return $str;
}


function nntp_get_group ( $group_id = 0, $group_name = '' )
{
  global $vbulletin;

  $db =& $vbulletin->db;

  $group = !empty( $group_id )
    ? $db->query_first("
        SELECT
          *
        FROM
          `" . TABLE_PREFIX . "nntp_groups`
        WHERE
          `id` = " . intval( $group_id   ) . "
      ")
    : $db->query_first("
        SELECT
          *
        FROM
          `" . TABLE_PREFIX . "nntp_groups`
        WHERE
          `group_name` = '" . $db->escape_string( $group_name ) . "'
      ");

  if( is_array( $group ) )
  {
    $settings = unserialize( $group['settings'] );
    $settings['group_id'] = $group['id'];

    $group['settings'] = $settings;
  }

  return $group;
}


function nntp_get_group_by_id_with_map ( $group_id )
{
  $group = array();

  if( intval( $group_id ) )
  {
    while( $group_id )
    {
      $group = nntp_get_group( $group_id );

      #
      #   Check if group is active
      #

      if( $group['is_active'] == 'yes' )
      {
        $group_id = $group['map_id'];
      }
      else
      {
        $group    = array();
        $group_id = 0;
      }
    }
  }

  return $group;
}


function nntp_save_group ( $groupinfo )
{
  global $vbulletin;

  if( empty( $groupinfo ) || !is_array( $groupinfo ) ) return false;

  $db =& $vbulletin->db;

  $settings =& $groupinfo['settings'];
  $settings_str = serialize( $settings );

	$sql = "
INSERT INTO
  `" . TABLE_PREFIX . "nntp_groups`
SET
  `id`          =  " . intval( $settings['group_id']                              ) . " ,
  `plugin_id`   = '" . $db->escape_string( $settings['plugin']                    ) . "',
  `group_name`  = '" . $db->escape_string( $settings['group_name']                ) . "',
  `is_active`   = '" . $db->escape_string( $settings['is_active']  ? 'yes' : 'no' ) . "',
  `settings`    = '" . $db->escape_string( $settings_str                          ) . "',
  `map_id`      =  " . intval( $settings['map_id']                                ) . "
ON DUPLICATE KEY UPDATE
  `group_name`  = '" . $db->escape_string( $settings['group_name']                ) . "',
  `is_active`   = '" . $db->escape_string( $settings['is_active']  ? 'yes' : 'no' ) . "',
  `settings`    = '" . $db->escape_string( $settings_str                          ) . "',
  `map_id`      =  " . intval( $settings['map_id']                                ) . "
";

	$db->query_write( $sql );

  return true;
}


function nntp_delete_group ( $groupid )
{
  global $vbulletin;

  $db =& $vbulletin->db;

	// check for there is no groups mapped to this one
	if( check_for_mapped_groups( $groupid ) ) return false;

	($hook = vBulletinHook::fetch_hook('nntp_gate_group_delete_start')) ? eval($hook) : false;

	$db->query_write("
    DELETE FROM
      `" . TABLE_PREFIX . "nntp_groups`
    WHERE
      `id` = " . intval( $groupid )
  );

	$db->query_write("
    DELETE FROM
      `" . TABLE_PREFIX . "nntp_index`
    WHERE
      `groupid` = " . intval( $groupid )
  );

	($hook = vBulletinHook::fetch_hook('nntp_gate_group_delete_complete')) ? eval($hook) : false;

  return true;
}


function check_for_mapped_groups ( $group_id )
{
  global $vbulletin;

  $db =& $vbulletin->db;

	if( !empty( $group_id ) )
	{
		$res = $db->query_first("
      SELECT
        COUNT( * ) AS 'count'
      FROM
        `" . TABLE_PREFIX . "nntp_groups`
      WHERE
        `map_id` = " . intval( $group_id )
    );

		if( !empty( $res ) && $res['count'] > 0 ) return true;
	}

	return false;
}


function nntp_cache_message_save ( &$minfo )
{
  global $vbulletin, $vbphrase;

	$db =& $vbulletin->db;

  if( empty( $minfo ) OR empty( $minfo['groupid'] ) ) { return false; }

  // get destination nntp-group info
  $group =& nntp_get_group( $minfo['groupid'] );

  if( empty( $group ) ) { return false; }

  /*
   *  Collect message info
   */

  $message = array();

  $groupid   = $minfo['groupid'];
  $messageid = $minfo['messageid'];
  $body      = nntp_message_body( $minfo );

  /*
   *  Save message info to cache
   */

  $db->query_write("
    INSERT INTO
      `" . TABLE_PREFIX . "nntp_cache_messages`
    SET
      `groupid`   =  " . intval( $groupid   ) . ",
      `messageid` =  " . intval( $messageid ) . ",
      `body`      = '" . $db->escape_string( $body ) . "'
    ON DUPLICATE KEY UPDATE
      `body`      = '" . $db->escape_string( $body ) . "'
  ");

  return true;
}


// #######################################################################
// ############################ Delete messages ##########################
// #######################################################################

/**
 *
 *  Remove messages by message type and post id[s].
 *
 *  Input values:
 *    message type
 *    postid - could be a scalar value or an array.
 *
 */

function nntp_delete_messages_by_messagetype_postid ( $messagetype, $postids )
{
  global $vbulletin;

  if( empty( $messagetype ) || empty( $postids ) )
  {
    return false;
  }

  $db =& $vbulletin->db;

  $where = array();

  if( !is_array( $postids ) && !empty( $postids ) )
  {
    $postids = array( $postids );
  }

  $where[] = "`messagetype` = '" . $db->escape_string( $messagetype ) . "'";

  foreach( $postids as &$postid )
  {
    $postid = intval( $postid );
  }

  $where[] = "`postid` IN( '" . implode( "', '", $postids ) . "' )";

  if( !empty( $where ) )
  {
    // mark messages in index as deleted
    $db->query_write("
      UPDATE
        `" . TABLE_PREFIX . "nntp_index`
      SET
        `deleted` = 'yes'
      WHERE
        " . implode( " AND ", $where ) . "
    ");
  }

  return true;
}


/**
 *
 *  Remove messages by groupid and refid.
 *
 *  Input values:
 *    groupid
 *    refid
 *
 */

function nntp_delete_messages_by_groupid_refid ( $groupid = 0, $refid = 0 )
{
  global $vbulletin;

  if( ! $groupid || ! $refid )
  {
    return false;
  }

  $db =& $vbulletin->db;

  $where  = "1";
  $where .= " AND `groupid` = " . intval( $groupid );
  $where .= " AND `refid`   = " . intval( $refid );

  // mark messages in index as deleted
  $db->query_write("
    UPDATE
      `" . TABLE_PREFIX . "nntp_index`
    SET
      `deleted` = 'yes'
    WHERE
      " . $where . "
  ");

  return true;
}


function nntp_get_message_index ( $messagetype, $postid )
{
  global $vbulletin;

  $db =& $vbulletin->db;

  $index = $db->query_first("
    SELECT
      *
    FROM
      `" . TABLE_PREFIX . "nntp_index`
    WHERE
          `messagetype` = '" . $db->escape_string( $messagetype ) . "'
      AND `postid`      =  " . intval( $postid ) . "
      AND `deleted`   = 'no'
    LIMIT
      1
  ");

  if( empty( $index ) )
  {
    $index = null;
  }

  return $index;
}


function nntp_set_message_index ( &$info = array() )
{
  global $vbulletin;

  $db =& $vbulletin->db;

  $db->query_write("
    INSERT INTO
      `" . TABLE_PREFIX . "nntp_index`
    SET
      `groupid`    	=  " . intval( $info['groupid']   ) . ",
      `messageid`  	=  " . intval( $info['messageid'] ) . ",
      `refid`      	=  " . intval( $info['refid']     ) . ",
      `userid`      =  " . intval( $info['userid']    ) . ",
      `postid`      =  " . intval( $info['postid']    ) . ",
			`messagetype` = '" . $db->escape_string( $info['messagetype'] ) . "',
      `title`       = '" . $db->escape_string( $info['title'] ) . "',
      `datetime`    = FROM_UNIXTIME( " . intval( $info['datetime'] ) . " ),
      `deleted`     = 'no'
    ON DUPLICATE KEY UPDATE
      `refid`       =  " . intval( $info['refid']     ) . ",
      `userid`      =  " . intval( $info['userid']    ) . ",
      `postid`      =  " . intval( $info['postid']    ) . ",
			`messagetype` = '" . $db->escape_string( $info['messagetype'] ) . "',
      `title`       = '" . $db->escape_string( $info['title'] ) . "',
      `datetime`    = FROM_UNIXTIME( " . intval( $info['datetime'] ) . " ),
      `deleted`     = 'no'
  ");

  if( !intval( $info['messageid'] ) )
  {
    $info['messageid'] = $db->insert_id();
  }

  return $info['messageid'];
}


function nntp_move_thread ( $srcgroupid, $dstgroupid, $refid, $copy = false, $postassoc )
{
  global $vbulletin;

  $db =& $vbulletin->db;

  if( $dstgroupid && $srcgroupid != $dstgroupid )
  {
    // Copy posts and index data to new destination group
    $posts = $db->query_read("
      SELECT
        `messageid`,
				`postid`
      FROM
        `" . TABLE_PREFIX . "nntp_index`
      WHERE
            `groupid` = " . intval( $srcgroupid ) . "
        AND `refid`   = " . intval( $refid      ) . "
      ORDER BY
        `messageid` ASC
    ");

		// Attention! Posts ids are new when thread is copiing instead of moving
		// ($copy == true)
		// $postassoc["$oldpostid"] = $newpostid;

    while( $post = $db->fetch_array( $posts ) )
    {
			$postid = $post["postid"];

			if( $copy )
			{
				// find new post id
				$postid = $postassoc["$postid"];
			}

      // this check is only required for copy method to check if message
      // allready exists on the forum, do not copy hard-deleted messages
			if( intval( $postid ) > 0 )
			{
				$db->query_write("
					INSERT INTO
						`" . TABLE_PREFIX . "nntp_index`
						( `groupid`		 ,
							`refid`			 ,
							`title`			 ,
							`datetime`   ,
							`userid`		 ,
							`deleted`    ,
							`messagetype`,
							`postid` )
					SELECT
						" . intval( $dstgroupid ) . ",
						`refid`      ,
						`title`      ,
						`datetime`   ,
						`userid`     ,
						`deleted`		 ,
						`messagetype`,
						" . intval( $postid ) . "
					FROM
						`" . TABLE_PREFIX . "nntp_index`
					WHERE
								`groupid`   = " . intval( $srcgroupid        ) . "
						AND `messageid` = " . intval( $post['messageid'] ) . "
				");

				$newmessageid = $db->insert_id();

				if( $newmessageid > 0 )
				{
					$db->query_write("
						INSERT INTO
							`" . TABLE_PREFIX . "nntp_cache_messages`
							( `groupid`		 ,
								`messageid`	 ,
								`body` )
						SELECT
							" . intval( $dstgroupid   ) . ",
							" . intval( $newmessageid ) . ",
							`body`
						FROM
							`" . TABLE_PREFIX . "nntp_cache_messages`
						WHERE
									`groupid`   = " . intval( $srcgroupid        ) . "
							AND `messageid` = " . intval( $post['messageid'] ) . "
					");
				}
			}
    }

		if( !$copy )
		{
			# mark messages as deleted in source group
			$db->query_write("
				UPDATE
					`" . TABLE_PREFIX . "nntp_index`
				SET
					`deleted` = 'yes'
				WHERE
							`groupid` = " . intval( $srcgroupid ) . "
					AND `refid`   = " . intval( $refid      ) . "
			");
		}
  }
}
