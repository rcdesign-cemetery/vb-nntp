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

// ############## REQUIRE BACK-END #######################################
require_once('./global.php');
require_once(DIR . '/includes/adminfunctions_template.php');
require_once(DIR . '/includes/functions_nntp.php');

// ############################# LOG ACTION ##############################
$vbulletin->input->clean_array_gpc('r', array(
	'usertitleid' => TYPE_INT
));
log_admin_action(!empty($vbulletin->GPC['usertitleid']) ? 'usertitle id = ' . $vbulletin->GPC['usertitleid'] : '');

// #######################################################################
// ######################### START MAIN SCRIPT ###########################
// #######################################################################

$do = $_REQUEST['do'];

$this_script = 'nntp_groups';
$nntp_gate_ver = 1.0;

// ############## GET AVAILABLE PLUGINS LIST #############################

$plugins = array();

($hook = vBulletinHook::fetch_hook('nntp_gate_plugins')) ? eval($hook) : false;

// ############## START ##################################################

print_cp_header( $vbphrase['nntp_groups'] );

// ############## ADD NEW GROUP FORM AND EXISTING GROUPS LIST ############

if ( empty( $do ) || $do == 'list' ) {
	// existing groups list
	$groups = $db->query_read("
		SELECT
		  G1.`settings`  AS 'main_group',
		  G2.`settings`  AS 'map_group' ,
		  G1.`plugin_id` AS 'plugin_id' ,
		  G1.`id`        AS 'group_id'
		FROM
		            `" . TABLE_PREFIX . "nntp_groups` AS G1
		  LEFT JOIN `" . TABLE_PREFIX . "nntp_groups` AS G2 ON( G1.`map_id` = G2.`id` )
		ORDER BY
		  G1.`group_name`
	");

	?>
	<script type="text/javascript">
	function js_nntpgroup_jump(group_id, plugin, obj)
	{
		task = obj.options[obj.selectedIndex].value;
		switch (task)
		{
			case 'edit'   : window.location = "<?php echo $this_script ?>.php?<?php echo $vbulletin->session->vars['sessionurl_js']; ?>do=group_settings&group_id=" + group_id + "&plugin=" + plugin; break;
			case 'reindex': window.location = "<?php echo $this_script ?>.php?<?php echo $vbulletin->session->vars['sessionurl_js']; ?>do=group_reindex&group_id="  + group_id + "&plugin=" + plugin; break;
			case 'kill'   : window.location = "<?php echo $this_script ?>.php?<?php echo $vbulletin->session->vars['sessionurl_js']; ?>do=remove_group&group_id="   + group_id                      ; break;
			default       : return false; break;
		}
	}
	</script>
	<?php

	$options = array(
		'edit'    => $vbphrase['edit']   ,
		'reindex' => $vbphrase['reindex'],
		'kill'    => $vbphrase['delete'] ,
	);

	$groups_list = array();

	while ( $group_settings = $db->fetch_array( $groups ) )
	{
		$group = unserialize( $group_settings['main_group'] );

		$group['map']       = !empty( $group_settings['map_group'] ) ? unserialize( $group_settings['map_group'] ) : array();
		$group['plugin_id'] = $group_settings['plugin_id'];
		$group['group_id']  = $group_settings['group_id'];

		$groups_list[] = $group;
	}

	// possible to add groups list
	($hook = vBulletinHook::fetch_hook('nntp_gate_possible_groups_list')) ? eval($hook) : false;

	print_form_header( $this_script, 'group_settings' );
	print_table_header( $vbphrase['nntp_groups_list'], 2 );

	print_cells_row( array( $vbphrase['nntp_group_name'], $vbphrase['controls'] ), 1 );

	foreach ( $groups_list AS $group )
	{
		$mapped       = '';
		$group_status = '';

		if (!empty($group['map']))
		{
			$mapped = ' ' . $vbphrase['nntp_group_mapped_to'] . ' ' . $group['map']['group_name'];
			$group['group_name'] = $mapped;
		}

    if (!$group['is_active'])
    {
      $group_status =
        ' [<span style="color: red;">' . $vbphrase['disabled'] . '</span>]';
    }

		print_cells_row( array(
			'<b>' . $group['group_name'] . '</b>'
			. $group_status
			. ( !empty( $group['comment'] ) ? '<br />' . $group['comment'] : '' ),
			"\n\t<select name=\"g$group[group_id]\" onchange=\"js_nntpgroup_jump($group[group_id], '$group[plugin_id]', this);\" class=\"bginput\">\n" . construct_select_options($options) . "\t</select>\n\t<input type=\"button\" value=\"" . $vbphrase['go'] . "\" onclick=\"js_nntpgroup_jump($group[group_id], '$group[plugin_id]', this.form.g$group[group_id]);\" />\n\t"
		));
	}

	print_table_footer( 2 );
}

// ############## ADD/EDIT GROUP SETTINGS ################################
if ( $do == 'set_group_settings' )
{
	$vbulletin->input->clean_array_gpc( 'r', array(
		'plugin'			=> TYPE_STR,
		'group_id'		=> TYPE_INT,
		'group_name'  => TYPE_STR,
		'is_active'   => TYPE_INT,
	) );

	$settings = array();

	// common settings
	$settings['plugin']     = $vbulletin->GPC['plugin'];
	$settings['group_id']   = $vbulletin->GPC['group_id'];
	$settings['group_name'] = $vbulletin->GPC['group_name'];
	$settings['is_active']  = $vbulletin->GPC['is_active'];
	$settings['map_id']     = 0;

	// plugin's specific settings
	($hook = vBulletinHook::fetch_hook('nntp_gate_group_save_settings')) ? eval($hook) : false;

	// save settings
	nntp_set_group_settings( $settings );

  $new_group_id         = $settings['group_id'] > 0 ? 0                     : $db->insert_id();
	$settings['group_id'] = $settings['group_id'] > 0 ? $settings['group_id'] : $new_group_id;

	// plugin's specific settings
	($hook = vBulletinHook::fetch_hook('nntp_gate_group_save_settings_complete')) ? eval($hook) : false;

  // create group's index for just created group only
  if ($new_group_id > 0)
  {
    group_reindex( $settings['group_id'] );
  }

	// redirect to groups list page
	define('CP_REDIRECT', $this_script . '.php?do=list');
	print_stop_message('saved_nntp_group_settings_successfully', $vbulletin->GPC['group_name']);
}


// ############## ADD/EDIT GROUP SETTINGS FORM ###########################
if ( $do == 'group_settings' )
{
	$vbulletin->input->clean_array_gpc( 'r', array(
		'plugin'			=> TYPE_STR,
		'group_id'		=> TYPE_INT,
	) );

	// check for existing plugin
	if ( ! array_key_exists( $vbulletin->GPC['plugin'], $plugins ) )
	{
		define('CP_REDIRECT', $this_script . '.php?do=list');
		print_stop_message('invalid_nntp_plugin_specified');
	}

	$settings = array();

	// load existing settings
	if ( ! empty( $vbulletin->GPC['group_id'] )   &&
	              $vbulletin->GPC['group_id'] > 0 &&
	     ! empty( $vbulletin->GPC['plugin']   )      )
	{
		$settings = nntp_get_group_settings( $vbulletin->GPC['group_id'], $vbulletin->GPC['plugin'] );
	}

	print_form_header( $this_script, 'set_group_settings' );

	construct_hidden_code( 'plugin'  , $vbulletin->GPC['plugin']   );
	construct_hidden_code( 'group_id', $vbulletin->GPC['group_id'] );


	print_table_header( $vbphrase['nntp_set_group'], 2 );

	print_input_row( $vbphrase['nntp_group_name'], 'group_name', ( ! empty( $vbulletin->GPC['group_name'] ) ? $vbulletin->GPC['group_name'] : $settings['group_name'] ) );

	($hook = vBulletinHook::fetch_hook('nntp_gate_group_settings')) ? eval($hook) : false;

  $is_active =
    (    $vbulletin->GPC['is_active'] === 0
      OR $vbulletin->GPC['is_active'] === 1 )
	    ? $vbulletin->GPC['is_active']
	    : $settings['is_active'] === 0 ? 0 : 1;

	print_yes_no_row(
      $vbphrase['nntp_group_is_active'],
      'is_active',
      $is_active
    );

	print_submit_row( $vbphrase['save'], '', 2, $vbphrase['no'] );
}

// ###################### Start Remove ###################################

if ( $_REQUEST['do'] == 'remove_group' )
{
	$vbulletin->input->clean_array_gpc( 'r', array(
		'group_id' => TYPE_INT,
	) );

	// check for there is no groups mapped to this one
	admincp_check_for_mapped_groups( $vbulletin->GPC['group_id'] );

	print_form_header( $this_script, 'kill_group' );
	construct_hidden_code( 'group_id', $vbulletin->GPC['group_id'] );
	print_table_header( $vbphrase['confirm_deletion'] );
	print_description_row( $vbphrase['nntp_are_you_sure_you_want_to_delete_this_group'] );
	print_submit_row( $vbphrase['yes'], '', 2, $vbphrase['no'] );
}

// ###################### Start Kill #####################################

if ( $_REQUEST['do'] == 'kill_group' )
{
	$vbulletin->input->clean_array_gpc( 'r', array(
		'group_id' => TYPE_INT,
	) );

	admincp_check_for_mapped_groups( $vbulletin->GPC['group_id'] );

	nntp_delete_group( $vbulletin->GPC['group_id'] );

	define('CP_REDIRECT', $this_script . '.php?do=list');
	print_stop_message( 'nntp_group_deleted_successfully');
}

// ###################### Start reindex #####################################

if ( $_REQUEST['do'] == 'group_reindex' )
{
	$vbulletin->input->clean_array_gpc( 'r', array(
		'plugin'		=> TYPE_STR,
		'group_id'		=> TYPE_INT,
	) );

	group_reindex( $vbulletin->GPC['group_id'] );

	define('CP_REDIRECT', $this_script . '.php?do=list');
	print_stop_message( 'nntp_group_reindexed_successfully');
}


// ###################### Functions ######################################

function group_reindex ( $group_id )
{
  global $db, $vbulletin;

  if( !$group_id )
  {
    return false;
  }

  $groups = $db->query_read("
    SELECT
      *
    FROM
      " . TABLE_PREFIX . "nntp_groups
    WHERE
      (
        `id`     = " . $db->escape_string( $group_id ) . " OR
        `map_id` = " . $db->escape_string( $group_id ) . "
      ) AND
      `is_active` = 'yes'
    ");

  // date limit - used to limit selected messages by date
  $datelimit = 0;

  // rows factor
  $rowsnum   = $vbulletin->options['nntp_max_messages_in_group'];

  while ($group = $db->fetch_array($groups))
  {
    $group_id = $group['map_id'] ? $group['map_id'] : $group['id'];

    if ($rowsnum > 0)
    {
      $datelimit = 0;
    }

    ($hook = vBulletinHook::fetch_hook('nntp_gate_group_reindex')) ? eval($hook) : false;
  }

  $limit = $db->query_first( "
    SELECT
      `datetime`
    FROM
      `" . TABLE_PREFIX . "nntp_index`
    WHERE
      `groupid` = " . $group_id . "
    ORDER BY
      `datetime` DESC
    LIMIT
      " . ($vbulletin->options['nntp_max_messages_in_group'] - 1) . ", 1
  ");

  $db->query_write("
    DELETE FROM
      `" . TABLE_PREFIX . "nntp_index`
    WHERE
      `groupid`  =  " . $group_id          . " AND
      `datetime` < STR_TO_DATE( '" . $limit['datetime'] . "', '%Y-%m-%d %H:%i:%s' )
  ");

  return;
}


function admincp_check_for_mapped_groups ( $group_id )
{
	global $db;

	if( check_for_mapped_groups( $group_id ) )
	{
		define('CP_REDIRECT', $this_script . '.php?do=list');
		print_stop_message('nntp_cannot_remove_mapped_group');
	}

	return;
}


function nntp_get_group_settings ( $group_id, $plugin_name ) {
	$settings = array();

	$group = nntp_get_group( $group_id );

	if( empty( $group ) || $group['plugin_id'] != $plugin_name )
		return $settings;

	$settings = $group['settings'];

	return $settings;
}


function nntp_set_group_settings ( $settings = array() ) {
	$groupinfo = array( 'settings' => $settings );

	nntp_save_group( $groupinfo );

	return true;
}
