<?php
/*======================================================================*\
|| #################################################################### ||
|| # NNTP Gate: Plugin Topics 1.5                                     # ||
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


// plugin id
define( NNTP_MESSAGE_TYPE, 'forum' );


require_once(DIR . '/includes/functions_nntp.php');


/*
 *  Check available to user nntp-groups
 * 
 *  @param  array   groups ids list
 *  @param  array   userinfo
 * 
 */

function nntp_gate_Topics_check_groups_list( &$activegroups, &$membergroupids )
{
  global $vbulletin;

  if( empty( $activegroups ) )
  {
    return;
  }

  require_once( DIR . '/includes/functions.php' );
  cache_ordered_forums();

  $forumpermissions = array();

  foreach( array_keys( $vbulletin->forumcache ) AS $forumid )
  {
    if( ! isset( $forumpermissions["$forumid"] ) )
    {
      $forumpermissions["$forumid"] = 0;
    }

    foreach( $membergroupids AS $usergroupid )
    {
      $forumpermissions["$forumid"]
        |= $vbulletin->forumcache["$forumid"]['permissions']["$usergroupid"];
    }
  }

  $forumids = array();

  // Get forums that allow canview access
  foreach( $forumpermissions AS $forumid => $perm )
  {
    if(     ( $perm & $vbulletin->bf_ugp_forumpermissions['canview'] )
        AND ( $perm & $vbulletin->bf_ugp_forumpermissions['canviewthreads'] )
        AND ( $perm & $vbulletin->bf_ugp_forumpermissions['cangetattachment'] ) )
    {
      $forumids[$forumid] = $forumid;
    }
  }

  foreach( $activegroups as $nntpid => &$group )
  {
    if( $group['settings']['plugin'] == NNTP_MESSAGE_TYPE )
    {
      // check only groups handled by this plugin
      if( isset( $forumids[$group['settings']['forum_id']] ) )
      {
        $group['available'] = true;
      }
    }
  }

  return;
}


/*
 *  Get group id by mapped forum id
 * 
 *  @param    forum id
 */

function nntp_gate_Topics_groupid_by_forumid( $forumid )
{
  global $vbulletin;

  $groupid = 0;

  if( intval( $forumid ) > 0 )
  {
    $res = $vbulletin->db->query_first("
      SELECT
        `groupid`
      FROM
        `" . TABLE_PREFIX . "nntp_groups_forums`
      WHERE
        `forumid` =  " . intval( $forumid ) . "
    ");

    if( !empty( $res ) )
    {
      $groupid = $res['groupid'];
    }
  }

  return $groupid;
}


/*
 *  Hook: nntp_gate_group_reindex
 *  Call: /admincp/nntp_groups.php
 * 
 *  Rebuild given group messages index.
 */

function nntp_gate_Topics_group_reindex ( &$group, &$datelimit, &$group_id )
{
  return;
}


/*
 *  Hook: nntp_gate_group_save_settings
 *  Call: /admincp/nntp_groups.php
 * 
 *  Prepare group settings to save.
 */

function nntp_gate_Topics_group_save_settings ( &$settings )
{
  global $vbulletin;

  $vbulletin->input->clean_array_gpc( 'r', array(
    'forum_id' => TYPE_INT,
    'map_id'   => TYPE_INT,
  ) );

  if ($vbulletin->forumcache[$vbulletin->GPC['forum_id']])
  {
    $settings['forum_id'] = $vbulletin->GPC['forum_id'];
    $settings['comment']  = $vbulletin->forumcache[$vbulletin->GPC['forum_id']]['title'];
    $settings['map_id']   = $vbulletin->GPC['map_id'];
  }
}


/*
 *  Hook: nntp_gate_group_save_settings_complete
 *  Call: /admincp/nntp_groups.php
 * 
 *  Save group settings.
 */

function nntp_gate_Topics_group_save_settings_complete ( &$settings )
{
  global $vbulletin, $db;

  $source_forum_id = $settings['forum_id'];
  $target_group_id = $settings['map_id'] ? $settings['map_id'] : $settings['group_id'];

  if( $vbulletin->GPC['is_active'] )
  {
    $db->query_write("
      INSERT INTO
        `" . TABLE_PREFIX . "nntp_groups_forums`
      SET
        `forumid` = " . $db->escape_string( $source_forum_id ) . " ,
        `groupid` = " . $db->escape_string( $target_group_id ) . "
      ON DUPLICATE KEY UPDATE
        `groupid` = " . $db->escape_string( $target_group_id ) . "
    ");
  }
  else
  {
    $db->query_write("
      DELETE FROM
        `" . TABLE_PREFIX . "nntp_groups_forums`
      WHERE
        `forumid` = " . $db->escape_string( $source_forum_id ) . "
    ");
  }
}


/*
 *  Hook: nntp_gate_group_settings
 *  Call: /admincp/nntp_groups.php
 * 
 *  Show group settings.
 */

function nntp_gate_Topics_group_settings ( &$settings )
{
  global $vbulletin, $db, $vbphrase;

  $vbulletin->input->clean_array_gpc( 'r', array(
    'forum_id' => TYPE_INT,
    'map_id'   => TYPE_INT,
  ) );

  $existing_groups = array();
  $existing_groups[0] = $vbphrase['no'];

  // existing groups list
  $groups = $db->query_read("
    SELECT id, plugin_id, group_name, is_active, settings, map_id
    FROM " . TABLE_PREFIX . "nntp_groups
    ORDER BY id
  ");

  while( $group = $db->fetch_array( $groups ) )
  {
    if( $settings['group_id'] != $group['id'] && $group['map_id'] == 0 )
    {
      $existing_groups[$group['id']] = $group['group_name'];
    }
  }

  print_select_row(
    $vbphrase['nntp_map_to_group'],
    'map_id',
    $existing_groups,
    ( !empty( $vbulletin->GPC['map_id'] )
        ? $vbulletin->GPC['map_id']
        : $settings['map_id'] )
  );

  print_forum_chooser(
    $vbphrase['forum'],
    'forum_id',
    ( !empty( $vbulletin->GPC['forum_id'] )
        ? $vbulletin->GPC['forum_id']
        : $settings['forum_id'] ),
    $vbphrase['no_one'],
    false
  );
}


/*
 *  Hook: nntp_gate_possible_groups_list
 *  Call: /admincp/nntp_groups.php
 * 
 *  Show available to add groups list.
 */

function nntp_gate_Topics_possible_groups_list ( &$groups_list )
{
    return array();
  global $vbulletin, $vbphrase, $startdepth, $this_script;

  $used_forums = array();

  foreach ( $groups_list AS $group )
  {
    if( $group['plugin_id'] == 'forum' )
    {
      $used_forums["$group[forum_id]"] = 1;
    }
  }

  $all_forums = array();

  foreach( $vbulletin->forumcache AS $forumid => $forum )
  {
    if( !$forum['link'] ) // it's not a link
    {
      if( !array_key_exists( $forumid, $used_forums ) )
      {
        $all_forums["$forumid"] = construct_depth_mark(
            $forum['depth'], '--', $startdepth
          )
          . ' ' . $forum['title'] . ' '
          . iif(
            !( $forum['options'] & $vbulletin->bf_misc_forumoptions['allowposting'] ),
            " ($vbphrase[forum_is_closed_for_posting])"
          );
      }
    }
  }

  if( !empty( $all_forums ) )
  {
    print_form_header( $this_script, 'group_settings' );
    construct_hidden_code( 'plugin', 'forum' );
    construct_hidden_code( 'forum_id', '' );

    print_table_header( $vbphrase['nntp_forum_possible_groups'], 2 );

    foreach( $all_forums AS $forumid => $forum_title )
    {
      print_cells_row( array(
        '<b>' . $forum_title . '</b>',
        '<input type="submit" value="'
        . $vbphrase['add']
        . '" onclick="this.form.forum_id.value = '
        . $forumid
        . ';" />' . "\n\t"
      ) );
    }

    print_table_footer( 2 );
  }
}


/*
 *  Hook: postdata_postsave
 *  Call: /includes/class_dm_threadpost.php
 * 
 *  Add/update message to index.
 * 
 *  This calls when a new thread started, a new post added or a post updated
 */

function nntp_gate_Topics_postdata_postsave ( &$obj, &$thread )
{
  global $vbulletin, $db, $vbphrase;

  $groupid     = 0;
  $messageid   = 0;
  $inpostdata  = array();
  $postid    	 = $obj->fetch_field( 'postid' );
  $messagetype = NNTP_MESSAGE_TYPE;

  // Find group id by forum id
  $groupid =
    nntp_gate_Topics_groupid_by_forumid( $obj->info['forum']['forumid'] );

  // get groupid considering maped group
  $group   = nntp_get_group_by_id_with_map( $groupid );
  $groupid = $group['id'];

  // Just return unless NNTP-group found
  if( !$groupid )
  {
    return;
  }

  // Check for existing post in nntp index
  $inpostdata = nntp_get_message_index( $messagetype, $postid );

  // If the post allready exists in index then only update old message
  // 
  if( !empty( $inpostdata ) && is_array( $inpostdata ) )
  {
    $messageid = $inpostdata['messageid'];
  }


  /*
   * 	Get thread title prefix
   */

  $prefixid = '';
  $prefix   = '';

  if( is_object( $thread ) )
  {
    $prefixid = $thread->fetch_field( 'prefixid' );
  }
  else
  {
    $th_prefix = $obj->dbobject->query_first("
      SELECT
        `prefixid`
      FROM
        `" . TABLE_PREFIX . "thread`
      WHERE
        `threadid` = " . intval( $obj->fetch_field( 'threadid' ) ) . "
    ");

    if( !empty( $th_prefix ) )
    {
      $prefixid = $th_prefix['prefixid'];
    }

    unset( $th_prefix );
  }

  if( !empty( $prefixid ) )
  {
    $prefixid = 'prefix_' . $prefixid . '_title_plain';
    $prefix   = $vbphrase["$prefixid"] . ' ';
  }


  /*
   *  Insert/update message index
   */

  // get htread title
  $threadtitle = is_object( $thread )
    ? $thread->fetch_field( 'title' )
    : '';

  if( empty( $threadtitle ) AND intval( $obj->fetch_field( 'threadid' ) ) > 0 )
  {
    $tt = $obj->dbobject->query_first("
      SELECT
        `title`
      FROM
        `" . TABLE_PREFIX . "thread`
      WHERE
        `threadid` = " . intval( $obj->fetch_field( 'threadid' ) ) . "
    ");

    if( !empty( $tt ) )
    {
      $threadtitle = $tt['title'];
    }

    unset( $tt );
  }

  $message_info = array(
    'groupid'     => intval( $groupid ),
    'messageid'   => intval( $messageid ),
    'refid'       => intval( $obj->fetch_field( 'threadid' ) ),
    'postid'      => intval( $postid ),
    'messagetype' => NNTP_MESSAGE_TYPE,
    'title'       => $prefix . $threadtitle,
    'datetime'    => TIMENOW,
    'userid'      => intval( $obj->fetch_field( 'userid' ) ),
    'username'    => $obj->fetch_field( 'username' ),
  );

  $messageid = nntp_set_message_index( $message_info );

  if( $messageid > 0 )
  {
    nntp_cache_message_save( $message_info );
  }

  return;
}


/*
 *  Hook: threaddata_delete
 *  Call: /includes/class_dm_threadpost.php
 * 
 *  Delete belonging to a thread messages from index.
 * 
 *  This calls when a thread deleted
 */

function nntp_gate_Topics_threaddata_delete ( &$obj, $threadid )
{
  $postids = array();
  $groupid = 0;
  $forumid = $obj->fetch_field( 'forumid' );

  if( ! intval( $threadid ) )
  {
    return false;
  }

  if( intval( $forumid ) )
  {
    $groupid = nntp_gate_Topics_groupid_by_forumid( $forumid );

    // get groupid considering maped group
    $group   = nntp_get_group_by_id_with_map( $groupid );
    $groupid = $group['id'];
  }

  if( intval( $groupid ) )
  {
    # delete messages by groupid-threadid
    nntp_delete_messages_by_groupid_refid( $groupid, $threadid );
  }
  else
  {
    # find posts ids and delete messages by messagetype-postid
    $posts = $obj->dbobject->query_read("
      SELECT
        `postid`
      FROM
        `" . TABLE_PREFIX . "post`
      WHERE
        `threadid` = " . intval( $threadid ) . "
    ");

    while ($post = $obj->dbobject->fetch_array($posts))
    {
      $postids[] = $post['postid'];
    }

    $messagetype = NNTP_MESSAGE_TYPE;

    nntp_delete_messages_by_messagetype_postid( $messagetype, $postids );
  }
}


/*
 *  Hook: threadfpdata_postsave
 *  Call: /includes/class_dm_threadpost.php
 * 
 *  Save thread data.
 * 
 *  This calls when a thread data (title, first post text, etc.) saves to
 *  database
 */

function nntp_gate_Topics_threadfpdata_postsave ( &$obj )
{
  global $vbphrase;

  $groupid     = 0;
  $messageid   = 0;
  $index       = array();
  $threadid    = intval( $obj->fetch_field( 'threadid'    ) );
  $postid    	 = intval( $obj->fetch_field( 'firstpostid' ) );

  // Find group id by forum id
  if( $obj->info['forum']['forumid'] )
  {
    $groupid =
      nntp_gate_Topics_groupid_by_forumid( $obj->fetch_field( 'forumid' ) );

    // get groupid considering maped group
    $group   = nntp_get_group_by_id_with_map( $groupid );
    $groupid = $group['id'];
  }

  // Check for existing post in nntp index
  $index = nntp_get_message_index( $messagetype, $postid );

  if( !empty( $index ) )
  {
    // is something we carriing about changed?
    //   - target group id

    if(    $obj->info['forum']['forumid']
        && $index['groupid'] != intval( $groupid ) )
    {
      // delete old message due to nntp group change
      $messagetype = NNTP_MESSAGE_TYPE;

      nntp_delete_messages_by_messagetype_postid( $messagetype, $postid );

      unset( $index );
    }
    else
    {
      // only update required
      $messageid = $index['messageid'];
    }
  }

  // Insert/Update message index
  if( $groupid )
  {
    /*
     * 	Get thread title prefix
     */

    $prefixid = $obj->fetch_field( 'prefixid' );
    $prefix   = '';

    if( !empty( $prefixid ) )
    {
      $prefixid = 'prefix_' . $prefixid . '_title_plain';
      $prefix   = $vbphrase["$prefixid"] . ' ';
    }


    $message_info = array(
      'groupid'     => intval( $groupid ),
      'messageid'   => intval( $messageid ),
      'refid'       => intval( $threadid ),
      'postid'      => intval( $postid ),
      'messagetype' => NNTP_MESSAGE_TYPE,
      'title'       => $prefix . $obj->fetch_field( 'title' ),
      'datetime'    => TIMENOW,
      'userid'      => intval( $obj->fetch_field( 'userid', 'post' ) ),
      'username'    => $obj->fetch_field( 'username' ),
    );

    $messageid = nntp_set_message_index( $message_info );

    if( $messageid > 0 )
    {
      nntp_cache_message_save( $message_info );
    }
  }
}


/*
 *  Hook: threadmanage_move_complete
 *  Call: /postings.php
 * 
 *  Move messages index from one group to another.
 * 
 *  This calls when a thread moved to another forum
 */

function nntp_gate_Topics_threadmanage_move_complete ()
{
  global $vbulletin, $db, $foruminfo, $threadinfo, $newthreadinfo;
  global $destforuminfo, $method, $threadid, $postassoc;

  $srcgroupid = 0;
  $dstgroupid = 0;

  // Find source group id by source forum id
  if( intval( $foruminfo['forumid'] ) )
  {
    $res = $db->query_first("
      SELECT
        `groupid`
      FROM
        `" . TABLE_PREFIX . "nntp_groups_forums`
      WHERE
        `forumid` =  " . $foruminfo['forumid'] . "
    ");

    if( !empty( $res ) ) { $srcgroupid = $res['groupid']; }

    unset( $res );
  }

  // Find destination group id by destination forum id
  if( intval( $destforuminfo['forumid'] ) )
  {
    $res = $db->query_first("
      SELECT
        `groupid`
      FROM
        `" . TABLE_PREFIX . "nntp_groups_forums`
      WHERE
        `forumid` =  " . $destforuminfo['forumid'] . "
    ");

    if( !empty( $res ) ) { $dstgroupid = $res['groupid']; }

    unset( $res );
  }

  $threadid = $method == 'copy' ? $newthreadinfo['threadid'] : $threadinfo['threadid'];
  $copy     = $method == 'copy' ? true : false;

  nntp_move_thread( $srcgroupid, $dstgroupid, $threadid, $copy, $postassoc );
}


/*
 *  Hook: postdata_delete
 * 
 *  Delete messages.
 * 
 *  This calls when a post deleted
 */

function nntp_gate_Topics_delete_messages ( $postids )
{
  $messagetype = NNTP_MESSAGE_TYPE;

  nntp_delete_messages_by_messagetype_postid( $messagetype, $postids );
}


/*
 *  Hook: forumdata_delete
 * 
 *  Delete group(s) info when a forum(s) deleted
 * 
 *  This calls when a forum(s) deleted
 * 
 */

function nntp_gate_Topics_delete_forums ( $forumlist )
{
  if( empty( $forumlist ) ) return false;

  $forums = explode( ',', $forumlist );

  foreach( $forums as $forumid )
  {
    $groupid = nntp_gate_Topics_groupid_by_forumid( $forumid );

    if( intval( $groupid ) )
    {
      # if group cannot be deleted (some another group mapped to this one)
      # then just update comment - remove mapped forum name
      if( !nntp_delete_group( $groupid ) )
      {
        $groupinfo = nntp_get_group( $groupid );

        $groupinfo['settings']['comment'] = '';

        nntp_save_group( $groupinfo );
      }
    }
  }

  return true;
}


// #######################################################################
// ############################ Message Body #############################
// #######################################################################

function nntp_message_body ( &$minfo )
{
  global $vbulletin, $db;

  $postid  = $minfo['postid'];
  $message = '';

  if (!intval($postid))
  {
    return $message;
  }

  $post = $db->query_first_slave("
      SELECT
          P.`postid`,
          P.`threadid`,
          P.`parentid`,
          P.`username`,
          P.`userid`,
          T.`title`,
          T.`prefixid`,
          P.`dateline`,
          P.`pagetext`,
          P.`allowsmilie`,
          P.`showsignature`,
          P.`ipaddress`,
          P.`iconid`,
          P.`visible`,
          P.`attach`,
          P.`infraction`,
          P.`reportthreadid`,
          P.`ame_flag`
      FROM
                `" . TABLE_PREFIX . "post`   AS P
      LEFT JOIN `" . TABLE_PREFIX . "thread` AS T ON P.`threadid` = T.`threadid`
      WHERE
        P.`postid` = " . intval($postid) . "
  ");

  if (empty($post))
  {
    return $message;
  }

  $bbattachments = array();
  $vba_thumbs    = array();

  // check for attachments
  if ($post['attach'])
  {
    $post['pagetext'] .= "\r\n\r\n";

    $attachments = $db->query_read_slave("
        SELECT
          `dateline`,
          `thumbnail_dateline`,
          `filename`,
          `filesize`,
          `visible`,
          `attachmentid`,
          `counter`,
          `postid`,
          IF( `thumbnail_filesize` > 0, 1, 0 ) AS 'hasthumbnail',
          `thumbnail_filesize`,
          ATT.`thumbnail` AS 'build_thumbnail',
          ATT.`newwindow`
        FROM
                    `" . TABLE_PREFIX . "attachment`
          LEFT JOIN `" . TABLE_PREFIX . "attachmenttype` AS ATT USING (`extension`)
        WHERE
          `postid` = " . intval($postid) . "
        ORDER BY
          `attachmentid`
      ");

    while ($attachment = $db->fetch_array($attachments))
    {
      if (!$attachment['build_thumbnail'])
      {
        $attachment['hasthumbnail'] = false;
      }

      $bbattachments["$attachment[attachmentid]"] = $attachment;

      $tmpattach = $attachment['attachmentid'];

      if( mb_stripos( $post['pagetext'], $tmpattach ) === false )
      {
        $post['pagetext'] .= '[ATTACH]' . $tmpattach . '[/ATTACH]';
      }
    }
  }

  $bbcode_parser =& new vB_BbCodeParser($vbulletin, fetch_tag_list());

  $bbcode_parser->attachments = $bbattachments;

  $message = $bbcode_parser->parse( $post['pagetext'] );

  if( !empty( $bbattachments )
      && $vbulletin->options['vb_acc_thumb_img_src'] )
  {
    $searchmessage = array();
    $searchthumbs  = array();
    $replace       = array();

    require_once( DIR . '/includes/functions_file.php' );

    foreach( $bbattachments AS $attachid => $attachment )
    {
      // fetch attachment uri
      $attachuri =
        fetch_attachment_path(
          $post['userid'],
          $attachment['attachmentid'],
          true,
          $vbulletin->options['vb_acc_www_path_posts']
        );

      if( $attachuri )
      {
        $searchmessage[] =
            "src=\"{$vbulletin->options['bburl']}/attachment.php?"
          . "{$vbulletin->session->vars['sessionurl']}"
          . "attachmentid=$attachment[attachmentid]"
          . "&amp;thumb=1&amp;d=$attachment[thumbnail_dateline]\"";

        $searchthumbs[]  =
            "src=\"attachment.php?"
          . "{$vbulletin->session->vars['sessionurl']}"
          . "attachmentid=$attachment[attachmentid]"
          . "&amp;stc=1&amp;thumb=1&amp;d=$attachment[thumbnail_dateline]\"";

        $replace[] =
          "src=\"$attachuri?d=$attachment[thumbnail_dateline]\"";
      }
    }

    if( count( $searchmessage ) )
    {
      $message =
        str_replace(
          $searchmessage,
          $replace,
          $message
        );
    }

    if( count( $searchthumbs ) )
    {
      $message =
        str_replace(
          $searchthumbs,
          $replace,
          $message
        );
    }

    unset($vba_thumbs); 
  }

  return $message;
}
