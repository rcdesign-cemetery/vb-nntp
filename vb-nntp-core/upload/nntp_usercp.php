<?php
/*======================================================================*\
|| #################################################################### ||
|| # NNTP Gate 1.0                                                    # ||
|| # ---------------------------------------------------------------- # ||
|| # Copyright © 2008 Dmitry Titov, Vitaly Puzrin.                    # ||
|| # All Rights Reserved.                                             # ||
|| # This file may not be redistributed in whole or significant part. # ||
|| #################################################################### ||
\*======================================================================*/

// ####################### SET PHP ENVIRONMENT ###########################
error_reporting(E_ALL & ~E_NOTICE);

// #################### DEFINE IMPORTANT CONSTANTS #######################
define('THIS_SCRIPT', 'nntp_usercp');

// ################### PRE-CACHE TEMPLATES AND DATA ######################
// get special phrase groups
$phrasegroups = array('user', 'timezone', 'posting', 'cprofilefield', 'cppermission');

// pre-cache templates used by all actions
$globaltemplates = array(
	'USERCP_SHELL',
	'usercp_nav_folderbit'
);

// pre-cache templates used by specific actions
$actiontemplates = array(
	'editpassword' => array(
		'nntp_usercp'
	),
);

$actiontemplates['none'] =& $actiontemplates['editpassword'];

// ######################### REQUIRE BACK-END ############################
require_once('./global.php');
require_once(DIR . '/includes/functions_user.php');
require_once(DIR . '/includes/class_bbcode.php');

// #######################################################################
// ######################## START MAIN SCRIPT ############################
// #######################################################################


if (empty($_REQUEST['do']))
{
	$_REQUEST['do'] = 'editpassword';
}

if (!($permissions['forumpermissions'] & $vbulletin->bf_ugp_forumpermissions['canview']))
{
	print_no_permission();
}

if (empty($vbulletin->userinfo['userid']))
{
	print_no_permission();
}

// Check that the viewer can access the NNTP gate in full mode

$nntp_full_access = false;
$fullaccessgroups = unserialize( $vbulletin->options['nntp_groups'] );

foreach($fullaccessgroups as $groupid)
{
  if (is_member_of($vbulletin->userinfo, $groupid))
  {
    $nntp_full_access = true;
    break;
  }
}

// Check that the viewer can access the NNTP gate in demo mode

$nntp_demo_access  = false;
$demoaccessgroups = unserialize( $vbulletin->options['nntp_demo_groups'] );

foreach($demoaccessgroups as $groupid)
{
  if (is_member_of($vbulletin->userinfo, $groupid))
  {
    $nntp_demo_access = true;
    break;
  }
} 

if (!$nntp_full_access and !$nntp_demo_access)
{
	print_no_permission();
} 

// set shell template name
$shelltemplatename = 'USERCP_SHELL';
$templatename = '';

// initialise onload event
$onload = '';

// start the navbar
$navbits = array('usercp.php' . $vbulletin->session->vars['sessionurl_q'] => $vbphrase['user_control_panel']);

($hook = vBulletinHook::fetch_hook('nntp_gate_profile_start')) ? eval($hook) : false;

// ############################################################################
// ############################### EDIT PASSWORD ##############################
// ############################################################################

if (empty($_REQUEST['do']) || $_REQUEST['do'] == 'editpassword')
{
	($hook = vBulletinHook::fetch_hook('nntp_gate_editpassword_start')) ? eval($hook) : false;

	// draw cp nav bar
	construct_usercp_nav('nntp_gate');

  $nntp_use_cpass = '';

  // get current flag's value
	$sql = "
SELECT
  `use_nntp_password`
FROM
  `" . TABLE_PREFIX . "nntp_user_settings`
WHERE
  `userid` =  " . $db->escape_string( $vbulletin->userinfo['userid'] );

	$res = $db->query_first( $sql );

  if(!empty($res) && $res['use_nntp_password'] == 'yes')
  {
    $nntp_use_cpass = 'checked="checked"';
  }

	$navbits[''] = $vbphrase['nntp_gate_menu_title'];

	// draw cp nav bar
	$action = 'doremovelist';
	$userid = $userinfo['userid'];
	$url =& $vbulletin->url;
	$templatename = 'nntp_usercp';
}

// ############################### start update password ###############################
if ($_POST['do'] == 'updatepassword')
{
	$vbulletin->input->clean_array_gpc('p', array(
		'currentpassword'        => TYPE_STR,
		'currentpassword_md5'    => TYPE_STR,
		'newpassword'            => TYPE_STR,
		'newpasswordconfirm'     => TYPE_STR,
		'newpassword_md5'        => TYPE_STR,
		'newpasswordconfirm_md5' => TYPE_STR,
		'nntp_use_cpass'         => TYPE_INT,
	));

	// instanciate the data manager class
	$userdata =& datamanager_init('user', $vbulletin, ERRTYPE_STANDARD);
	$userdata->set_existing($vbulletin->userinfo);

	($hook = vBulletinHook::fetch_hook('nntp_gate_updatepassword_start')) ? eval($hook) : false;

	// validate old password
	if ($userdata->hash_password($userdata->verify_md5($vbulletin->GPC['currentpassword_md5']) ? $vbulletin->GPC['currentpassword_md5'] : $vbulletin->GPC['currentpassword'], $vbulletin->userinfo['salt']) != $vbulletin->userinfo['password'])
	{
		eval(standard_error(fetch_error('badpassword', $vbulletin->options['bburl'], $vbulletin->session->vars['sessionurl'])));
	}

	// update password
	if (!empty($vbulletin->GPC['newpassword']) OR !empty($vbulletin->GPC['newpassword_md5']))
	{
		// are we using javascript-hashed password strings?
		if ($userdata->verify_md5($vbulletin->GPC['newpassword_md5']))
		{
			$vbulletin->GPC['newpassword'] =& $vbulletin->GPC['newpassword_md5'];
			$vbulletin->GPC['newpasswordconfirm'] =& $vbulletin->GPC['newpasswordconfirm_md5'];
		}
		else
		{
			$vbulletin->GPC['newpassword'] =& md5($vbulletin->GPC['newpassword']);
			$vbulletin->GPC['newpasswordconfirm'] =& md5($vbulletin->GPC['newpasswordconfirm']);
		}

		// check that new passwords match
		if ($vbulletin->GPC['newpassword'] != $vbulletin->GPC['newpasswordconfirm'])
		{
			eval(standard_error(fetch_error('passwordmismatch')));
		}

		// everything is good - send the singly-hashed MD5 to the password update routine
	  $sql = "
INSERT INTO
  `" . TABLE_PREFIX . "nntp_user_settings`
SET
  `userid`            =  " . $db->escape_string( $vbulletin->userinfo['userid'] ) . " ,
  `nntp_password`     = '" . $db->escape_string( $vbulletin->GPC['newpassword'] ) . "'
ON DUPLICATE KEY UPDATE
  `nntp_password`     = '" . $db->escape_string( $vbulletin->GPC['newpassword'] ) . "'
";

	  $db->query_write( $sql );
	}

	// update flag
	//if (!empty($vbulletin->GPC['nntp_use_cpass']))
	{
	  $sql = "
INSERT INTO
  `" . TABLE_PREFIX . "nntp_user_settings`
SET
  `userid`            =  " . $db->escape_string( $vbulletin->userinfo['userid']                          ) . " ,
  `use_nntp_password` = '" . $db->escape_string( $vbulletin->GPC['nntp_use_cpass'] == '1' ? 'yes' : 'no' ) . "'
ON DUPLICATE KEY UPDATE
  `use_nntp_password` = '" . $db->escape_string( $vbulletin->GPC['nntp_use_cpass'] == '1' ? 'yes' : 'no' ) . "'
";

	  $db->query_write( $sql );
  }

	($hook = vBulletinHook::fetch_hook('nntp_gate_updatepassword_complete')) ? eval($hook) : false;

	$vbulletin->url = THIS_SCRIPT . '.php' . $vbulletin->session->vars['sessionurl_q'];
	eval(print_standard_redirect('redirect_updatethanks', true, true));
}
else if ($_GET['do'] == 'updatepassword')
{
	// add consistency with previous behavior
	exec_header_redirect(THIS_SCRIPT . '.php');
}


// #############################################################################
// spit out final HTML if we have got this far

if ($templatename != '')
{
	$bbcode_parser =& new vB_BbCodeParser($vbulletin, fetch_tag_list());
	$anouncemessage = $bbcode_parser->parse($vbulletin->options['nntp_adv_text']);

	// make navbar
	$navbits = construct_navbits($navbits);
	eval('$navbar = "' . fetch_template('navbar') . '";');

	($hook = vBulletinHook::fetch_hook('nntp_gate_profile_complete')) ? eval($hook) : false;

	// shell template
	eval('$HTML = "' . fetch_template($templatename) . '";');
	eval('print_output("' . fetch_template($shelltemplatename) . '");');
}

?>
