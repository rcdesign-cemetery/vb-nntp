<?php
require_once DIR . '/includes/class_nntpgate_index_base.php';

/**
 *
 */
class NNTPGate_Forum_Index extends NNTPGate_Index_Base
{
    /**
     * тип сообщения
     */
    const MESSAGE_TYPE = 'forum';

    /**
     * Формируем заголовок сообщений, на основе заголовка треда
     *
     * @access protected 
     * @global array $vbphrase
     * @param string $threadtitle
     * @param string $prefixid
     */
    protected function _make_message_title($threadtitle = '', $prefixid = '')
    {
        global $vbphrase;
        if( is_null($prefixid) OR empty($threadtitle))
        {
            $sql = "SELECT
                        `prefixid`, `title`
                    FROM
                        `" . TABLE_PREFIX . "thread`
                    WHERE
                        `threadid` = " . $this->_parent_id;
            $row = $this->_db->query_first($sql);
            if( !empty( $row ) )
            {
                $prefixid = $row['prefixid'];
                $threadtitle = $row['title'];
            }
        }

        $prefix = '';
        if( !empty( $prefixid ) )
        {
            $prefixid = 'prefix_' . $prefixid . '_title_plain';
            $prefix   = $vbphrase["$prefixid"] . ' ';
        }
        $this->_title = $prefix . $threadtitle;
    }
    

    /**
     * Формирует(но не сохраняет) тело сообщения
     *
     * @param array $post
     * @global vB_Registry $vbulletin
     * @return string
     */
    protected function _make_message_body($post)
    {
        global $vbulletin, $foruminfo, $threadinfo;
        $message = '';

        if (!intval($this->_post_id))
        {
            return $message;
        }
        if (empty($post['pagetext']))
        {
            $post['pagetext'] = $post['message'];
        }
        $post['allowsmilie'] = $post['enablesmilies'];

        // get attachments
        require_once(DIR . '/packages/vbattach/attach.php');
		$attach = new vB_Attach_Display_Content($vbulletin, 'vBForum_Post');
		$postattach = $attach->fetch_postattach(0, $this->_post_id);

        $post['attachments'] = $postattach;
        
        
        $userinfo = fetch_userinfo($post['userid']);
        require_once(DIR . '/includes/class_postbit.php');
        $postbit_factory = new vB_Postbit_Factory();
        $postbit_factory->registry =& $vbulletin;
        $postbit_factory->forum =& $foruminfo;
        $postbit_factory->thread =& $threadinfo;
        $postbit_factory->cache = array();
        $postbit_factory->bbcode_parser = new vB_BbCodeParser($vbulletin, fetch_tag_list());
        $postbit_factory->bbcode_parser->set_parse_userinfo($userinfo);
        $postbit_obj =& $postbit_factory->fetch_postbit('post_nntp');

        $this->_body = $postbit_obj->construct_postbit($post);

        return $this->_body;
    }

    /**
     * Сохраняет новое сообщение в системе nntpgate
     *
     * @return bool
     */
    public function save_message($post)
    {
        if (empty($post['message']) AND empty($post['pagetext']))
        {
            return false;
        }

        $this->_post_id   = $post['postid'];
        $this->_map_id    = $post['forumid'];
        $this->_user_id   = $post['userid'];
        $this->_user_name = $post['username'];
        $this->_parent_id = $post['threadid'];

        $this->_make_message_title($post['title'], $post['prefixid']);
        $this->_make_message_body($post);
        parent::save_message();
    }

    /**
     * Должен быть специфицирован в каждом потомке так как php до версии 5.3
     * не поддерживает конструкции типа get_class($this)::MESSAGE_TYPE
     *
     * @return string
     */
    protected function _get_message_type()
    {
        return self::MESSAGE_TYPE;
    }
}
