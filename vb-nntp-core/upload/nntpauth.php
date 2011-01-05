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

// ####################### SET PHP ENVIRONMENT ###########################
error_reporting(E_ALL & ~E_NOTICE);

// Define constants for proper initialisation
define('SKIP_SESSIONCREATE', 1);
define('NOCOOKIES', 1);
define('THIS_SCRIPT', 'nntpauth');
//define('CSRF_PROTECTION', true)

// Define phrase groups, needed for templates
$phrasegroups = array(
  'posting',
  'global',
  'prefix',
);

// vBulletin Libraries 
require_once( './global.php' );
require_once( DIR . '/includes/functions.php' );
require_once( DIR . '/includes/class_bbcode.php' );

// START MAIN SCRIPT

// Fetch all unauthenticated users & try to validate
$sql =  "SELECT
            *
        FROM
            " . TABLE_PREFIX . "nntp_userauth_cache
        WHERE
            `access_granted` = 'no'";
$users = $vbulletin->db->query_read_slave($sql);

while ($row = $vbulletin->db->fetch_array($users))
{
    $userid = auth_user($row['username'], $row['authhash']);

    // If auth ok, build permissions, else - delete record
    
    // We always work with pair (user,passowd). Without it session
    // will be kicked by parallel brute force login attempts. 
    if ($userid)
    {
        $userinfo = fetch_userinfo($userid);
        $key = nntp_update_groupaccess_cache($userinfo);

        // Update user record
        $sql = "UPDATE
                    " . TABLE_PREFIX . "nntp_userauth_cache
                SET
                    `usergroupslist`    = '" . $vbulletin->db->escape_string( $key ) . "',
                    `userid`            = " . $userid . ",
                    `access_granted`    = 'yes'
                WHERE
                    `username`          = '" . $vbulletin->db->escape_string( $row['username'] ) . "'
                    AND `authhash`      = '" . $vbulletin->db->escape_string( $row['authhash'] ) . "'";

        $vbulletin->db->query_write($sql);

        // Update statistics
        // We don't need update on each login, when cache is used, so this place is ok.
        $sql = "INSERT DELAYED IGNORE
                    INTO " . TABLE_PREFIX . "nntp_stats  (userid, date)
                VALUES (". $userid .",'". date('Y-m-d') . "')";

        $vbulletin->db->query_write($sql);
    } 
    else 
    {
        // Authorization failed - delete record
        $sql = "DELETE FROM 
                    " . TABLE_PREFIX . "nntp_userauth_cache
                WHERE
                    `username`          = '" . $vbulletin->db->escape_string( $row['username'] ) . "'
                    AND `authhash`      = '" . $vbulletin->db->escape_string( $row['authhash'] ) . "'";
        $vbulletin->db->query_write($sql);
    }
}

echo "Ok";


function auth_user($name, $passhash)
{
    global $vbulletin;

    $sql = "SELECT *
            FROM " . TABLE_PREFIX . "user
            WHERE username = '" . $vbulletin->db->escape_string( $name ) . "'";
    $user = $vbulletin->db->query_first($sql);

    // not found - try to search by email
    if (!is_array($user))
    {
        $sql = "SELECT *
                FROM " . TABLE_PREFIX . "user
                WHERE email = '" . $vbulletin->db->escape_string( $name ) . "'";
        $user = $vbulletin->db->query_first($sql);
        
        // nothing - fail
        if (!is_array($user))
        {
            return 0;
        }
    }
    
    if (md5($passhash . $user['salt']) == $user['password'])
    {
        return $user['userid'];
    }
    return 0;
}

/*
 *  Insert/update groupaccess_cache item based on user's groups list
 *
 *  Input parameters:
 *    usergroupslist - (text) user's groups list, first element - main group
 *
 */
function nntp_update_groupaccess_cache($userinfo)
{
    global $vbulletin;

    // Sort groups, to make same key for any combinations
    $membergroupids = fetch_membergroupids_array($userinfo);
    sort($membergroupids);

    $activegroups = array();
    $availablegroups = array();

    /**
     * Example:
     *
     * $nntp_group = new NNTPGate_Forum_Group(); // child of NNTPGate_Group_Base
     * $groups = $nntp_group->get_avaliable_group_list($membergroupids);
     * $activegroups = $activegroups + $groups;
     * unset($nntp_group);
     */
    ($hook = vBulletinHook::fetch_hook('nntp_gate_backend_check_groups_list')) ? eval($hook) : false;

    foreach( $activegroups as $nntpid => $group )
    {
        if($group['available'] == true)
        {
            $availablegroups[] = $group['group_id'];
        }
    }

    sort($availablegroups);
    $nntpgroupslist = implode(',', $availablegroups);

    $access_level = nntp_get_access_level($userinfo);
    $template     = vB_Template::create('nntp_message_template')->render();
    $css          = vB_Template::create('nntp_message_css')->render();
    $menu         = vB_Template::create('nntp_message_menu')->render();

    $tmpl = vB_Template::create('nntp_demo_text');
    $tmpl->register_page_templates();
    $tmpl->register('nntp_demo_text', $vbulletin->options['nntp_demo_text']);

    $demotext = $tmpl->render();

    $key = implode(',', $membergroupids);

    // update/insert data into db cache
    $vbulletin->db->query_write("
        REPLACE INTO `" . TABLE_PREFIX . "nntp_groupaccess_cache`
        SET
            `usergroupslist` = '" . $vbulletin->db->escape_string( $key            ) . "',
            `nntpgroupslist` = '" . $vbulletin->db->escape_string( $nntpgroupslist ) . "',
            `access_level`   = '" . $vbulletin->db->escape_string( $access_level   ) . "',
            `template`       = '" . $vbulletin->db->escape_string( $template       ) . "',
            `css`            = '" . $vbulletin->db->escape_string( $css            ) . "',
            `menu`           = '" . $vbulletin->db->escape_string( $menu           ) . "',
            `demotext`       = '" . $vbulletin->db->escape_string( $demotext       ) . "'
    ");
    
    return $key;
}

/*
 *  Get access level (full/demo/none) for user's groupslist
 */
function nntp_get_access_level($userinfo)
{
    global $vbulletin;

    // check group permissions
    $fullaccessgroups = unserialize( $vbulletin->options['nntp_groups']);
    if (is_member_of( $userinfo, $fullaccessgroups ))
    {
        return 'full';
    }

    $demoaccessgroups = unserialize( $vbulletin->options['nntp_demo_groups'] );
    if (is_member_of( $userinfo, $demoaccessgroups ))
    {
        return 'demo';
    }

    // default value
    return 'none';
}

?>
