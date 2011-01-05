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
$specialtemplates = array();

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

$do = $_REQUEST['do'];

$this_script = 'nntp_stats';
$nntp_gate_ver = 1.0;

// ############## START ##################################################

print_cp_header( $vbphrase['statistics'] );

// ############## SHOW STATS TABLE #######################################

$vbulletin->input->clean_array_gpc( 'r', array(
	'perpage'    => TYPE_INT,
	'pagenumber' => TYPE_INT,
) );

if ($vbulletin->GPC['perpage'] < 1)
{
	$vbulletin->GPC['perpage'] = 100;
}

if ( $vbulletin->GPC['pagenumber'] < 1 )
{
	$vbulletin->GPC['pagenumber'] = 1;
}

// pager data
$counter = $db->query_first("
	SELECT
	  COUNT( `userid` ) AS 'count'
	FROM
	  " . TABLE_PREFIX . "nntp_stats AS STATS
	WHERE
	  `date` >= DATE_SUB( CURDATE(), INTERVAL " . $vbulletin->options['nntp_stats_show_last_days'] . " DAY )
	GROUP BY
	  `userid`
");

$counter = $counter['count'];

$totalpages = ceil( $counter / $vbulletin->GPC['perpage'] );

$stats = $db->query_read("
	SELECT
	  U.`username`                      AS 'username',
	  U.`userid`                        AS 'userid'  ,
	  G.`opentag`                       AS 'opentag' ,
	  G.`closetag`                      AS 'closetag',
	  COUNT( S.`date` )                 AS 'number'  ,
	  UNIX_TIMESTAMP(MAX( S.`date` ))   AS 'date'
	FROM
	            `" . TABLE_PREFIX . "nntp_stats` AS S
	  LEFT JOIN `" . TABLE_PREFIX . "user`           AS U USING( `userid` )
    LEFT JOIN `" . TABLE_PREFIX . "usergroup`      AS G USING( `usergroupid` )
	WHERE
	  S.`date` >= DATE_SUB( CURDATE(), INTERVAL " . $vbulletin->options['nntp_stats_show_last_days'] . " DAY )
	GROUP BY
	  S.`userid`
	ORDER BY
	  `number`
	LIMIT
	  " . ( ( $vbulletin->GPC['pagenumber'] - 1 ) * $vbulletin->GPC['perpage'] ) . ", " . $vbulletin->GPC['perpage']
);

print_form_header( $this_script, '' );
construct_hidden_code( "pagenumber", $vbulletin->GPC['pagenumber'] );
construct_hidden_code( "perpage", $vbulletin->GPC['perpage'] );

print_table_header(
    construct_phrase($vbphrase['nntp_stats_head'],
            $vbulletin->options['nntp_stats_show_last_days']),
    3 );

// table header
$header = array();
$header[] = $vbphrase['username'];
$header[] = $vbphrase['nntp_stats_login_number'];
$header[] = $vbphrase['nntp_stats_last_used'];

print_cells_row( $header, true, false );

while ( $row = $db->fetch_array( $stats ) )
{
  $usercell =
      '<b>'
    . stripslashes($row['opentag'])
    . $row['username']
    . stripslashes($row['closetag'])
    . '</b>';

  // show linked username only for existing users
  if ( intval($row['userid']) > 0 )
  {
    $usercell =
        '<a target="_blank" href="'
      . $vbulletin->options['bburl'] . '/member.php?'
      . $vbulletin->session->vars['sessionurl']
      . 'u=' . $row['userid'] . '">' . $usercell . '</a>';
  }

	print_cells_row( array(
	  $usercell,
    $row['number'],
    vbdate( $vbulletin->options['dateformat'], $row['date'] )
 	));
}

if ( $counter && $vbulletin->GPC['pagenumber'] != 1 )
{
  $prv = $vbulletin->GPC['pagenumber'] - 1;
  $firstpage = "<input type=\"submit\" class=\"button\" value=\"&laquo; " . $vbphrase['first_page'] .
               "\" tabindex=\"1\" onclick=\"this.form.pagenumber.value = '1'\" />";

  $prevpage  = "<input type=\"submit\" class=\"button\" value=\"&laquo; " . $vbphrase['prev_page'] .
               "\" tabindex=\"1\" onclick=\"this.form.pagenumber.value = '" . $prv . "'\" />";
}

if ( $counter && $vbulletin->GPC['pagenumber'] != $totalpages )
{
  $nxt = $vbulletin->GPC['pagenumber'] + 1;
  $nextpage = "<input type=\"submit\" class=\"button\" value=\"" . $vbphrase['next_page'] . " &raquo;" .
              "\" tabindex=\"1\" onclick=\"this.form.pagenumber.value = '" . $nxt . "'\" />";

  $lastpage = "<input type=\"submit\" class=\"button\" value=\"" . $vbphrase['last_page'] . " &raquo;" .
              "\" tabindex=\"1\" onclick=\"this.form.pagenumber.value = '" . $totalpages . "'\" />";
}

print_table_footer( 3, "$firstpage $prevpage &nbsp; $nextpage $lastpage" );

