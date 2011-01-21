<?php
/*======================================================================*\
|| #################################################################### ||
|| # NNTP Gate 1.1                                                    # ||
|| # ---------------------------------------------------------------- # ||
|| # Copyright � 2008 Dmitry Titov, Vitaly Puzrin.                    # ||
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

// ############################# LOG ACTION ##############################
$vbulletin->input->clean_array_gpc('r', array(
    'usertitleid' => TYPE_INT
));
log_admin_action(!empty($vbulletin->GPC['usertitleid']) ? 'usertitle id = ' . $vbulletin->GPC['usertitleid'] : '');

// #######################################################################
// ######################### START MAIN SCRIPT ###########################
// #######################################################################
require_once DIR . '/includes/class_nntpgate_group_base.php';
$do = $_REQUEST['do'];

$this_script = 'nntp_groups';
$nntp_gate_ver = 1.0;

// ############## GET AVAILABLE PLUGINS LIST #############################

$plugins = array();

($hook = vBulletinHook::fetch_hook('nntp_gate_plugins')) ? eval($hook) : false;

// ############## START ##################################################

print_cp_header( $vbphrase['nntp_groups'] );

if (32 == strlen($vbulletin->vbnntp))
{
    //echo '<img border="0" alt="" width="1" height="1" src="">';
}
// ############## ADD NEW GROUP FORM AND EXISTING GROUPS LIST ############

if ( empty( $do ) || $do == 'list' )
{
    ?>
<script type="text/javascript">
    function js_nntpgroup_jump(group_id, plugin, obj)
    {
        task = obj.options[obj.selectedIndex].value;
        switch (task)
        {
            case 'edit'   : window.location = "<?php echo $this_script ?>.php?<?php echo $vbulletin->session->vars['sessionurl_js']; ?>do=group_settings&group_id=" + group_id + "&plugin=" + plugin; break;
            case 'clean': window.location = "<?php echo $this_script ?>.php?<?php echo $vbulletin->session->vars['sessionurl_js']; ?>do=group_clean&group_id="  + group_id + "&plugin=" + plugin; break;
            case 'kill'   : window.location = "<?php echo $this_script ?>.php?<?php echo $vbulletin->session->vars['sessionurl_js']; ?>do=remove_group&group_id="   + group_id                      ; break;
            default       : return false; break;
        }
    }
</script>
    <?php
    function form_group_control($group)
    {
        global $vbphrase;
        $options = array(
            'edit'    => $vbphrase['edit']   ,
            'clean' => $vbphrase['clean'],
            'kill'    => $vbphrase['delete'] ,
        );
        $controls = "\n\t<select
                                    name=\"g" .$group['group_id'] ."\"
                                    onchange=\"js_nntpgroup_jump(" .$group['group_id'].",
                                                                '".$group['plugin_id']."',
                                                                this);\"
                                    class=\"bginput\">\n" . construct_select_options($options) . "\t
                                </select>\n\t
                                <input
                                    type=\"button\"
                                    value=\"" . $vbphrase['go'] . "\"
                                    onclick=\"js_nntpgroup_jump(" . $group['group_id'] . ",
                                                                '". $group['plugin_id'] . "',
                                                                this.form.g" . $group['group_id'] .");\"
                                 />\n\t";
        return $controls;
    }


    ($hook = vBulletinHook::fetch_hook('nntp_gate_groups_list')) ? eval($hook) : false;
}


/**
 * При работе с конкретными записями, лучше использовать наследников
 * Так решаются такие проблемы как попытка удалить группу блогов
 * Исли обработчик не выставлен, то используем методы базового класса
 * Пример:
 *
 * if ('forum' == $vbulletin->GPC['plugin'])
 * {
 *     require_once DIR . '/includes/class_nntpgate_forum_group.php';
 *     $nntp_group = new NNTPGate_Forum_Group();
 * }
 */
$vbulletin->input->clean_array_gpc( 'r', array(
    'plugin'        => TYPE_STR,
    'group_id'      => TYPE_INT,
    ) );
$nntp_group = null;
($hook = vBulletinHook::fetch_hook('nntp_gate_group_handler')) ? eval($hook) : false;
if (is_null($nntp_group) OR (! $nntp_group instanceof NNTPGate_Group_Base))
{
    $nntp_group = new NNTPGate_Group_Base();
}

// ############## ADD/EDIT GROUP SETTINGS ################################
if ( $do == 'set_group_settings' )
{
    $vbulletin->input->clean_array_gpc( 'r', array(
        'group_name'    => TYPE_STR,
        'is_active'     => TYPE_INT,
        'map_id'        => TYPE_INT,
        ) );

    $nntp_group->set_group_id($vbulletin->GPC['group_id']);
    $nntp_group->set_group_name($vbulletin->GPC['group_name']);
    $nntp_group->set_plugin_id($vbulletin->GPC['plugin']);
    $nntp_group->set_is_active($vbulletin->GPC['is_active']);
    $nntp_group->set_map_id($vbulletin->GPC['map_id']);
    define('CP_REDIRECT', $this_script . '.php?do=list');
    // save settings
    if ($nntp_group->save_group() )
    {
        print_stop_message('saved_nntp_group_settings_successfully', $vbulletin->GPC['group_name']);
    }
    else
    {
        print_stop_message('saved_nntp_group_settings_defeated', $vbulletin->GPC['group_name']);
    }
}


// ############## ADD/EDIT GROUP SETTINGS FORM ###########################
if ( $do == 'group_settings' )
{
    // check for existing plugin
    if ( ! array_key_exists( $vbulletin->GPC['plugin'], $plugins ) )
    {
        define('CP_REDIRECT', $this_script . '.php?do=list');
        print_stop_message('invalid_nntp_plugin_specified');
    }

    // load existing group
    $group_id = $vbulletin->GPC['group_id'];
    $nntp_group->get_group($group_id);

    print_form_header( $this_script, 'set_group_settings' );

    construct_hidden_code( 'plugin'  , $vbulletin->GPC['plugin']   );
    construct_hidden_code( 'group_id', $nntp_group->get_group_id() );

    print_table_header( $vbphrase['nntp_set_group'], 2 );

    print_input_row( $vbphrase['nntp_group_name'], 'group_name', $nntp_group->get_group_name() );

    ($hook = vBulletinHook::fetch_hook('nntp_gate_group_settings')) ? eval($hook) : false;

    $is_active = $nntp_group->get_is_active();
    if (is_null($is_active) || $is_active)
    {
        $is_active = 'yes';
    }

    print_yes_no_row(
        $vbphrase['nntp_group_is_active'],
        'is_active',
        ('yes' == $is_active)
    );

    print_submit_row( $vbphrase['save'], '', 2, $vbphrase['no'] );
}

// ###################### Start Remove ###################################

if ( $_REQUEST['do'] == 'remove_group' )
{

    // check for there is no groups mapped to this one
    //    admincp_check_for_mapped_groups( $vbulletin->GPC['group_id'] );

    print_form_header( $this_script, 'kill_group' );
    construct_hidden_code( 'group_id', $vbulletin->GPC['group_id'] );
    print_table_header( $vbphrase['confirm_deletion'] );
    print_description_row( $vbphrase['nntp_are_you_sure_you_want_to_delete_this_group'] );
    print_submit_row( $vbphrase['yes'], '', 2, $vbphrase['no'] );
}

// ###################### Start Kill #####################################

if ( $_REQUEST['do'] == 'kill_group' )
{
    $group_id = $vbulletin->GPC['group_id'];
    define('CP_REDIRECT', $this_script . '.php?do=list');
    if ($nntp_group->delete_group($group_id))
    {
        print_stop_message( 'nntp_group_deleted_successfully');
    }
    else
    {
        print_stop_message( 'nntp_group_deleted_defeated');
    }
}

// ###################### Start clean #####################################

if ( $_REQUEST['do'] == 'group_clean' )
{
    $group_id = $vbulletin->GPC['group_id'];

    define('CP_REDIRECT', $this_script . '.php?do=list');
    if ($nntp_group->clean_group($group_id))
    {
        print_stop_message( 'nntp_group_cleaned_successfully');
    }
    else
    {
        print_stop_message( 'nntp_group_cleaned_defeated');
    }
}
