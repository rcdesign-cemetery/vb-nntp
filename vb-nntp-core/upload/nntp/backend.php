<?php
/*======================================================================*\
|| #################################################################### ||
|| # NNTP Gate 1.4                                                    # ||
|| # ---------------------------------------------------------------- # ||
|| # Copyright © 2009 Dmitry Titov, Vitaly Puzrin.                    # ||
|| # All Rights Reserved.                                             # ||
|| # This file may not be redistributed in whole or significant part. # ||
|| #################################################################### ||
\*======================================================================*/

// #################### CHANGE WORKING DIRECTORY #########################
chdir('../');

// ####################### SET PHP ENVIRONMENT ###########################
error_reporting(E_ALL & ~E_NOTICE);

// #################### DEFINE IMPORTANT CONSTANTS #######################
define('NNTP_BACKEND', 1);

// ################### PRE-CACHE TEMPLATES AND DATA ######################
// get special phrase groups
$phrasegroups = array(
  'posting',
  'global',
  'prefix',
);

// ######################### REQUIRE BACK-END ############################
require_once( './global.php' );
require_once( DIR . '/includes/functions_nntp.php' );

// #######################################################################
// ######################## START MAIN SCRIPT ############################
// #######################################################################

$vbulletin->input->clean_array_gpc( 'r', array(
  'do'         => TYPE_STR,
  'sessionkey' => TYPE_STR,
));


if( $_REQUEST['do'] == 'cachegroupaccess' && $vbulletin->GPC['sessionkey'] )
{
  // get user groups list by sessionkey
  $session = $vbulletin->db->query_first("
    SELECT
      *
    FROM
      `" . TABLE_PREFIX . "nntp_userauth_cache`
    WHERE
      `sessionkey` = '" . $vbulletin->db->escape_string( $vbulletin->GPC['sessionkey'] ) . "'
  ");

  if( is_array( $session ) )
    nntp_update_groupaccess_cache_item( $session['usergroupslist'] );

  echo "Ok";
}


?>
