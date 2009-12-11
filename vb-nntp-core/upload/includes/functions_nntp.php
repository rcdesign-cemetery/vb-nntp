<?php
/*======================================================================*\
|| #################################################################### ||
|| # NNTP Gate: Functions 1.4                                         # ||
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


// ######################### REQUIRE BACK-END ############################
require_once( DIR . '/includes/functions.php' );
require_once( DIR . '/includes/class_bbcode.php' );


/*
 *  Insert/update groupaccess_cache item based on user's groups list
 *
 *  Input parameters:
 *    usergroupslist - (text) user's groups list, first element - main group
 *
 */

function nntp_update_groupaccess_cache_item ( $usergroupslist = '' )
{
  global $vbulletin;

  $membergroupids = explode( ',', $usergroupslist );
  $usergroupid    = array_shift( $membergroupids );

  $user = array(
    'usergroupid'    => $usergroupid,
    'membergroupids' => implode( ',', $membergroupids )
  );

  $membergroupids = fetch_membergroupids_array( $user );

  if( sizeof( $membergroupids ) == 1
      OR !( $vbulletin->usergroupcache["$usergroupid"]['genericoptions']
            & $vbulletin->bf_ugp_genericoptions['allowmembergroups']     ) )
  {
    // if primary usergroup doesn't allow member groups then get rid of them!
    $membergroupids = array( $usergroupid );
  }


    $activegroups = array();
    $nntp_gate_handlers = array();
    /**
     * Пример:
     *
     * $nntp_group = new NNTPGate_Forum_Group(); // нужный потомок NNTPGate_Group_Base
     * $groups = $nntp_group->get_avaliable_group_list($membergroupids);
     * $activegroups = $activegroups + $groups;
     * unset($nntp_group);
     */
    ($hook = vBulletinHook::fetch_hook('nntp_gate_backend_check_groups_list')) ? eval($hook) : false;

    foreach( $activegroups as $nntpid => $group )
    {
        if( $group['available'] == true )
        {
            $availablegroups[] = $group['group_id'];
        }
    }

  $nntpgroupslist = implode( ',', $availablegroups );

////////////
  $access_level   = nntp_get_access_level( $usergroupid, $membergroupids );
  $template       = nntp_get_eval( fetch_template( 'nntp_message_template' ) );
  $css            = nntp_get_eval( fetch_template( 'nntp_message_css'      ) );
  $menu           = nntp_get_eval( fetch_template( 'nntp_message_menu'     ) );
  $demotext       = nntp_get_demo();


  // update/insert data into db cache
  $vbulletin->db->query_write("
    REPLACE INTO
      `" . TABLE_PREFIX . "nntp_groupaccess_cache`
    SET
      `usergroupslist` = '" . $vbulletin->db->escape_string( $usergroupslist ) . "',
      `nntpgroupslist` = '" . $vbulletin->db->escape_string( $nntpgroupslist ) . "',
      `access_level`   = '" . $vbulletin->db->escape_string( $access_level   ) . "',
      `template`       = '" . $vbulletin->db->escape_string( $template       ) . "',
      `css`            = '" . $vbulletin->db->escape_string( $css            ) . "',
      `menu`           = '" . $vbulletin->db->escape_string( $menu           ) . "',
      `demotext`       = '" . $vbulletin->db->escape_string( $demotext       ) . "'
  ");
}


/*
 *  Returns evaled text
 */

function nntp_get_eval ( $text = '' )
{
  global $vbulletin, $db, $globaltemplates, $vbphrase;

  $str = '';

  eval('$str = "' . $text . '";');

  return $str;
}

/*
 *  Demo message
 */

function nntp_get_demo ()
{
  global $vbulletin;

  $demomessage = $vbulletin->options['nntp_demo_text'];

  return $demomessage;
}


/*
 *  Get access level (full/demo/none) for user's groupslist
 */

function nntp_get_access_level ( $usergroupid, $membergroupids = array() )
{
  global $vbulletin;

  $userinfo = array(
    'userid'         => 0,
    'usergroupid'    => $usergroupid,
    'membergroupids' => implode( ',', $membergroupids )
  );

  // default value
  $access_level = 'none';

  // check group permissions
  $fullaccessgroups = unserialize( $vbulletin->options['nntp_groups']      );
  $demoaccessgroups = unserialize( $vbulletin->options['nntp_demo_groups'] );

  $full_access = is_member_of( $userinfo, $fullaccessgroups, false );
  $demo_access = is_member_of( $userinfo, $demoaccessgroups, false );

  $access_level = $demo_access === true ? 'demo' : $access_level;
  $access_level = $full_access === true ? 'full' : $access_level;

  return $access_level;
}
