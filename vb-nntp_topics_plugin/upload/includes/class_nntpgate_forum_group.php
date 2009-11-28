<?php
require_once DIR . '/includes/class_nntpgate_group_base.php';

/**
 * 
 */
class NNTPGate_Forum_Group extends NNTPGate_Group_Base
{
    protected $_forum_id = null;
    
    public function get_group_id_by_map_id($forum_id, $external = false)
    {
        if (is_null($forum_id))
        {
            $forum_id = $this->_forum_id;
        }
        // Find group id by forum id
        $group_id = 0;
        if ( !$forum_id)
        {
            return false;
        }

        $sql = "SELECT `groupid`
                FROM
                    `" . TABLE_PREFIX . "nntp_groups_forums`
                WHERE
                    `forumid` =  " . $forum_id;
        $res = $this->_db->query_first($sql);
        if( !empty( $res ) )
        {
            $group_id = intval($res['groupid']);
        }

        if ($external)
        {
            return $group_id;
        }
        else
        {
            return $this->_group_id = $group_id;
        }
    }

    public function delete_group( $group_id = null)
    {
        if (parent::delete_group($group_id))
        {
            $sql = "DELETE FROM
                                    `" . TABLE_PREFIX . "nntp_groups_forums`
                                WHERE
                                    `groupid` = " . (int) $this->_group_id;
            $this->_db->query_write($sql);
            echo $sql;
        }
    }

}

