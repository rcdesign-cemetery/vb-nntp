<?php
require_once DIR . '/includes/class_nntpgate_group_base.php';
require_once DIR . '/includes/class_nntpgate_forum_group.php';
/**
 *
 */
class NNTPGate_Forum_Group extends NNTPGate_Group_Base
{
    /**
     * тип сообщения
     */
    const PLUGIN_ID = 'forum';



    /**
     * Get all forum based groups
     *
     * @return array
     */
    public function get_groups_list_by_forum($forums_list)
    {
        $groups_list = $this->get_groups_list();
        foreach($groups_list as $key=>&$group)
        {
            $forum_id = $group['map_id'];
            $comment = $forums_list[$forum_id]['title'];
            $group['comment'] = $comment;
        }
        return $groups_list;
    }

    /**
     * Получить список доступных для мапинга форумов
     *
     * @todo избавиться от глобался
     * @todo подумать а на своем ли месте этот метод
     *
     * @global vB_Registry $vbulletin
     * @param array $forums_list
     * @param int $selected_forum
     * @return array
     */
    public function get_allowed_forums_list($forums_list, $selected_forum = 0)
    {
        $group_list = $this->get_groups_list($forums_list);
        foreach ($group_list as $group)
        {
            $gated_forum_list[$group['map_id']] = true;
        }
        // пока не нашел как обойтись без $vbulletin->bf_misc_forumoptions['allowposting']
        global $vbulletin;
        $allowed_forum_list = array();
        // собираем список форумов, а так же их предков
        foreach ($vbulletin->forumcache as $forum_id=>$forum_info)
        {
            if ($forum_info['link'])
            {
                continue;
            }
            if (!($forum_info['options'] & $vbulletin->bf_misc_forumoptions['allowposting']) )
            {
                continue;
            }
            if(( $selected_forum != $forum_id) AND array_key_exists( $forum_id, $gated_forum_list ) )
            {
                continue;
            }
            $parent_list = explode(',', $forum_info['parentlist']);
            foreach ($parent_list as $parent_id)
            {
                $allowed_forum_list[(int)$parent_id] = true;
            }

        }
        // ключь -1, флаг что продителей в ряду больше не будет, один для всех
        // записей форумов
        unset ($allowed_forum_list[-1]);
        $result = array();
        // формируем массив выдачи
        // @todo возможно имеет смысл убрать его за пределы этого метода
        foreach ($vbulletin->forumcache as $forum_id=>$forum_info)
        {
            if (array_key_exists( $forum_id, $allowed_forum_list ))
            {
                $result[$forum_id] = construct_depth_mark($forum_info['depth'] + 1, '--', $startdepth);
                $result[$forum_id] .= ' ' . $forum_info['title'];
            }
        }

        return $result;
    }

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
     * Получить список доступных для группы пользователей
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

