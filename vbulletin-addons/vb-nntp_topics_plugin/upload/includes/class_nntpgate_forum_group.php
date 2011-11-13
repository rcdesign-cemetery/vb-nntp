<?php
require_once DIR . '/includes/class_nntpgate_group_base.php';
require_once DIR . '/includes/class_nntpgate_forum_group.php';
/**
 *
 */
class NNTPGate_Forum_Group extends NNTPGate_Group_Base
{
    /**
     * Message type (similar to Content Type)
     */
    const PLUGIN_ID = 'forum';

    /**
     * Get all groups
     *
     * @param bool $active
     * @return array
     */
    public function get_groups_list($active = null)
    {
        return parent::get_groups_list($active, self::PLUGIN_ID);
    }

    /**
     * Get available groups
     *
     * @global vB_Registry $vbulletin
     * @param array $member_group_id_list
     * @return array
     */
    public function get_avaliable_group_list($member_group_id_list)
    {
        $active_groups = $this->get_groups_list(true);
        global $vbulletin;

        if( empty( $active_groups ) )
        {
            return $active_groups;
        }
        require_once( DIR . '/includes/functions.php' );
        cache_ordered_forums();

        $forum_permissions = array();

        foreach( array_keys( $vbulletin->forumcache ) AS $forumid )
        {
            if( ! isset( $forum_permissions[$forumid] ) )
            {
                $forum_permissions[$forumid] = 0;
            }

            foreach( $member_group_id_list AS $user_group_id )
            {
                $forum_permissions[$forumid]
                    |= $vbulletin->forumcache[$forumid]['permissions'][$user_group_id];
            }
        }

        $forum_id_list = array();

        // Get forums that allow canview access
        foreach( $forum_permissions AS $forumid => $perm )
        {
            if(     ( $perm & $vbulletin->bf_ugp_forumpermissions['canview'] )
                AND ( $perm & $vbulletin->bf_ugp_forumpermissions['canviewthreads'] )
                AND ( $perm & $vbulletin->bf_ugp_forumpermissions['cangetattachment'] ) )
            {
                $forum_id_list[$forumid] = $forumid;
            }
        }

        foreach( $active_groups as $nntpid => &$group )
        {
            if( isset( $forum_id_list[$group['map_id']] ) )
            {
                $group['available'] = true;
            }
        }
        return $active_groups;
    }
}
