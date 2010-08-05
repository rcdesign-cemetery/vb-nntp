<?php
/*======================================================================*\
|| #################################################################### ||
|| # NNTP Gate 1.1                                                    # ||
|| # ---------------------------------------------------------------- # ||
|| # Copyright © 2008 Dmitry Titov, Vitaly Puzrin.                    # ||
|| # All Rights Reserved.                                             # ||
|| # This file may not be redistributed in whole or significant part. # ||
|| #################################################################### ||
\*======================================================================*/

// ####################### SET PHP ENVIRONMENT ###########################
error_reporting(E_ALL & ~E_NOTICE);

// #################### DEFINE IMPORTANT CONSTANTS #######################
define('THIS_SCRIPT', 'nntp_gate');
define('CSRF_PROTECTION', true);

// ################### PRE-CACHE TEMPLATES AND DATA ######################
// get special phrase groups
$phrasegroups = array('user');

// get special data templates from the datastore
$specialtemplates = array();

// pre-cache templates used by all actions
$globaltemplates = array('nntp_anounce');

// pre-cache templates used by specific actions
$actiontemplates = array();

// ######################### REQUIRE BACK-END ############################
require_once('./global.php');
require_once(DIR . '/includes/class_bbcode.php');
require_once(DIR . '/includes/adminfunctions.php'); // required for can_administer

// #######################################################################
// ######################## START MAIN SCRIPT ############################
// #######################################################################

$bbcode_parser = new vB_BbCodeParser($vbulletin, fetch_tag_list());
$anouncemessage = $bbcode_parser->parse($vbulletin->options['nntp_adv_text']);

// initialize some template bits

$navbits = array('' => $vbphrase['nntp_gate_menu_title']);

$navbits = construct_navbits($navbits);

$navbar = render_navbar_template($navbits);

$templater = vB_Template::create('nntp_anounce');
$templater->register_page_templates();
$templater->register('anouncemessage', $anouncemessage);
$templater->register('pagetitle', $vbphrase['nntp_anounce_pagetitle']);

$templater->register('navbar', $navbar);
print_output($templater->render());

?>
