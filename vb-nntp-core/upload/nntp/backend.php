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

// #################### CHANGE WORKING DIRECTORY #########################
chdir('../');

// ####################### SET PHP ENVIRONMENT ###########################
error_reporting(E_ALL & ~E_NOTICE);

// #################### DEFINE IMPORTANT CONSTANTS #######################
define( 'EOL', "\r\n" );

// ################### PRE-CACHE TEMPLATES AND DATA ######################
// get special phrase groups
$phrasegroups = array(
  'posting',
  'global',
  'prefix',
);

// ######################### REQUIRE BACK-END ############################
require_once( './global.php' );
require_once( DIR . '/includes/functions.php' );
require_once( DIR . '/includes/functions_login.php' );
require_once( DIR . '/includes/class_bbcode.php' );
require_once( DIR . '/includes/functions_nntp.php' );

// ############################### INIT ##################################
$auth_ok     = false;
$full_access = false;

// #######################################################################
// ######################## START MAIN SCRIPT ############################
// #######################################################################

$vbulletin->input->clean_array_gpc( 'r', array(
  'do'      => TYPE_STR,
  'auth_ok' => TYPE_STR,
  'access'  => TYPE_STR,
));

// ############################### auth frontend #########################

if( !empty( $_REQUEST['nntp_auth_key'] ) )
{
  $vbulletin->input->clean_gpc( 'r', 'nntp_auth_key', TYPE_STR );

  if( $vbulletin->GPC['nntp_auth_key']
        == $vbulletin->options['nntp_gate_auth_key'] )
  {
    $auth_ok = true;
  }
}

if( !$auth_ok || empty( $_REQUEST['do'] ) )
{
  exec_header_redirect( '/' );
}

// ############################### check user auth #######################
$auth_ok     = $vbulletin->GPC['auth_ok'] == 'yes'  ? true : false;
$full_access = $vbulletin->GPC['access']  == 'full' ? true : false;


if( $_REQUEST['do'] == 'checkauth' )
{
  $vbulletin->input->clean_array_gpc( 'r', array(
    'nntp_username' => TYPE_STR,
    'nntp_password' => TYPE_STR,
  ) );

  if( ! verify_authentication(
          $vbulletin->GPC['nntp_username'], $vbulletin->GPC['nntp_password'],
          '', '', 0, false ))
  {
    // check for custom password
    $custom_auth = $vbulletin->db->query_first("
      SELECT
        COUNT( * ) AS 'count'
      FROM
        `" . TABLE_PREFIX . "nntp_user_settings`
      WHERE
            `userid`            =  " . intval( $vbulletin->userinfo['userid'] ) . "
        AND `nntp_password`     = '" . md5( $vbulletin->GPC['nntp_password'] )  . "'
        AND `use_nntp_password` = 'yes'
    ");

    if( !empty( $custom_auth ) && $custom_auth['count'] > 0 )
    {
      $auth_ok = true;
    }
    else
    {
      $auth_ok = false;
    }
  }
  else
  {
    $auth_ok = true;
  }

  if( !$auth_ok )
  {
    print_simple_serialized( array(
      'auth'       => 'failed',
      'access'     => 'none',
      'userid'     => 0,
      'groupslist' => '',
    ) );
  }
  else
  {
    $vbulletin->input->clean_array_gpc( 'r', array(
      'nntp_userid' => TYPE_INT,
    ) );

    $userid = $vbulletin->userinfo['userid'] > 0
      ? $vbulletin->userinfo['userid']
      : $vbulletin->GPC['nntp_userid'];

    // Fetch user info unless it's allready here
    if( !is_array( $vbulletin->userinfo ) )
    {
      $vbulletin->userinfo = fetch_userinfo( $userid );
    }

    // check group permissions
    $fullaccessgroups = unserialize( $vbulletin->options['nntp_groups'] );

    foreach( $fullaccessgroups as $groupid )
    {
      if( is_member_of( $vbulletin->userinfo, $groupid ) )
      {
        $full_access = true;
        break;
      }
    }

    // get available to user nntp-groups list
    $groupslist = get_available_groups_list( $vbulletin->userinfo['userid'] );

    // message template
    $tmpl = get_msgtemplate();

    // css
    $css  = get_css();

    // menu
    $menu = get_menu();

    // demo message if user have demo access only
    $demo = $full_access == true ? '' : get_demo();

    print_simple_serialized( array(
      'auth'       => 'success',
      'access'     => $full_access ? 'full' : 'demo',
      'userid'     => $vbulletin->userinfo['userid'],
      'groupslist' => $groupslist,
      'msgtmpl'    => $tmpl,
      'css'        => $css,
      'menu'       => $menu,
      'demotext'   => $demo,
    ) );
  }
}


if( $auth_ok )
{
  // ############################### save stats ##########################
  if( $vbulletin->userinfo['userid'] > 0 )
  {
    $vbulletin->db->query_write("
      INSERT IGNORE INTO
        `" . TABLE_PREFIX . "nntp_stats`
      SET
        `userid` = ". intval( $vbulletin->userinfo['userid'] ) . ",
        `date`   = NOW()
    ");
  }

  // ############################# handle request ########################
  switch( $_REQUEST['do'] )
  {
    case 'msgtemplate':
      msgtemplate();
      break;
    case 'menu':
      menu();
      break;
  }
}


/*
 *  Echo simple-serialized array just like "key: value"
 */

function print_simple_serialized ( $array )
{
  foreach( $array as $key => $value )
  {
    echo $key . ": " . $value . EOL;
  }

  return;
}


/*
 *  Returns available to user groups list
 */

function get_available_groups_list ( $userid )
{
  global $vbulletin, $db;

  $activegroups    = array();
  $availablegroups = array();

  $activegroupslist = $vbulletin->db->query_read("
    SELECT
      *
    FROM
      `" . TABLE_PREFIX . "nntp_groups`
    WHERE
      `is_active` = 'yes' AND
      `map_id`    = 0
    ORDER BY
      `group_name`
  ");

  $i = 0;

  while( $group = $vbulletin->db->fetch_array( $activegroupslist ) )
  {
    $group['settings'] = unserialize( $group['settings'] );

    // by default the group is not available
    // plugins should check and turn on groups available to user
    $group['available'] = false;

    $activegroups[$i] = $group;

    $i++;
  }

  ($hook = vBulletinHook::fetch_hook('nntp_gate_backend_check_groups_list')) ? eval($hook) : false;

  foreach( $activegroups as $nntpid => &$group )
  {
    if( $group['available'] == true )
    {
      $availablegroups[] = $group['id'];
    }
  }

  $availablegroupslist = implode( ',', $availablegroups );

  return $availablegroupslist;
}


/*
 *  CSS
 */

function get_css ()
{
  global $vbulletin, $db, $globaltemplates;

  return nntp_get_base64_eval( fetch_template( 'nntp_message_css' ) );
}


/*
 *  Message template
 */

function get_msgtemplate ()
{
  global $vbulletin, $db, $globaltemplates;

  $vbulletin->input->clean_array_gpc('r', array(
    'groupid' => TYPE_INT,
  ));

  $msgtemplate = fetch_template( 'nntp_message_template' );

  if( $vbulletin->GPC['groupid'] > 0 )
  {
    $group = nntp_get_group( $vbulletin->GPC['groupid'] );

    ($hook = vBulletinHook::fetch_hook('nntp_gate_backend_get_message_template')) ? eval($hook) : false;
  }

  return nntp_get_base64_eval( $msgtemplate );
}

function msgtemplate ()
{
  echo get_msgtemplate();
}


/*
 *  Menu
 */

function get_menu ()
{
  global $vbulletin, $db, $globaltemplates, $vbphrase;

  $vbulletin->input->clean_array_gpc('r', array(
    'nntp_username' => TYPE_STR,
    'groupid'       => TYPE_INT,
  ));

  $menu = fetch_template('nntp_message_menu');;

  if( $vbulletin->GPC['groupid'] > 0 )
  {
    $group = nntp_get_group( $vbulletin->GPC['groupid'] );

    ($hook = vBulletinHook::fetch_hook('nntp_gate_backend_user_menu')) ? eval($hook) : false;
  }

  return nntp_get_base64_eval( $menu );
}

function menu ()
{
  echo get_menu();
}


/*
 *  Demo message
 */

function get_demo ()
{
  global $vbulletin;

  $bbcode_parser = new vB_BbCodeParser( $vbulletin, fetch_tag_list() );

  $demomessage = nntp_get_base64_eval(
      $bbcode_parser->parse( $vbulletin->options['nntp_demo_text'] )
    );

  return $demomessage;
}

?>
