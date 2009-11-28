<?php
require_once DIR . '/includes/class_nntpgate_index_base.php';

/**
 *
 */
class NNTPGate_Forum_Index extends NNTPGate_Index_Base
{
    const MESSAGE_TYPE = 'forum';

    /**
     * упразтить в пользу _ref_id
     *
     * @var int
     */
    protected $_thread_id;

    /**
     * уйдет в пользу map_id после рефакторинга базы
     *
     * @var int
     */
    protected $_forum_id = null;


    /**
     *
     * @access public
     * @param array $vbphrase
     * @param string $prefixid
     * @param string $threadtitle
     */
    public function get_message_title($vbphrase, $prefixid = '', $threadtitle = '')
    {
        if( empty($prefixid) OR empty($threadtitle))
        {
            $row = $this->_db->query_first("
                SELECT
                    `prefixid`, `title`
                FROM
                    `" . TABLE_PREFIX . "thread`
                WHERE
                    `threadid` = " . $this->_thread_id . "
                ");

            if( !empty( $row ) )
            {
                $prefixid = $row['prefixid'];
                $threadtitle = $row['title'];
            }
        }

        if( !empty( $prefixid ) )
        {
            $prefixid = 'prefix_' . $prefixid . '_title_plain';
            $prefix   = $vbphrase["$prefixid"] . ' ';
        }
        $this->_title = $prefix . $threadtitle;
    }

    /**
     * Спорное решение, подумать может, можно иначе
     *
     * @access public
     */
    public function delete_message_by_post_id()
    {
        $message_type = $this->_get_message_type();
        $postid_list = array($this->_post_id);
        parent::delete_messages_by_postid_list($this->_db, $message_type, $postid_list);
    }

    /**
     *
     *
     * @access public
     * @param array $value
     */
    public function set_post($value)
    {
        $this->_post = $value;
    }

    /**
     *
     * @access public
     * @param int $value
     */
    public function set_forum_id($value)
    {
        $this->_forum_id = (int)$value;
    }

    /**
     *
     * @access public
     * @param int $value
     */
    public function set_thread_id($value)
    {
        $this->_thread_id = (int)$value;
        $this->set_ref_id($value);
    }

    /**
     * Get message for cache
     *
     * @global vB_Registry $vbulletin
     * @return string
     */
    protected function _get_message_body()
    {
        $message = '';

        if (!intval($this->_post_id))
        {
            return $message;
        }
        // get for attachments
        $attachs = $this->_db->query_read_slave("
    			SELECT dateline, thumbnail_dateline, filename, filesize, visible, attachmentid, counter,
        			IF(thumbnail_filesize > 0, 1, 0) AS hasthumbnail, thumbnail_filesize,
            		attachmenttype.thumbnail AS build_thumbnail, attachmenttype.newwindow
                FROM " . TABLE_PREFIX . "attachment
                LEFT JOIN " . TABLE_PREFIX . "attachmenttype AS attachmenttype USING (extension)
                WHERE postid = $this->_post_id
                ORDER BY attachmentid");
    	while ($attachment = $this->_db->fetch_array($attachs))
        {
            if (!$attachment['build_thumbnail'])
            {
                $attachment['hasthumbnail'] = false;
    		}
            $postattach["$attachment[attachmentid]"] = $attachment;
        }
        global $vbulletin;
        $userinfo = fetch_userinfo($post['userid']);
        $bbcode_parser = & new vB_BbCodeParser($vbulletin, fetch_tag_list($vbulletin->options['bburl'] . '/'));
        $bbcode_parser->set_parse_userinfo($userinfo);
        $this->_post['attachments'] = $postattach;
        $bbcode_parser->printable = true;

        require_once(DIR . '/includes/class_postbit.php');
        $postbit_factory =& new vB_Postbit_Factory();
        $postbit_factory->registry =& $vbulletin;
        $postbit_factory->bbcode_parser = $bbcode_parser;
        $postbit_obj = $postbit_factory->fetch_postbit('external');
        $message = $postbit_obj->construct_postbit($this->_post);
        return $message;
    }

    /**
     *
     * @return int
     */
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

    /**
     * Get message type
     *
     * @return string
     */
    protected function _get_message_type()
    {
        return self::MESSAGE_TYPE;
    }
}