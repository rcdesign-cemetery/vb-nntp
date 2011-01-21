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

// ############## SET PHP ENVIRONMENT ####################################
error_reporting(E_ALL & ~E_NOTICE);
@set_time_limit(0);
 
// ############## PRE-CACHE TEMPLATES AND DATA ###########################
$phrasegroups = array(
	'style',
	'user',
	'cpuser',
	'fronthelp',
	'posting',
);
$specialtemplates = array('vbnntp');

// ######################## CHECK ADMIN PERMISSIONS #######################
/*
if (!can_administer('canadminusers'))
{
	print_cp_no_permission();
}
*/

// ############## REQUIRE BACK-END #######################################
require_once('./global.php');
require_once(DIR . '/includes/adminfunctions_template.php');

// #######################################################################
// ######################### START MAIN SCRIPT ###########################
// #######################################################################

if (empty($_REQUEST['do']))
{
	$_REQUEST['do'] = 'key_form';
}
if ('key_form' == $_REQUEST['do'])
{
    print_cp_header( $vbphrase['nntp_groups'] );

    print_form_header( 'nntp_brand', 'set_key' );
    print_table_header( $vbphrase['nntp_branding_free'], 2 );

    print_input_row( $vbphrase['nntp_input_serial_key'], 'key');
    print_submit_row( $vbphrase['save'], '', 2, $vbphrase['no'] );
}
if ('set_key' == $_REQUEST['do'])
{
    $vbulletin->input->clean_array_gpc('r', array(
        'key' => TYPE_STR,
    ));
    $key = trim($vbulletin->GPC['key']);
    if (32 != strlen($key))
    {
        print_stop_message('nntp_invalid_key');
    }
    build_datastore('vbnntp', $key, 0);
    print_cp_message($vbphrase['nntp_branding_removed'], 'nntp_groups.php?' . $vbulletin->session->vars['sessionurl'] . 'do=list', 1, '');
}
